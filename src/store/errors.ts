export class AgentNotFoundError extends Error {
  constructor(readonly agentId: string) {
    super(`Unknown agent: ${agentId}`);
    this.name = "AgentNotFoundError";
  }
}

export class RegistryCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryCorruptError";
  }
}
