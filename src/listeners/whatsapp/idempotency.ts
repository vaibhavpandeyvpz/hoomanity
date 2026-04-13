/**
 * Best-effort in-memory webhook dedupe for repeated WhatsApp deliveries.
 * Covers process-local retries; restarting the process clears the cache.
 */
export class WhatsAppWebhookDeduper {
  private readonly seenUntil = new Map<string, number>();

  constructor(
    private readonly ttlMs: number = 6 * 60 * 60 * 1000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  shouldProcess(messageId: string | undefined): boolean {
    const id = messageId?.trim();
    if (!id) {
      return true;
    }

    const now = this.now();
    this.gc(now);

    const seenUntil = this.seenUntil.get(id);
    if (seenUntil && seenUntil > now) {
      return false;
    }

    this.seenUntil.set(id, now + this.ttlMs);
    return true;
  }

  private gc(now: number): void {
    for (const [id, seenUntil] of this.seenUntil.entries()) {
      if (seenUntil <= now) {
        this.seenUntil.delete(id);
      }
    }
  }
}
