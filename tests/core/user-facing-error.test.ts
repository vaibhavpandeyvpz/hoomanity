import { describe, expect, it } from "bun:test";
import { toUserFacingErrorMessage } from "../../src/core/user-facing-error";

describe("toUserFacingErrorMessage", () => {
  it("maps ACP auth_required to a friendly retry message", () => {
    const message = toUserFacingErrorMessage({
      code: -32000,
      message: "Authentication required",
    });
    expect(message).toContain("Agent authentication is required");
  });

  it("falls back to the original error text for other failures", () => {
    expect(toUserFacingErrorMessage(new Error("boom"))).toBe("boom");
  });
});
