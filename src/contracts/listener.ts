import type { McpServer } from "@agentclientprotocol/sdk";

export type RuntimeListener = {
  start: () => Promise<void>;
  stop?: () => Promise<void>;
  mcpServers?: () => McpServer[];
};
