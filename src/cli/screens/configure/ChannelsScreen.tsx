import { useCallback, useEffect, useState, type FC } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import {
  read as readConfig,
  write as writeConfig,
} from "../../../store/agent-config.js";
import { HoomanBanner } from "../../ui/HoomanBanner.js";
import { theme } from "../../ui/theme.js";
import { KeyHints } from "../../ui/KeyHints.js";
import type { AgentConfig } from "../../../store/types.js";
import { formatCliErrorBrief } from "../../error-format.js";

type Props = {
  agentId: string;
  onBack: () => void;
};

type Step =
  | "loading"
  | "menu"
  | "slack-menu"
  | "slack-token"
  | "slack-secret"
  | "slack-app-token"
  | "slack-user-token"
  | "whatsapp-menu"
  | "whatsapp-session"
  | "error";

export const ChannelsScreen: FC<Props> = ({ agentId, onBack }) => {
  const [step, setStep] = useState<Step>("loading");
  const [cfg, setCfg] = useState<AgentConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const reload = useCallback(async () => {
    setError(null);
    try {
      const c = await readConfig(agentId);
      setCfg(c);
      setStep("menu");
    } catch (e) {
      setError(formatCliErrorBrief(e));
      setStep("error");
    }
  }, [agentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        process.exit(0);
      }
      if (key.escape) {
        if (step === "menu" || step === "error") {
          onBack();
        } else if (step === "slack-menu" || step === "whatsapp-menu") {
          setStep("menu");
        } else {
          setDraft("");
          if (step.startsWith("slack-")) setStep("slack-menu");
          else if (step.startsWith("whatsapp-")) setStep("whatsapp-menu");
        }
      }
    },
    { isActive: true },
  );

  const persist = async (next: AgentConfig): Promise<boolean> => {
    setError(null);
    try {
      await writeConfig(agentId, next);
      setCfg(next);
      return true;
    } catch (e) {
      setError(formatCliErrorBrief(e));
      return false;
    }
  };

  if (step === "loading") {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="configure · channels" />
        <Text dimColor>Loading agent configuration…</Text>
      </Box>
    );
  }
  if (step === "error" || !cfg) {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="configure · channels" />
        <Text color={theme.error}>
          Could not load channels: {error ?? "Unknown error"}
        </Text>
        <Box marginTop={1}>
          <KeyHints mode="back_quit" />
        </Box>
      </Box>
    );
  }

  if (step === "menu") {
    const slackStatus = cfg.slack ? "Configured" : "Not configured";
    const whatsappStatus = cfg.whatsapp ? "Configured" : "Not configured";

    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="configure · channels" />
        <Text bold>Communication Channels</Text>
        <Text color={theme.dim}>Agent: {agentId}</Text>
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: `Slack — ${slackStatus}`, value: "slack" },
              { label: `WhatsApp — ${whatsappStatus}`, value: "whatsapp" },
              { label: "Back", value: "back" },
            ]}
            onSelect={(item) => {
              if (item.value === "back") onBack();
              else if (item.value === "slack") setStep("slack-menu");
              else if (item.value === "whatsapp") setStep("whatsapp-menu");
            }}
          />
        </Box>
        <KeyHints mode="back_quit" />
      </Box>
    );
  }

  if (step === "slack-menu") {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="configure · slack" />
        <Text bold>Slack Configuration</Text>
        {error ? (
          <Box marginTop={1}>
            <Text color={theme.error}>{error}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <SelectInput
            items={[
              {
                label: `User token (xoxp-...) — ${cfg.slack?.userToken?.trim() ? "set" : "not set"}`,
                value: "user-token",
              },
              {
                label: `Bot token (xoxb-...) — ${cfg.slack?.token?.trim() ? "set" : "not set"}`,
                value: "token",
              },
              { label: "Signing Secret", value: "secret" },
              { label: "App-Level Token (xapp-...)", value: "app-token" },
              { label: "Back", value: "back" },
            ]}
            onSelect={(item) => {
              if (item.value === "back") setStep("menu");
              else if (item.value === "user-token") {
                setDraft(cfg.slack?.userToken || "");
                setStep("slack-user-token");
              } else if (item.value === "token") {
                setDraft(cfg.slack?.token || "");
                setStep("slack-token");
              } else if (item.value === "secret") {
                setDraft(cfg.slack?.signingSecret || "");
                setStep("slack-secret");
              } else if (item.value === "app-token") {
                setDraft(cfg.slack?.appToken || "");
                setStep("slack-app-token");
              }
            }}
          />
        </Box>
      </Box>
    );
  }

  if (step === "slack-token") {
    return (
      <Box flexDirection="column">
        <Text bold>Slack bot token (optional)</Text>
        <Text dimColor>
          Format: xoxb-... Leave empty for user-token-only mode. If you set a
          bot token, a user token is required (same menu).
        </Text>
        {error ? (
          <Box marginTop={1}>
            <Text color={theme.error}>{error}</Text>
          </Box>
        ) : null}
        <TextInput
          value={draft}
          onChange={setDraft}
          onSubmit={async (v) => {
            const next = {
              ...cfg,
              slack: {
                ...cfg.slack!,
                token: v.trim(),
                signingSecret: cfg.slack?.signingSecret || "",
                appToken: cfg.slack?.appToken || "",
              },
            };
            if (await persist(next)) {
              setStep("slack-menu");
            }
          }}
        />
      </Box>
    );
  }

  if (step === "slack-secret") {
    return (
      <Box flexDirection="column">
        <Text bold>Slack Signing Secret</Text>
        {error ? (
          <Box marginTop={1}>
            <Text color={theme.error}>{error}</Text>
          </Box>
        ) : null}
        <TextInput
          value={draft}
          onChange={setDraft}
          onSubmit={async (v) => {
            const next = {
              ...cfg,
              slack: {
                ...cfg.slack!,
                signingSecret: v,
                token: cfg.slack?.token || "",
                appToken: cfg.slack?.appToken || "",
              },
            };
            if (await persist(next)) {
              setStep("slack-menu");
            }
          }}
        />
      </Box>
    );
  }

  if (step === "slack-app-token") {
    return (
      <Box flexDirection="column">
        <Text bold>Slack App-Level Token</Text>
        <Text dimColor>
          App-level token with Socket Mode enabled (Bolt always connects via
          Socket Mode). Format: xapp-...
        </Text>
        {error ? (
          <Box marginTop={1}>
            <Text color={theme.error}>{error}</Text>
          </Box>
        ) : null}
        <TextInput
          value={draft}
          onChange={setDraft}
          onSubmit={async (v) => {
            const next = {
              ...cfg,
              slack: {
                ...cfg.slack!,
                appToken: v,
                token: cfg.slack?.token || "",
                signingSecret: cfg.slack?.signingSecret || "",
              },
            };
            if (await persist(next)) {
              setStep("slack-menu");
            }
          }}
        />
      </Box>
    );
  }

  if (step === "slack-user-token") {
    return (
      <Box flexDirection="column">
        <Text bold>Slack user token</Text>
        <Text dimColor>
          User OAuth token (xoxp-...). Use alone for Bolt + API + files, or
          together with a bot token (bot posts as the app; user token is still
          required for file access). Submit empty to clear only if you are not
          using a bot token.
        </Text>
        {error ? (
          <Box marginTop={1}>
            <Text color={theme.error}>{error}</Text>
          </Box>
        ) : null}
        <TextInput
          value={draft}
          onChange={setDraft}
          onSubmit={async (v) => {
            const trimmed = v.trim();
            const base = {
              token: (cfg.slack?.token ?? "").trim(),
              signingSecret: cfg.slack?.signingSecret || "",
              appToken: cfg.slack?.appToken || "",
            };
            const next = {
              ...cfg,
              slack: trimmed
                ? { ...base, userToken: trimmed }
                : { ...base, userToken: "" },
            };
            if (await persist(next)) {
              setStep("slack-menu");
            }
          }}
        />
      </Box>
    );
  }

  if (step === "whatsapp-menu") {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="configure · whatsapp" />
        <Text bold>WhatsApp Configuration</Text>
        <Box marginTop={1}>
          <SelectInput
            items={[
              {
                label: `Session Name — ${cfg.whatsapp?.sessionName || "default"}`,
                value: "session",
              },
              { label: "Back", value: "back" },
            ]}
            onSelect={(item) => {
              if (item.value === "back") setStep("menu");
              else if (item.value === "session") {
                setDraft(cfg.whatsapp?.sessionName || "default");
                setStep("whatsapp-session");
              }
            }}
          />
        </Box>
      </Box>
    );
  }

  if (step === "whatsapp-session") {
    return (
      <Box flexDirection="column">
        <Text bold>WhatsApp Session Name</Text>
        <Text dimColor>Used for local session storage identification.</Text>
        {error ? (
          <Box marginTop={1}>
            <Text color={theme.error}>{error}</Text>
          </Box>
        ) : null}
        <TextInput
          value={draft}
          onChange={setDraft}
          onSubmit={async (v) => {
            const next = { ...cfg, whatsapp: { sessionName: v || "default" } };
            if (await persist(next)) {
              setStep("whatsapp-menu");
            }
          }}
        />
      </Box>
    );
  }

  return null;
};
