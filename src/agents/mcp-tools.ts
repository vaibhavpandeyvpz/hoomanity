import {
  getAllMcpTools,
  tool,
  type Agent,
  type FunctionTool,
  type MCPServer,
  type RunContext,
  type Tool,
} from "@openai/agents";
import slugify from "slugify";
import type { ApprovalsManager } from "./allowance.js";
import { syntheticToolFailureOutput } from "./synthetic-tool-result.js";

type McpToolCallDetails = Parameters<FunctionTool["invoke"]>[2];

/**
 * `getAllMcpTools` only applies static `toolFilter` when both are truthy; the static branch never
 * reads them (only callable filters receive `{ runContext, agent, serverName }`).
 */
const MCP_LIST_TOOLS_RUN_CONTEXT = {} as RunContext;
const MCP_LIST_TOOLS_AGENT = {} as Agent;

/** Stable prefix segment from MCP server display name (matches `mcp.json` / SDK `name`). */
export function slugifyMcpServerKey(name: string): string {
  const s = slugify(name.trim(), {
    replacement: "_",
    lower: true,
    strict: true,
  });
  return s.length > 0 ? s : "mcp";
}

function prefixedMcpToolName(serverKey: string, toolName: string): string {
  return `${slugifyMcpServerKey(serverKey)}_${toolName}`;
}

function wrapFunctionToolWithTimeout(
  t: FunctionTool,
  exposedName: string,
  timeoutMs: number,
  approvals: ApprovalsManager,
  agent: () => Agent,
): FunctionTool {
  return tool({
    name: exposedName,
    description: t.description,
    parameters: t.parameters,
    strict: t.strict,
    deferLoading: t.deferLoading,
    execute: async (
      input: unknown,
      runContext: RunContext | undefined,
      details?: McpToolCallDetails,
    ) => {
      if (!runContext) {
        throw new Error("MCP tool invoked without run context");
      }
      const payload =
        typeof input === "string"
          ? input
          : input == null
            ? ""
            : JSON.stringify(input);
      try {
        return await t.invoke(runContext, payload, details);
      } catch (err) {
        return syntheticToolFailureOutput(exposedName, err);
      }
    },
    needsApproval: async (
      runContext: RunContext,
      input: unknown,
      callId?: string,
    ): Promise<boolean> =>
      approvals.evaluateNeedsApproval(
        runContext,
        exposedName,
        input,
        callId,
        agent(),
      ),
    isEnabled: t.isEnabled,
    timeoutMs,
    inputGuardrails: t.inputGuardrails,
    outputGuardrails: t.outputGuardrails,
  } as unknown as Parameters<typeof tool>[0]);
}

/**
 * MCP tools as function tools with per-invocation timeout and human approval (unless allow-listed).
 */
export async function mcpServersToTimedTools(
  servers: MCPServer[],
  toolCallTimeoutMs: number,
  approvals: ApprovalsManager,
  agent: () => Agent,
): Promise<Tool[]> {
  const out: Tool[] = [];
  for (let i = 0; i < servers.length; i++) {
    const server = servers[i]!;
    const serverKey = server.name?.trim() || `mcp_${i}`;
    const batch = await getAllMcpTools({
      mcpServers: [server],
      runContext: MCP_LIST_TOOLS_RUN_CONTEXT,
      agent: MCP_LIST_TOOLS_AGENT,
    });
    for (const x of batch) {
      if (x.type !== "function") {
        out.push(x);
        continue;
      }
      const fn = x as FunctionTool;
      const exposed = prefixedMcpToolName(serverKey, fn.name);
      out.push(
        wrapFunctionToolWithTimeout(
          fn,
          exposed,
          toolCallTimeoutMs,
          approvals,
          agent,
        ),
      );
    }
  }
  return out;
}
