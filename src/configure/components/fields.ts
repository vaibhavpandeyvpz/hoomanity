import type { IdAllowlist } from "../../contracts";
import type { FieldItem } from "./types";
import { formatAllowlist, parseAllowlistInput } from "./format";

export function fieldText(
  id: string,
  label: string,
  value: string,
  commit: (value: string) => void,
): FieldItem {
  return {
    id,
    label,
    kind: "text",
    value,
    commit,
  };
}

export function fieldSecret(
  id: string,
  label: string,
  value: string,
  commit: (value: string) => void,
): FieldItem {
  return {
    id,
    label,
    kind: "secret",
    value,
    commit,
  };
}

export function fieldNumber(
  id: string,
  label: string,
  value: number | undefined,
  commit: (value: string) => void,
): FieldItem {
  return {
    id,
    label,
    kind: "number",
    value: value == null ? "" : String(value),
    commit,
  };
}

export function fieldBoolean(
  id: string,
  label: string,
  value: boolean,
  toggle: () => void,
): FieldItem {
  return {
    id,
    label,
    kind: "boolean",
    value,
    toggle,
  };
}

export function fieldReadonly(
  id: string,
  label: string,
  value: string,
): FieldItem {
  return {
    id,
    label,
    kind: "readonly",
    value,
  };
}

export function fieldAllowlist(
  id: string,
  label: string,
  value: IdAllowlist,
  setValue: (next: IdAllowlist) => void,
  editorPlaceholder = "* or comma-separated ids",
): FieldItem {
  return {
    id,
    label,
    kind: "allowlist",
    value: formatAllowlist(value),
    commit: (input) => setValue(parseAllowlistInput(input)),
    editorPlaceholder,
  };
}
