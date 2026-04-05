import type { AgentConfig } from "../store/types.js";

/** When true, non-image MIME types are included as `input_file` in multimodal turns. */
export function resolvedEnableFileInput(config: AgentConfig): boolean {
  return config.enableFileInput === true;
}

export const DEFAULT_INBOUND_ATTACHMENTS_MAX_MB = 512;

export function resolvedInboundAttachmentsMaxBytes(
  config: AgentConfig,
): number {
  const mb =
    config.inboundAttachmentsMaxMb ?? DEFAULT_INBOUND_ATTACHMENTS_MAX_MB;
  return Math.max(1, mb) * 1024 * 1024;
}
