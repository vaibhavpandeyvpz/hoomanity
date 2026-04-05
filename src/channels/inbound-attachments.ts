import {
  saveInboundAttachment,
  type SavedInboundAttachment,
} from "../attachments/inbound-store.js";

/**
 * Binds agent id and quota for repeated saves under varying Recollect session ids (Slack/WhatsApp).
 */
export class InboundAttachmentSessionContext {
  constructor(
    private readonly agentId: string,
    private readonly maxTotalBytes: number,
  ) {}

  save(
    sessionId: string,
    input: {
      readonly buffer: Buffer;
      readonly originalName: string;
      readonly mimeType: string;
    },
  ): Promise<SavedInboundAttachment> {
    return saveInboundAttachment(this.agentId, sessionId, input, {
      maxTotalBytes: this.maxTotalBytes,
    });
  }
}
