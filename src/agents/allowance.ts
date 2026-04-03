import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Agent } from "@openai/agents";
import { RunToolApprovalItem, type RunContext } from "@openai/agents";
import { z } from "zod";
import { agentToolsPath } from "../utils/path-helpers.js";

const ToolsAllowanceFileSchema = z
  .object({
    allowed: z.array(z.string()).default([]),
  })
  .strict();

export type ToolsAllowanceFile = z.infer<typeof ToolsAllowanceFileSchema>;

export type McpApprovalChoice = "allow" | "allow_always" | "deny";

export type McpApprovalPrompt = (info: {
  toolName: string;
  input: unknown;
  callId: string | undefined;
}) => Promise<McpApprovalChoice>;

function buildSyntheticApprovalItem(
  toolName: string,
  input: unknown,
  callId: string | undefined,
  agent: Agent,
): RunToolApprovalItem {
  const args =
    typeof input === "string"
      ? input
      : input == null
        ? "{}"
        : JSON.stringify(input);
  return new RunToolApprovalItem(
    {
      type: "function_call",
      name: toolName,
      callId: callId ?? "",
      arguments: args,
    },
    agent,
    toolName,
  );
}

/**
 * Loads `tools.json` for an agent, persists “always allow” tool names, and drives MCP
 * {@link needsApproval} via {@link evaluateNeedsApproval}.
 */
export class ApprovalsManager {
  private readonly filePath: string;
  private readonly allowedNames: Set<string>;
  private promptHandler: McpApprovalPrompt | null = null;

  private constructor(filePath: string, allowedNames: Iterable<string>) {
    this.filePath = filePath;
    this.allowedNames = new Set(allowedNames);
  }

  static async open(agentId: string): Promise<ApprovalsManager> {
    const filePath = agentToolsPath(agentId);
    let allowed: string[] = [];
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      allowed = ToolsAllowanceFileSchema.parse(parsed).allowed;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") {
        throw e;
      }
    }
    return new ApprovalsManager(filePath, allowed);
  }

  setPromptHandler(handler: McpApprovalPrompt | null): void {
    this.promptHandler = handler;
  }

  /** True if the tool is on the persisted always-allow list. */
  isAllowed(toolName: string): boolean {
    return this.allowedNames.has(toolName);
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const body: ToolsAllowanceFile = {
      allowed: [...this.allowedNames].sort(),
    };
    await writeFile(
      this.filePath,
      `${JSON.stringify(body, null, 2)}\n`,
      "utf8",
    );
  }

  /** Add a tool name to always-allow and write `tools.json`. */
  async grantAlways(toolName: string): Promise<void> {
    if (this.allowedNames.has(toolName)) {
      return;
    }
    this.allowedNames.add(toolName);
    await this.persist();
  }

  /**
   * Implements OpenAI Agents {@link FunctionTool} `needsApproval` contract:
   * - `false` → run the tool (no approval gate).
   * - `true` → use approval state; call {@link RunContext.rejectTool} before returning when denying.
   */
  async evaluateNeedsApproval(
    runContext: RunContext,
    toolName: string,
    input: unknown,
    callId: string | undefined,
    agent: Agent,
  ): Promise<boolean> {
    if (this.isAllowed(toolName)) {
      return false;
    }

    const deny = (): boolean => {
      if (agent) {
        runContext.rejectTool(
          buildSyntheticApprovalItem(toolName, input, callId, agent),
          { message: "User denied this tool call." },
        );
      }
      return true;
    };

    if (!this.promptHandler) {
      return deny();
    }

    const choice = await this.promptHandler({ toolName, input, callId });
    if (choice === "allow_always") {
      await this.grantAlways(toolName);
      return false;
    }
    if (choice === "allow") {
      return false;
    }
    return deny();
  }
}
