import type { IdAllowlist } from "../../contracts";
import type { FieldItem } from "./types";

export function formatFieldValue(field: FieldItem): string {
  if (typeof field.value === "boolean") {
    return field.value ? "on" : "off";
  }
  if (field.kind === "secret") {
    return maskSecret(field.value);
  }
  return field.value;
}

export function toOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function toOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

export function toPositiveNumberOrFallback(
  value: string,
  fallback: number,
): number {
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function formatAllowlist(value: IdAllowlist): string {
  return value === "*" ? "*" : value.join(", ");
}

export function parseAllowlistInput(input: string): IdAllowlist {
  const trimmed = input.trim();
  if (!trimmed || trimmed === "*") {
    return "*";
  }
  const out: string[] = [];
  for (const token of trimmed.split(",")) {
    const item = token.trim();
    if (item && !out.includes(item)) {
      out.push(item);
    }
  }
  return out.length > 0 ? out : "*";
}

function maskSecret(value: string | boolean): string {
  if (typeof value !== "string") {
    return "";
  }
  if (!value) {
    return "";
  }
  return "*".repeat(Math.min(12, value.length));
}
