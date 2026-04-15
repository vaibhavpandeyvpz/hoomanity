import { log } from "./logger";

export async function failSafe(input: {
  scope: string;
  action: string;
  fn: () => void | Promise<void>;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await input.fn();
  } catch (error) {
    log.warn(`failed to ${input.action}`, {
      scope: input.scope,
      ...input.metadata,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
