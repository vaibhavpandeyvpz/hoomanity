import { describe, expect, it } from "bun:test";
import { isAllowedByAllowlist } from "../../src/core/allowlist";

describe("isAllowedByAllowlist", () => {
  it("allows every id for wildcard", () => {
    expect(isAllowedByAllowlist("C123", "*")).toBe(true);
  });

  it("matches exact trimmed ids for explicit allowlists", () => {
    expect(isAllowedByAllowlist("C123", ["C123", "C456"])).toBe(true);
    expect(isAllowedByAllowlist(" C456 ", ["C123", "C456"])).toBe(true);
    expect(isAllowedByAllowlist("C999", ["C123", "C456"])).toBe(false);
  });
});
