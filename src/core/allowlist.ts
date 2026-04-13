export type IdAllowlist = "*" | string[];

export function isAllowedByAllowlist(
  id: string,
  allowlist: IdAllowlist,
): boolean {
  const normalizedId = id.trim();
  if (!normalizedId) {
    return false;
  }
  if (allowlist === "*") {
    return true;
  }
  return allowlist.includes(normalizedId);
}
