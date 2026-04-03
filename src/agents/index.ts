import { Agent, type MCPServer, type Tool } from "@openai/agents";
import type { ApprovalsManager } from "./allowance.js";
import type { CreateForAgentOptions } from "../mcp/manager.js";
import { read as readConfig } from "./config.js";
import { read as readInstructions } from "./instructions.js";
import { mcpServersToTimedTools } from "./mcp-tools.js";
import { resolvedAgentTimeouts } from "./timeouts.js";
import { create as createLlmModel } from "../providers/factory.js";
import type { LlmProviderRegistry } from "../providers/registry.js";
import { createReadSkillFileTool } from "../tools/read-skill-file.js";
import { buildAgentIdentityInstructionsAppendix } from "./agent-identity-prompt.js";
import { buildOperatingGuidelinesInstructionsAppendix } from "./operating-guidelines-appendix.js";
import { buildCapabilityGuidanceInstructionsAppendix } from "../skills/capability-guidance-appendix.js";
import { buildSkillsCliInstructionsAppendix } from "../skills/cli-instructions-appendix.js";
import { createSkillsPrompt } from "../skills/prompt.js";
import {
  AgentContainer,
  type CreateToolsFn,
  type CreateAgentFn,
} from "./utils/container.js";
import { watchAgentAssetsForInvalidation } from "./watch-agent-assets.js";

export type CreateAgentDeps = {
  llmRegistry: LlmProviderRegistry;
  createForAgent: (
    agentId: string,
    options?: CreateForAgentOptions,
  ) => Promise<{ servers: MCPServer[]; close: () => Promise<void> }>;
};

export type CreateAgentOptions = {
  readonly approvals: ApprovalsManager;
};

/**
 * Loads agent config and instructions from disk for {@link agentId}, connects MCP, returns an {@link AgentContainer}.
 */
export async function create(
  deps: CreateAgentDeps,
  agentId: string,
  createOptions: CreateAgentOptions,
): Promise<{
  container: AgentContainer;
  closeMcp: () => Promise<void>;
}> {
  const id = agentId.toUpperCase();

  const createTools: CreateToolsFn = async (agent: () => Agent) => {
    const config = await readConfig(id);
    const timeouts = resolvedAgentTimeouts(config);
    const { servers, close } = await deps.createForAgent(id, {
      connectTimeoutMs: timeouts.mcpConnectTimeoutMs,
      mcpRpcTimeoutMs: timeouts.mcpConnectTimeoutMs,
    });

    const tools: Tool[] =
      servers.length > 0
        ? await mcpServersToTimedTools(
            servers,
            timeouts.toolCallTimeoutMs,
            createOptions.approvals,
            agent,
          )
        : [];

    return { tools, closeMcp: close };
  };

  const createAgent: CreateAgentFn = async (tools) => {
    const config = await readConfig(id);
    const timeouts = resolvedAgentTimeouts(config);
    const model = createLlmModel(deps.llmRegistry, config);
    const readSkillFileTool = createReadSkillFileTool(id, {
      timeoutMs: timeouts.toolCallTimeoutMs,
    });
    const fromFile = (await readInstructions(id)).trim();
    const [
      identityAppendix,
      operatingAppendix,
      skillsCliAppendix,
      capabilityAppendix,
      skillSuffix,
    ] = await Promise.all([
      buildAgentIdentityInstructionsAppendix({
        agentId: id,
        displayName: config.name,
      }),
      buildOperatingGuidelinesInstructionsAppendix(),
      buildSkillsCliInstructionsAppendix(id),
      buildCapabilityGuidanceInstructionsAppendix(),
      createSkillsPrompt(id),
    ]);
    const instructions = [
      fromFile,
      identityAppendix,
      operatingAppendix,
      skillSuffix,
      skillsCliAppendix,
      capabilityAppendix,
    ]
      .filter(Boolean)
      .join("\n\n");

    return new Agent({
      name: config.name,
      instructions,
      model,
      tools: [readSkillFileTool, ...tools],
    });
  };

  const container = new AgentContainer(createTools, createAgent);
  const assetWatcher = watchAgentAssetsForInvalidation(id, () => {
    container.invalidate();
  });

  return {
    container,
    closeMcp: async () => {
      try {
        await assetWatcher.close();
      } finally {
        await container.dispose();
      }
    },
  };
}
