import { describe, expect, it } from "bun:test";
import { WhatsAppWebhookDeduper } from "../../../src/listeners/whatsapp/idempotency";

describe("WhatsAppWebhookDeduper", () => {
  it("rejects duplicate deliveries within the TTL window", () => {
    let now = 1_000;
    const deduper = new WhatsAppWebhookDeduper(1_000, () => now);

    expect(deduper.shouldProcess("wamid.1")).toBe(true);
    expect(deduper.shouldProcess("wamid.1")).toBe(false);

    now += 1_001;
    expect(deduper.shouldProcess("wamid.1")).toBe(true);
  });

  it("allows messages without ids", () => {
    const deduper = new WhatsAppWebhookDeduper();
    expect(deduper.shouldProcess(undefined)).toBe(true);
    expect(deduper.shouldProcess("")).toBe(true);
  });
});
