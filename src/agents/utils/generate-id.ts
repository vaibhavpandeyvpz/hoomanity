import { randomInt } from "node:crypto";

/**
 * Uppercase A–Z and 2–9, excluding ambiguous I, O, 0, and 1 (common for human-readable codes).
 */
const ALNUM = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" as const;

export function generateId(length: number, charset: string = ALNUM): string {
  if (length < 1) {
    throw new Error("generateId: length must be at least 1");
  }
  if (charset.length === 0) {
    throw new Error("generateId: charset must be non-empty");
  }
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += charset[randomInt(charset.length)]!;
  }
  return out;
}
