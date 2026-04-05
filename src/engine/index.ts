import { Agent, type MCPServer, type Tool } from "@openai/agents";
import type { ApprovalsManager } from "../store/allowance.js";
import type { CreateForAgentOptions } from "../mcp/manager.js";
import { read as readConfig } from "../store/agent-config.js";
import { read as readInstructions } from "../store/instructions.js";
import { mcpServersToTimedTools } from "../mcp/adapter.js";
import { agentModelSettings } from "./settings.js";
import { resolvedAgentTimeouts } from "./timeouts.js";
import { create as createLlmModel } from "../providers/factory.js";
import type { LlmProviderRegistry } from "../providers/registry.js";
import { createReadSkillFileTool } from "../skills/tool.js";
import { buildAgentIdentityInstructionsAppendix } from "../prompts/identity-builder.js";
import { buildOperatingGuidelinesInstructionsAppendix } from "../prompts/operating-builder.js";
import { buildCapabilityGuidanceInstructionsAppendix } from "../prompts/capability-builder.js";
import { buildResponseSkipInstructionsAppendix } from "../prompts/response-skip-builder.js";
import { buildCliCwdInstructionsAppendix } from "../prompts/cli-cwd-builder.js";
import { buildSkillsCliInstructionsAppendix } from "../prompts/skills-cli-builder.js";
import { createSkillsPrompt } from "../prompts/skills-builder.js";
import {
  AgentContainer,
  type CreateToolsFn,
  type CreateAgentFn,
} from "./container.js";
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
  /** When set (CLI channel), appended to combined static instructions. */
  readonly cliWorkingDirectory?: string;
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
    const cliCwdAppendix = createOptions.cliWorkingDirectory
      ? buildCliCwdInstructionsAppendix(createOptions.cliWorkingDirectory)
      : "";
    const [
      identityAppendix,
      operatingAppendix,
      responseSkipAppendix,
      skillsCliAppendix,
      capabilityAppendix,
      skillSuffix,
    ] = await Promise.all([
      buildAgentIdentityInstructionsAppendix({
        agentId: id,
        displayName: config.name,
      }),
      buildOperatingGuidelinesInstructionsAppendix(),
      buildResponseSkipInstructionsAppendix(),
      buildSkillsCliInstructionsAppendix(id),
      buildCapabilityGuidanceInstructionsAppendix(),
      createSkillsPrompt(id),
    ]);
    const instructions = [
      fromFile,
      identityAppendix,
      operatingAppendix,
      cliCwdAppendix,
      responseSkipAppendix,
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
      modelSettings: agentModelSettings(config),
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
