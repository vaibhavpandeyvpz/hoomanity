import { useState, useEffect, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { read as readConfig } from "../../../agents/config.js";
import { list as listRegistry } from "../../../agents/registry.js";
import { HoomanBanner } from "../../ui/HoomanBanner.js";
import { KeyHints } from "../../ui/KeyHints.js";
import { theme } from "../../ui/theme.js";

type AgentRow = { id: string; name: string; enabled: boolean };

type Props = {
  onSelect: (agentId: string) => void;
  onExit: () => void;
};

export function SelectAgentScreen({ onSelect, onExit }: Props) {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      process.exit(0);
    }
    if (key.escape) {
      onExit();
    }
  });

  useEffect(() => {
    void (async () => {
      setError(null);
      try {
        const rows = await listRegistry();
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
        setAgents(enriched.filter((a) => a.enabled));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const items = useMemo(
    () =>
      agents.map((a) => ({
        label: `${a.name} [${a.id}]`,
        value: a.id,
      })),
    [agents],
  );

  if (loading) {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="launch" />
        <Text color={theme.accentPrimary}>Loading agents…</Text>
        <KeyHints mode="quit_only" />
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="launch" />
        <Text color={theme.error}>{error}</Text>
        <KeyHints mode="quit_only" />
      </Box>
    );
  }

  if (agents.length === 0) {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="launch" />
        <Text>No enabled agents.</Text>
        <Text color={theme.dim}>
          Create or enable one with{" "}
          <Text color={theme.accentPrimary}>hoomanity configure</Text>.
        </Text>
        <KeyHints mode="quit_only" />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <HoomanBanner subtitle="launch" />
      <Text bold color={theme.text}>
        Pick an agent
      </Text>
      <Text color={theme.dim}>↑↓ · Enter — start chat</Text>
      <Box marginTop={1}>
        <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
      </Box>
      <KeyHints mode="quit_only" />
    </Box>
  );
}
