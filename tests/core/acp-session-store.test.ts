import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AcpSessionStore } from "../../src/core/acp-session-store";

describe("AcpSessionStore", () => {
  it("round-trips persisted sessions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hoomanity-acp-store-"));
    try {
      const path = join(dir, "sessions.json");
      const store = new AcpSessionStore(path);
      await store.upsert("slack:C1", {
        sessionId: "s-1",
        cwd: "/workspace",
        updatedAt: 42,
      });
      const again = new AcpSessionStore(path);
      const all = await again.readAll();
      expect(all.get("slack:C1")).toEqual({
        sessionId: "s-1",
        cwd: "/workspace",
        updatedAt: 42,
      });
      const raw = await readFile(path, "utf8");
      expect(raw).toContain('"v": 1');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
