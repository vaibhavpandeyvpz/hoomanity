export type ConversationKey = string;

export type KnownPlatformName = "slack" | "telegram" | "whatsapp";
export type PlatformName = KnownPlatformName | (string & {});

export type PlatformReplyTarget = {
  platform: PlatformName;
  channelId: string;
  threadTs?: string;
};

export type PlatformPrompt = {
  platform: PlatformName;
  conversationKey: ConversationKey;
  text: string;
  metadata: Record<string, unknown>;
  replyTarget: PlatformReplyTarget;
  receivedAt: number;
  attachments?: import("./attachments").StoredAttachment[];
};
