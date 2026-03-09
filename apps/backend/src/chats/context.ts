import { join } from "path";
import { generateText } from "ai";
import Tokenizer, { models } from "ai-tokenizer";
import * as encoding from "ai-tokenizer/encoding";
import {
  MemoryLayer,
  createSQLiteStorageAdapter,
  type SummaryRequest,
} from "@one710/recollect";
import type { ModelMessage } from "ai";
import type { ChatHistoryStore } from "./chat-history.js";
import { getConfig } from "../config.js";
import { getHoomanModel } from "../agents/model-provider.js";
import { WORKSPACE_ROOT } from "../utils/workspace.js";

/** Returns a token counter for the given provider/model; uses o200k_base if model is unknown. */
function createTokenCounter(
  provider: string,
  model: string,
): (msg: Record<string, unknown>) => number {
  const modelKey = `${provider}/${model}` as keyof typeof models;
  const aiModel = models[modelKey];
  const enc =
    (aiModel && (encoding as Record<string, unknown>)[aiModel.encoding]) ??
    encoding.o200k_base;
  const tokenizer = new Tokenizer(
    enc as ConstructorParameters<typeof Tokenizer>[0],
  );
  return (msg: Record<string, unknown>) => tokenizer.count(JSON.stringify(msg));
}

/** Returns a summarizer that uses the given model for summary generation. */
function createSummarizer(
  model: Parameters<typeof generateText>[0]["model"],
): (input: SummaryRequest) => Promise<string> {
  return async (input: SummaryRequest): Promise<string> => {
    const { text } = await generateText({
      model,
      system: input.instructions,
      prompt: input.summaryPrompt,
    });
    return text ?? "";
  };
}

/** Render a message as text for the summarizer (role + content snapshot). */
function renderMessage(msg: Record<string, unknown>): string {
  const role = msg.role ?? "unknown";
  const content = msg.content;
  if (typeof content === "string") return `[${role}]: ${content}`;
  if (Array.isArray(content)) {
    const parts = content.map((p: unknown) => {
      const q = p as Record<string, unknown>;
      if (q?.type === "text" && typeof q.text === "string") return q.text;
      if (q?.type === "reasoning") return "[reasoning]";
      if (q?.type === "tool-call" || q?.type === "tool_call")
        return `[tool: ${String(q.toolName ?? q.name ?? "?")}]`;
      if (q?.type === "tool-result" || q?.type === "tool_result")
        return `[tool result: ${String(q.toolName ?? q.name ?? "?")}]`;
      return JSON.stringify(p);
    });
    return `[${role}]: ${parts.join(" ")}`;
  }
  return `[${role}]: ${JSON.stringify(content)}`;
}

export interface ContextStore {
  /** Persist one user/assistant turn to chat history only (for UI). Use with addTurnToAgentThread when storing full AI SDK messages in memory. */
  addTurnToChatHistory(
    userId: string,
    userText: string,
    assistantText: string,
    options?: {
      userAttachments?: string[];
      approvalRequest?: { toolName: string; argsPreview: string };
    },
  ): Promise<void>;
  /** Persist a full turn as AI SDK messages (includes tool calls, tool results, etc.). Use when available. Call addTurnToChatHistory too so the UI has the turn. */
  addTurnToAgentThread(userId: string, messages: ModelMessage[]): Promise<void>;
  /** Token-limited thread for the agent (from recollect; full AI SDK messages when stored with addTurnToAgentThread). */
  getThreadForAgent(userId: string): Promise<ModelMessage[]>;
  /** Clear all messages for the user (chat history and recollect). */
  clearAll(userId: string): Promise<void>;
}

async function createMemoryLayer(): Promise<MemoryLayer> {
  const config = getConfig();
  const maxTokens = config.MAX_INPUT_TOKENS || 100_000;
  const model = getHoomanModel(config);

  const countTokens = createTokenCounter(
    config.LLM_PROVIDER,
    config.CHAT_MODEL,
  );

  const summarize = createSummarizer(model);

  const storage = await createSQLiteStorageAdapter(
    join(WORKSPACE_ROOT, "context.db"),
  );

  return new MemoryLayer({
    maxTokens,
    summarize,
    countTokens,
    renderMessage,
    threshold: 0.75,
    storage,
  });
}

export async function createContext(
  chatHistory: ChatHistoryStore,
): Promise<ContextStore> {
  const memory = await createMemoryLayer();

  return {
    async addTurnToChatHistory(
      userId: string,
      userText: string,
      assistantText: string,
      options?: {
        userAttachments?: string[];
        approvalRequest?: { toolName: string; argsPreview: string };
      },
    ): Promise<void> {
      await chatHistory.addMessage(
        userId,
        "user",
        userText,
        options?.userAttachments,
      );
      await chatHistory.addMessage(
        userId,
        "assistant",
        assistantText,
        undefined,
        options?.approvalRequest,
      );
    },

    async addTurnToAgentThread(
      userId: string,
      messages: ModelMessage[],
    ): Promise<void> {
      if (messages.length === 0) return;
      await memory.addMessages(
        userId,
        messages as unknown as Record<string, unknown>[],
      );
    },

    async getThreadForAgent(userId: string): Promise<ModelMessage[]> {
      const messages = await memory.getMessages(userId);
      return messages.map((msg) => msg as ModelMessage);
    },

    async clearAll(userId: string): Promise<void> {
      await chatHistory.clearAll(userId);
      await memory.clearSession(userId);
    },
  };
}
