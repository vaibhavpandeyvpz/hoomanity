import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { listSessions, deleteSession } from "../../../store/session-list.js";
import { generateSessionId } from "../../../engine/memory/constants.js";
import { HoomanBanner } from "../../ui/HoomanBanner.js";
import { KeyHints } from "../../ui/KeyHints.js";
import { theme } from "../../ui/theme.js";
import type { FC } from "react";

type Props = {
  agentId: string;
  agentName: string;
  onSelect: (sessionId: string) => void;
  onBack: () => void;
  onExit: () => void;
};

type View = "list" | "delete-confirm";

function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function DeleteConfirmItem({
  label,
  value,
  isSelected,
}: {
  label: string;
  value: string;
  isSelected?: boolean;
}) {
  if (value === "yes") {
    return (
      <Text color={isSelected ? theme.error : theme.dim} bold={isSelected}>
        {label}
      </Text>
    );
  }
  return (
    <Text color={isSelected ? theme.accentPrimary : undefined}>{label}</Text>
  );
}

export function SessionPickerScreen({
  agentId,
  agentName,
  onSelect,
  onBack,
  onExit,
}: Props) {
  const [sessions, setSessions] = useState<
    { id: string; messageCount: number; updatedAt: Date }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("list");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const highlightedRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listSessions(agentId);
      setSessions(list);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        onExit();
        return;
      }
      if (key.escape) {
        if (view === "delete-confirm") {
          setPendingDeleteId(null);
          setView("list");
        } else {
          onBack();
        }
        return;
      }
      if (
        view === "list" &&
        input === "d" &&
        !key.ctrl &&
        highlightedRef.current
      ) {
        setPendingDeleteId(highlightedRef.current);
        setView("delete-confirm");
      }
    },
    { isActive: true },
  );

  const items = useMemo(() => {
    const list: { label: string; value: string }[] = [
      { label: "+ New session", value: "__new__" },
    ];
    for (const s of sessions) {
      const time = relativeTime(s.updatedAt);
      const msgs = s.messageCount === 1 ? "1 msg" : `${s.messageCount} msgs`;
      list.push({
        label: `${s.id} — ${msgs} · ${time}`,
        value: `open:${s.id}`,
      });
    }
    list.push({ label: "Back", value: "__back__" });
    return list;
  }, [sessions]);

  if (loading) {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="sessions" />
        <Text color={theme.accentPrimary}>Loading sessions…</Text>
        <KeyHints mode="quit_only" />
      </Box>
    );
  }

  if (view === "delete-confirm" && pendingDeleteId) {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="sessions" />
        <Text bold>Delete session?</Text>
        <Text>
          <Text color={theme.accentPrimary}>{pendingDeleteId}</Text>
          <Text color={theme.dim}> — this cannot be undone</Text>
        </Text>
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: "No", value: "no" },
              { label: "Yes, delete", value: "yes" },
            ]}
            itemComponent={
              DeleteConfirmItem as FC<{
                isSelected?: boolean;
                label: string;
              }>
            }
            onSelect={(item) => {
              if (item.value === "yes") {
                void (async () => {
                  await deleteSession(agentId, pendingDeleteId);
                  setPendingDeleteId(null);
                  setView("list");
                  await load();
                })();
              } else {
                setPendingDeleteId(null);
                setView("list");
              }
            }}
          />
        </Box>
        <KeyHints mode="custom">esc — cancel</KeyHints>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <HoomanBanner subtitle="sessions" />
      <Text bold color={theme.text}>
        {agentName}
      </Text>
      <Text color={theme.dim}>Choose a session or start a new one</Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === "__back__") {
              onBack();
              return;
            }
            if (item.value === "__new__") {
              onSelect(generateSessionId());
              return;
            }
            if (item.value.startsWith("open:")) {
              const sid = item.value.slice("open:".length);
              onSelect(sid);
            }
          }}
          onHighlight={(item) => {
            if (item.value.startsWith("open:")) {
              highlightedRef.current = item.value.slice("open:".length);
            } else {
              highlightedRef.current = null;
            }
          }}
        />
      </Box>
      <KeyHints mode="custom">
        ↑↓ · enter — open · d — delete · esc — back · ctrl+c — quit
      </KeyHints>
    </Box>
  );
}
