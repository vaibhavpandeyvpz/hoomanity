/** IDE-like sober palette — terminal-safe, high contrast */
export const theme = {
  // Main structural colors
  border: "gray" as const,
  headerBg: "white" as const,
  headerText: "black" as const,

  // Accents
  accentPrimary: "cyan" as const,
  accentSecondary: "blue" as const,

  // Statuses
  success: "green" as const,
  warning: "yellow" as const,
  error: "red" as const,

  // Typography
  text: "white" as const,
  dim: "gray" as const,

  // Roles
  user: "cyan" as const,
  agent: "white" as const,
  tool: "gray" as const,
};
