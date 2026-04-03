import type { AgentContainer } from "../agents/utils/container.js";
import {
  create as createAgent,
  type CreateAgentOptions,
} from "../agents/index.js";
import { createForAgent } from "../mcp/manager.js";
import { McpRegistry } from "../mcp/registry.js";
import { SkillsRegistry } from "../skills/registry.js";
import { LlmProviderRegistry } from "../providers/registry.js";

export interface HoomanContainer {
  /** Extensible LLM backends (wizard fields + `create()` in providers/factory). */
  llmRegistry: LlmProviderRegistry;
  /** Create / list / delete skill folders under an agent (Vercel `skills` CLI). */
  skillsRegistry: SkillsRegistry;
  /** CRUD for an agent’s `mcp.json` (stdio and URL MCP servers). */
  mcpRegistry: McpRegistry;
  /** Build an SDK agent from on-disk config + instructions + MCP for {@link agentId}. */
  create: (
    agentId: string,
    options: CreateAgentOptions,
  ) => Promise<{
    container: AgentContainer;
    closeMcp: () => Promise<void>;
  }>;
}

export function createContainer(): HoomanContainer {
  const llmRegistry = new LlmProviderRegistry();
  const skillsRegistry = new SkillsRegistry();
  const mcpRegistry = new McpRegistry();
  const deps = {
    llmRegistry,
    createForAgent,
  };
  return {
    llmRegistry,
    skillsRegistry,
    mcpRegistry,
    create: (agentId: string, options: CreateAgentOptions) =>
      createAgent(deps, agentId, options),
  };
}
