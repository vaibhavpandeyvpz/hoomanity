import { type Agent, type Tool } from "@openai/agents";

export type CloseMcpFn = () => Promise<void>;

export type CreateToolsFn = (
  agent: () => Agent,
) => Promise<{ tools: Tool[]; closeMcp: CloseMcpFn }>;

export type CreateAgentFn = (tools: Tool[]) => Promise<Agent>;

export class AgentContainer {
  private agent: Agent | null = null;
  private closeMcp: CloseMcpFn | null = null;

  private version = 0;
  private previous = -1;

  private building: Promise<void> | null = null;

  constructor(
    private createTools: CreateToolsFn,
    private createAgent: CreateAgentFn,
  ) {}

  /**
   * Call when config changes
   */
  invalidate() {
    this.version++;
  }

  async dispose() {
    await this.closeMcp?.();
  }

  /**
   * Main entry point
   */
  async value(): Promise<Agent> {
    if (this.previous !== this.version) {
      await this.rebuild();
    }

    return this.agent!;
  }

  /**
   * Ensures only one rebuild happens concurrently
   */
  private async rebuild() {
    if (this.building) {
      return this.building;
    }

    this.building = (async () => {
      const previousClose = this.closeMcp;
      this.closeMcp = null;
      await previousClose?.();

      const shell: { current?: Agent } = {};
      const { tools, closeMcp } = await this.createTools(() => shell.current!);
      const agent = await this.createAgent(tools);
      shell.current = agent;

      this.agent = agent;
      this.closeMcp = closeMcp;
      this.previous = this.version;
    })();

    try {
      await this.building;
    } finally {
      this.building = null;
    }
  }
}
