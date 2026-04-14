import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  type Client,
  type ContentBlock,
  type InitializeResponse,
  type McpServer,
  type PromptResponse,
  type RequestPermissionRequest,
  type SessionNotification,
  type SessionUpdate,
} from "@agentclientprotocol/sdk";
import { readFile } from "node:fs/promises";
import type { AgentTransport, TransportConnection } from "./agent-transport";
import type { ApprovalService } from "./approval-service";
import type { CoreEvent, StoredAttachment } from "../contracts";
import { log } from "./logger";

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

type EventSubscriber = (event: CoreEvent) => void | Promise<void>;

export class AcpClient {
  private connection: ClientSideConnection | undefined;
  private transportConnection: TransportConnection | undefined;
  private init: InitializeResponse | undefined;
  /** Session ids that are ready for `prompt` on this transport (after newSession or loadSession). */
  private readonly promptReadySessions = new Set<string>();
  private readonly subscribers = new Set<EventSubscriber>();

  constructor(
    private readonly transport: AgentTransport,
    private readonly approvalService: ApprovalService,
  ) {}

  async connect(): Promise<void> {
    log.info("opening transport", { scope: "acp" });
    this.transportConnection = await this.transport.open();

    this.connection = new ClientSideConnection(
      (_agent) => this.clientHandler,
      this.transportConnection.stream,
    );

    this.init = await this.connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
    });
    log.info("initialized protocol", {
      scope: "acp",
      protocolVersion: this.init.protocolVersion,
    });
  }

  async close(): Promise<void> {
    if (this.transportConnection) {
      log.info("closing transport", { scope: "acp" });
      await this.transportConnection.close();
      this.transportConnection = undefined;
    }
    this.promptReadySessions.clear();
  }

  subscribe(listener: EventSubscriber): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  async newSession(cwd: string, mcpServers: McpServer[] = []): Promise<string> {
    const connection = this.requireConnection();
    log.info("creating new session", {
      scope: "acp",
      cwd,
      mcpServers: mcpServers.length,
    });
    const response = await connection.newSession({
      cwd,
      mcpServers,
    });
    log.info("session created", {
      scope: "acp",
      sessionId: response.sessionId,
    });
    this.promptReadySessions.add(response.sessionId);
    return response.sessionId;
  }

  supportsLoadSession(): boolean {
    return this.init?.agentCapabilities?.loadSession === true;
  }

  /**
   * Prepare a session id restored from disk for prompting (calls `loadSession` when supported).
   */
  async ensurePersistedSessionReady(
    sessionId: string,
    cwd: string,
  ): Promise<void> {
    if (this.promptReadySessions.has(sessionId)) {
      return;
    }
    const connection = this.requireConnection();
    if (this.supportsLoadSession()) {
      log.info("loading persisted session", { scope: "acp", sessionId });
      await connection.loadSession({
        sessionId,
        cwd,
        mcpServers: [],
      });
    } else {
      log.info("reusing persisted session id without loadSession capability", {
        scope: "acp",
        sessionId,
      });
    }
    this.promptReadySessions.add(sessionId);
  }

  async cancelSessionTurn(sessionId: string): Promise<void> {
    const connection = this.requireConnection();
    log.info("sending session cancel", { scope: "acp", sessionId });
    await connection.cancel({ sessionId });
  }

  async prompt(input: {
    sessionId: string;
    text: string;
    metadataJson?: string;
    attachments?: StoredAttachment[];
  }): Promise<PromptResponse> {
    const connection = this.requireConnection();
    log.debug("sending prompt", {
      scope: "acp",
      sessionId: input.sessionId,
      textLength: input.text.length,
      hasMetadata: Boolean(input.metadataJson),
      attachmentCount: input.attachments?.length ?? 0,
    });
    const prompt = await this.buildPromptContentBlocks(input);

    const response = await connection.prompt({
      sessionId: input.sessionId,
      prompt,
    });
    log.info("prompt completed", {
      scope: "acp",
      sessionId: input.sessionId,
      stopReason: response.stopReason,
    });
    return response;
  }

  getCapabilities(): InitializeResponse | undefined {
    return this.init;
  }

  private async buildPromptContentBlocks(input: {
    text: string;
    metadataJson?: string;
    attachments?: StoredAttachment[];
  }): Promise<ContentBlock[]> {
    const blocks: ContentBlock[] = [];
    const trimmed = input.text.trim();
    if (trimmed) {
      blocks.push({ type: "text", text: trimmed });
    }
    if (input.metadataJson) {
      blocks.push({
        type: "text",
        text: `Platform metadata JSON:\n${input.metadataJson}`,
      });
    }

    const agentSupportsImage =
      this.init?.agentCapabilities?.promptCapabilities?.image === true;
    const pathLines: string[] = [];

    for (const att of input.attachments ?? []) {
      const mime = att.mimeType.toLowerCase().split(";")[0].trim();
      const isImage = IMAGE_MIME_TYPES.has(mime);
      if (isImage && agentSupportsImage) {
        try {
          const buf = await readFile(att.localPath);
          const data = buf.toString("base64").replace(/\s/g, "").trim();
          if (data) {
            blocks.push({
              type: "image",
              data,
              mimeType: mime,
            });
          }
        } catch (e) {
          log.warn("failed to read image attachment", {
            scope: "acp",
            path: att.localPath,
            error: e instanceof Error ? e.message : String(e),
          });
          pathLines.push(att.localPath);
        }
      } else {
        if (isImage && !agentSupportsImage) {
          log.warn(
            "agent does not advertise image prompts; sending image path as text only",
            {
              scope: "acp",
              path: att.localPath,
            },
          );
        }
        pathLines.push(att.localPath);
      }
    }

    if (pathLines.length > 0) {
      blocks.push({
        type: "text",
        text: `Files uploaded:\n${pathLines.join("\n")}`,
      });
    }

    if (blocks.length === 0) {
      blocks.push({ type: "text", text: "User sent media." });
    }

    return blocks;
  }

  private requireConnection(): ClientSideConnection {
    if (!this.connection) {
      throw new Error("ACP connection is not initialized.");
    }
    return this.connection;
  }

  private readonly clientHandler: Client = {
    requestPermission: async (params) => this.handleRequestPermission(params),
    sessionUpdate: async (params) => this.handleSessionUpdate(params),
  };

  private async handleRequestPermission(params: RequestPermissionRequest) {
    log.info("permission requested", {
      scope: "acp",
      sessionId: params.sessionId,
      toolCallId: params.toolCall.toolCallId,
      title: params.toolCall.title,
      optionCount: params.options.length,
    });
    const outcome = await this.approvalService.requestApproval({
      sessionId: params.sessionId,
      options: params.options,
      toolCall: params.toolCall,
    });
    log.info("permission resolved", {
      scope: "acp",
      sessionId: params.sessionId,
      toolCallId: params.toolCall.toolCallId,
      outcome: outcome.outcome,
    });
    return { outcome };
  }

  private async handleSessionUpdate(
    params: SessionNotification,
  ): Promise<void> {
    const events = normalizeSessionNotification(params);
    for (const event of events) {
      for (const subscriber of this.subscribers) {
        await subscriber(event);
      }
    }
  }
}

export function normalizeSessionNotification(
  notification: SessionNotification,
): CoreEvent[] {
  const update = notification.update as SessionUpdate;
  const sessionId = notification.sessionId;

  if (
    update.sessionUpdate === "agent_message_chunk" &&
    update.content.type === "text"
  ) {
    return [
      {
        kind: "message_chunk",
        sessionId,
        text: update.content.text,
        raw: notification,
      },
    ];
  }

  if (update.sessionUpdate === "tool_call") {
    return [
      {
        kind: "tool_call",
        sessionId,
        toolCall: update,
        raw: notification,
      },
    ];
  }

  if (update.sessionUpdate === "tool_call_update") {
    return [
      {
        kind: "tool_call_update",
        sessionId,
        toolCall: update,
        raw: notification,
      },
    ];
  }

  return [
    {
      kind: "session_update",
      sessionId,
      raw: notification,
    },
  ];
}
