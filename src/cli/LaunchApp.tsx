import { useEffect, useMemo, useState, type FC } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { read as readConfig } from "../agents/config.js";
import { list } from "../agents/registry.js";
import type { HoomanContainer } from "./container.js";
import { RunAgentApp } from "./apps/RunAgentApp.js";
import { HoomanBanner } from "./ui/HoomanBanner.js";
import { KeyHints } from "./ui/KeyHints.js";

export type LaunchAppProps = {
  readonly container: HoomanContainer;
};

type AgentRow = { id: string; name: string; enabled: boolean };

type LaunchScreen =
  | { type: "list" }
  | { type: "run"; agentId: string }
  | { type: "blocked"; agentId: string };

function PickItem({
  agents,
  value,
  isSelected,
}: {
  agents: AgentRow[];
  label: string;
  value: string;
  isSelected?: boolean;
}) {
  const color = isSelected ? "cyan" : undefined;
  const row = agents.find((a) => a.id === value);
  const name = row?.name ?? "?";
  const strike = Boolean(row && !row.enabled);
  return (
    <Text color={color}>
      {strike ? (
        <Text strikethrough dimColor>
          {name}
        </Text>
      ) : (
        name
      )}{" "}
      <Text dimColor>[{value}]</Text>
      {row && !row.enabled ? <Text dimColor> (disabled)</Text> : null}
    </Text>
  );
}

export function LaunchApp({ container }: LaunchAppProps) {
  const [screen, setScreen] = useState<LaunchScreen>({ type: "list" });
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listVersion, setListVersion] = useState(0);

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        process.exit(0);
      }
      if (!key.escape) {
        return;
      }
      if (screen.type === "blocked") {
        setScreen({ type: "list" });
        return;
      }
      process.exit(0);
    },
    { isActive: screen.type !== "run" },
  );

  useEffect(() => {
    void (async () => {
      setError(null);
      try {
        const rows = await list();
        const enriched: AgentRow[] = await Promise.all(
          rows.map(async (r) => {
            let name = "?";
            try {
              name = (await readConfig(r.id)).name;
            } catch {
              /* */
            }
            return { id: r.id, name, enabled: r.enabled };
          }),
        );
        setAgents(enriched);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [listVersion, container]);

  const pickItem = useMemo((): FC<{
    label: string;
    value: string;
    isSelected?: boolean;
  }> => {
    return (props) => <PickItem agents={agents} {...props} />;
  }, [agents]);

  const items = useMemo(
    () =>
      agents.map((a) => ({
        label: `${a.name} [${a.id}]`,
        value: a.id,
      })),
    [agents],
  );

  if (screen.type === "run") {
    return (
      <RunAgentApp
        container={container}
        initialAgentId={screen.agentId}
        onExit={() => {
          process.exit(0);
        }}
        onBack={() => {
          setListVersion((v) => v + 1);
          setScreen({ type: "list" });
        }}
      />
    );
  }

  if (screen.type === "blocked") {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="launch" />
        <Text>
          Agent <Text color="cyan">{screen.agentId}</Text> is disabled.
        </Text>
        <Text dimColor>
          Enable it with <Text color="magenta">hooman configure</Text>.
        </Text>
        <KeyHints mode="custom" children="Esc — back to list · Ctrl+C — quit" />
      </Box>
    );
  }

  if (loading) {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="launch" />
        <Text color="cyan">Loading agents…</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="launch" />
        <Text color="red">{error}</Text>
        <KeyHints mode="quit_only" />
      </Box>
    );
  }

  if (agents.length === 0) {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="launch" />
        <Text>No agents yet.</Text>
        <Text dimColor>
          Create one with <Text color="magenta">hooman configure</Text>.
        </Text>
        <KeyHints mode="quit_only" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <HoomanBanner subtitle="launch" />
      <Text bold color="magenta">
        Choose an agent
      </Text>
      <Text dimColor>
        ↑↓ navigate · Enter — chat · Esc — leave · Ctrl+C — quit
      </Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          itemComponent={
            pickItem as FC<{
              isSelected?: boolean;
              label: string;
            }>
          }
          onSelect={(item) => {
            const row = agents.find((a) => a.id === item.value);
            if (!row?.enabled) {
              setScreen({ type: "blocked", agentId: item.value });
              return;
            }
            setScreen({ type: "run", agentId: item.value });
          }}
        />
      </Box>
      <KeyHints mode="configure_root" />
    </Box>
  );
}
