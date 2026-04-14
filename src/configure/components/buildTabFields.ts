import type { AppConfig } from "../../config";
import type { FieldItem } from "./types";
import type { BuildFieldsInput } from "./types";
import { toOptional, toPositiveNumberOrFallback } from "./format";
import {
  fieldAllowlist,
  fieldBoolean,
  fieldNumber,
  fieldReadonly,
  fieldSecret,
  fieldText,
} from "./fields";

export function buildTabFields(input: BuildFieldsInput): FieldItem[] {
  const { tab, draft, setDraft, authState, startAuth, stopAuth, logout } =
    input;
  const update = (fn: (cfg: AppConfig) => AppConfig) => {
    setDraft((current) => fn(current));
  };
  if (tab === "ACP") {
    return [
      fieldText("acp.cmd", "ACP command", draft.acp.cmd, (value) =>
        update((cfg) => ({ ...cfg, acp: { ...cfg.acp, cmd: value.trim() } })),
      ),
      fieldText("acp.cwd", "ACP working directory", draft.acp.cwd, (value) =>
        update((cfg) => ({ ...cfg, acp: { ...cfg.acp, cwd: value.trim() } })),
      ),
    ];
  }

  if (tab === "Slack") {
    return [
      fieldBoolean("slack.enabled", "Enabled", draft.slack.enabled, () =>
        update((cfg) => ({
          ...cfg,
          slack: { ...cfg.slack, enabled: !cfg.slack.enabled },
        })),
      ),
      fieldSecret(
        "slack.bot_token",
        "Bot token",
        draft.slack.bot_token ?? "",
        (value) =>
          update((cfg) => ({
            ...cfg,
            slack: { ...cfg.slack, bot_token: toOptional(value) },
          })),
      ),
      fieldSecret(
        "slack.app_token",
        "App token",
        draft.slack.app_token ?? "",
        (value) =>
          update((cfg) => ({
            ...cfg,
            slack: { ...cfg.slack, app_token: toOptional(value) },
          })),
      ),
      fieldAllowlist(
        "slack.allowlist",
        "Allowlist",
        draft.slack.allowlist,
        (value) =>
          update((cfg) => ({
            ...cfg,
            slack: { ...cfg.slack, allowlist: value },
          })),
        "* or Slack channel IDs, comma-separated",
      ),
      fieldBoolean(
        "slack.require_mention",
        "Require mention",
        draft.slack.require_mention,
        () =>
          update((cfg) => ({
            ...cfg,
            slack: {
              ...cfg.slack,
              require_mention: !cfg.slack.require_mention,
            },
          })),
      ),
    ];
  }

  if (tab === "WhatsApp") {
    const authAction =
      authState.status === "idle" ||
      authState.status === "error" ||
      authState.status === "disconnected"
        ? "Connect"
        : "Disconnect";
    return [
      fieldBoolean("whatsapp.enabled", "Enabled", draft.whatsapp.enabled, () =>
        update((cfg) => ({
          ...cfg,
          whatsapp: { ...cfg.whatsapp, enabled: !cfg.whatsapp.enabled },
        })),
      ),
      fieldText(
        "whatsapp.session_path",
        "Session path",
        draft.whatsapp.session_path ?? "",
        (value) =>
          update((cfg) => ({
            ...cfg,
            whatsapp: { ...cfg.whatsapp, session_path: toOptional(value) },
          })),
      ),
      fieldText(
        "whatsapp.client_id",
        "Client ID",
        draft.whatsapp.client_id ?? "",
        (value) =>
          update((cfg) => ({
            ...cfg,
            whatsapp: { ...cfg.whatsapp, client_id: toOptional(value) },
          })),
      ),
      fieldText(
        "whatsapp.puppeteer_executable_path",
        "Puppeteer executable",
        draft.whatsapp.puppeteer_executable_path ?? "",
        (value) =>
          update((cfg) => ({
            ...cfg,
            whatsapp: {
              ...cfg.whatsapp,
              puppeteer_executable_path: toOptional(value),
            },
          })),
      ),
      fieldAllowlist(
        "whatsapp.allowlist",
        "Allowlist",
        draft.whatsapp.allowlist,
        (value) =>
          update((cfg) => ({
            ...cfg,
            whatsapp: { ...cfg.whatsapp, allowlist: value },
          })),
        "* or WhatsApp chat IDs, comma-separated",
      ),
      fieldBoolean(
        "whatsapp.require_mention",
        "Require mention",
        draft.whatsapp.require_mention,
        () =>
          update((cfg) => ({
            ...cfg,
            whatsapp: {
              ...cfg.whatsapp,
              require_mention: !cfg.whatsapp.require_mention,
            },
          })),
      ),
      {
        id: "whatsapp.auth_action",
        label: "Authentication",
        kind: "action",
        value: authAction,
        activate: async () => {
          if (
            authState.status === "idle" ||
            authState.status === "error" ||
            authState.status === "disconnected"
          ) {
            await startAuth();
            return;
          }
          await stopAuth();
        },
      },
      ...(authState.status === "ready"
        ? [
            {
              id: "whatsapp.logout_action",
              label: "Log out",
              kind: "action" as const,
              value: "Clear saved session",
              activate: async () => {
                await logout();
              },
            },
          ]
        : []),
      fieldReadonly("whatsapp.status", "Status", authState.status),
      fieldReadonly(
        "whatsapp.phone_number",
        "Phone number",
        authState.details?.phoneNumber ?? "",
      ),
      fieldReadonly(
        "whatsapp.push_name",
        "Display name",
        authState.details?.pushName ?? "",
      ),
      fieldReadonly("whatsapp.wid", "WID", authState.details?.wid ?? ""),
    ];
  }

  if (tab === "Telegram") {
    return [
      fieldBoolean("telegram.enabled", "Enabled", draft.telegram.enabled, () =>
        update((cfg) => ({
          ...cfg,
          telegram: { ...cfg.telegram, enabled: !cfg.telegram.enabled },
        })),
      ),
      fieldSecret(
        "telegram.bot_token",
        "Bot token",
        draft.telegram.bot_token ?? "",
        (value) =>
          update((cfg) => ({
            ...cfg,
            telegram: { ...cfg.telegram, bot_token: toOptional(value) },
          })),
      ),
      fieldAllowlist(
        "telegram.allowlist",
        "Allowlist",
        draft.telegram.allowlist,
        (value) =>
          update((cfg) => ({
            ...cfg,
            telegram: { ...cfg.telegram, allowlist: value },
          })),
        "* or Telegram chat IDs, comma-separated",
      ),
      fieldBoolean(
        "telegram.require_mention",
        "Require mention",
        draft.telegram.require_mention,
        () =>
          update((cfg) => ({
            ...cfg,
            telegram: {
              ...cfg.telegram,
              require_mention: !cfg.telegram.require_mention,
            },
          })),
      ),
    ];
  }

  return [
    fieldNumber(
      "approvals.timeout_ms",
      "Approval timeout (ms)",
      draft.approvals.timeout_ms,
      (value) =>
        update((cfg) => ({
          ...cfg,
          approvals: {
            timeout_ms: toPositiveNumberOrFallback(
              value,
              cfg.approvals.timeout_ms,
            ),
          },
        })),
    ),
  ];
}
