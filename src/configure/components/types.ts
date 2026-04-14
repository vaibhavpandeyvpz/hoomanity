import type { AppConfig } from "../../config";
import type { WhatsAppAuthState } from "../whatsapp-auth";

export type ConfigureTab = "ACP" | "Slack" | "Telegram" | "WhatsApp" | "Other";

export type FieldKind =
  | "text"
  | "secret"
  | "number"
  | "allowlist"
  | "boolean"
  | "action"
  | "readonly";

export type FieldItem = {
  id: string;
  label: string;
  kind: FieldKind;
  value: string | boolean;
  helper?: string;
  /** Shown in grey when the inline editor value is empty (ink-text-input). */
  editorPlaceholder?: string;
  commit?: (value: string) => void;
  toggle?: () => void;
  activate?: () => void;
};

export const TAB_ORDER: ConfigureTab[] = [
  "ACP",
  "Slack",
  "Telegram",
  "WhatsApp",
  "Other",
];

export type BuildFieldsInput = {
  tab: ConfigureTab;
  draft: AppConfig;
  setDraft: (updater: (current: AppConfig) => AppConfig) => void;
  authState: WhatsAppAuthState;
  startAuth: () => Promise<void>;
  stopAuth: () => Promise<void>;
  logout: () => Promise<void>;
};
