import { describe, expect, it } from "bun:test";
import { TurnQueue, TurnQueueDroppedError } from "../../src/core/turn-queue";

describe("TurnQueue", () => {
  it("processes jobs in sequence per conversation key", async () => {
    const queue = new TurnQueue();
    const order: string[] = [];

    const first = queue.enqueue("slack:C1", async () => {
      order.push("first:start");
      await Bun.sleep(20);
      order.push("first:end");
      return "first";
    });

    const second = queue.enqueue("slack:C1", async () => {
      order.push("second:start");
      order.push("second:end");
      return "second";
    });

    await Promise.all([first, second]);
    expect(order).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });

  it("dropPending rejects queued jobs behind an in-flight turn", async () => {
    const queue = new TurnQueue();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = queue.enqueue("slack:C1", async () => {
      await gate;
      return "first";
    });

    const second = queue.enqueue("slack:C1", async () => "second");
    await Promise.resolve();
    queue.dropPending("slack:C1");

    await expect(second).rejects.toBeInstanceOf(TurnQueueDroppedError);
    release();
    expect(await first).toBe("first");
  });
});
