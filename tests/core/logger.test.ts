import { describe, expect, it } from "bun:test";
import { redactMetadata } from "../../src/core/logger";

describe("redactMetadata", () => {
  it("redacts sensitive keys and bearer tokens", () => {
    const value = redactMetadata({
      access_token: "secret-token",
      headers: {
        Authorization: "Bearer abc123",
      },
    }) as {
      access_token: string;
      headers: { Authorization: string };
    };

    expect(value.access_token).toBe("[REDACTED]");
    expect(value.headers.Authorization).toBe("[REDACTED]");
  });

  it("redacts attachment paths inside plain strings", () => {
    const value = redactMetadata({
      path: "/Users/vpz/.hooman/attachments/123-file.png",
      note: "Saved at /Users/vpz/.hooman/attachments/123-file.png",
    }) as { path: string; note: string };

    expect(value.path).toBe("~/.hooman/attachments/[REDACTED]");
    expect(value.note).toContain("~/.hooman/attachments/[REDACTED]");
  });
});
