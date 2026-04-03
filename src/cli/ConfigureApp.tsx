import { useEffect, useMemo, useState, type FC } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { read as readConfig } from "../agents/config.js";
import { list, remove, toggle } from "../agents/registry.js";
import type { HoomanContainer } from "./container.js";
import { AgentTimeoutsApp } from "./apps/AgentTimeoutsApp.js";
import { CreateAgentApp } from "./apps/CreateAgentApp.js";
import { RunAgentApp } from "./apps/RunAgentApp.js";
import { SkillsApp } from "./apps/SkillsApp.js";
import { McpServersApp } from "./apps/McpServersApp.js";
import { HoomanBanner } from "./ui/HoomanBanner.js";
import { KeyHints } from "./ui/KeyHints.js";

export type ConfigureAppProps = {
  readonly container: HoomanContainer;
};

type MainScreen =
  | { type: "home" }
  | { type: "create" }
  | { type: "agent-menu"; agentId: string; enabled: boolean }
  | { type: "delete-confirm"; agentId: string; enabled: boolean }
  | { type: "run"; agentId: string }
  | { type: "update-menu"; agentId: string; enabled: boolean }
  | { type: "edit"; agentId: string }
  | { type: "timeouts"; agentId: string; enabled: boolean }
  | { type: "skills"; agentId: string; enabled: boolean }
  | { type: "mcp"; agentId: string; enabled: boolean };

type AgentRow = { id: string; name: string; enabled: boolean };

type HomeSelectItemProps = {
  readonly agents: AgentRow[];
  readonly label: string;
  readonly value: string;
  readonly isSelected?: boolean;
};

function HomeSelectItem({
  agents,
  label,
  value,
  isSelected,
}: HomeSelectItemProps) {
  const color = isSelected ? "blue" : undefined;
  if (value === "__create__") {
    return <Text color={color}>{label}</Text>;
  }
  if (value.startsWith("open:")) {
    const id = value.slice("open:".length);
    const row = agents.find((a) => a.id === id);
    const name = row?.name ?? "?";
    const strikeName = Boolean(row && !row.enabled);
    return (
      <Text color={color}>
        {strikeName ? (
          <Text strikethrough dimColor>
            {name}
          </Text>
        ) : (
          name
        )}{" "}
        <Text dimColor>[{id}]</Text>
      </Text>
    );
  }
  return <Text color={color}>{label}</Text>;
}

function DeleteConfirmSelectItem({
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
      <Text color="red" bold={isSelected}>
        {label}
      </Text>
    );
  }
  return <Text color={isSelected ? "blue" : undefined}>{label}</Text>;
}

function AgentMenuSelectItem({
  label,
  value,
  isSelected,
}: {
  label: string;
  value: string;
  isSelected?: boolean;
}) {
  if (value === "delete") {
    return (
      <Text color="red" bold={isSelected}>
        {label}
      </Text>
    );
  }
  return <Text color={isSelected ? "blue" : undefined}>{label}</Text>;
}

export function ConfigureApp({ container }: ConfigureAppProps) {
  const [screen, setScreen] = useState<MainScreen>({ type: "home" });
  const [listVersion, setListVersion] = useState(0);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const goHome = () => {
    setActionError(null);
    setScreen({ type: "home" });
    setListVersion((v) => v + 1);
  };

  const refreshList = () => {
    setListVersion((v) => v + 1);
  };

  useEffect(() => {
    void (async () => {
      setLoadError(null);
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
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [listVersion, container]);

  /** Ink’s default exit-on-Ctrl+C runs before useInput; disabled in cli.tsx so we can route it. */
  useInput(
    (input, key) => {
      if (!key.ctrl || input !== "c") {
        return;
      }
      if (screen.type === "create" || screen.type === "run") {
        return;
      }
      process.exit(0);
    },
    { isActive: true },
  );

  useInput(
    (_input, key) => {
      if (key.escape) {
        process.exit(0);
      }
    },
    { isActive: screen.type === "home" && !loading },
  );

  useInput(
    (_input, key) => {
      if (key.escape) {
        goHome();
      }
    },
    { isActive: screen.type === "agent-menu" },
  );

  useInput(
    (_input, key) => {
      if (!key.escape) {
        return;
      }
      setScreen((prev) => {
        if (prev.type !== "update-menu") {
          return prev;
        }
        return {
          type: "agent-menu",
          agentId: prev.agentId,
          enabled: prev.enabled,
        };
      });
    },
    { isActive: screen.type === "update-menu" },
  );

  useInput(
    (_input, key) => {
      if (key.escape) {
        if (screen.type === "delete-confirm") {
          setActionError(null);
          setScreen({
            type: "agent-menu",
            agentId: screen.agentId,
            enabled: screen.enabled,
          });
        }
      }
    },
    { isActive: screen.type === "delete-confirm" },
  );

  const homeItemComponent = useMemo((): FC<{
    label: string;
    value: string;
    isSelected?: boolean;
  }> => {
    return (props) => <HomeSelectItem agents={agents} {...props} />;
  }, [agents]);

  if (screen.type === "create") {
    return <CreateAgentApp container={container} onFinished={goHome} />;
  }

  if (screen.type === "edit") {
    const row = agents.find((a) => a.id === screen.agentId);
    return (
      <CreateAgentApp
        container={container}
        mode="edit"
        editAgentId={screen.agentId}
        onFinished={goHome}
        onBack={() => {
          setScreen({
            type: "update-menu",
            agentId: screen.agentId,
            enabled: row?.enabled ?? true,
          });
        }}
      />
    );
  }

  if (screen.type === "timeouts") {
    return (
      <AgentTimeoutsApp
        agentId={screen.agentId}
        onBack={() => {
          setScreen({
            type: "update-menu",
            agentId: screen.agentId,
            enabled: screen.enabled,
          });
        }}
      />
    );
  }

  if (screen.type === "update-menu") {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="configure · update" />
        <Text bold>Update agent</Text>
        <Text dimColor>Agent {screen.agentId}</Text>
        <SelectInput
          items={[
            {
              label: "Model, provider & instructions",
              value: "edit",
            },
            {
              label: "Run limits (timeouts, turns & context)",
              value: "timeouts",
            },
            { label: "Back", value: "back" },
          ]}
          onSelect={(item) => {
            if (item.value === "back") {
              setScreen({
                type: "agent-menu",
                agentId: screen.agentId,
                enabled: screen.enabled,
              });
            } else if (item.value === "timeouts") {
              setScreen({
                type: "timeouts",
                agentId: screen.agentId,
                enabled: screen.enabled,
              });
            } else {
              setScreen({
                type: "edit",
                agentId: screen.agentId,
              });
            }
          }}
        />
        <KeyHints mode="back_quit" />
      </Box>
    );
  }

  if (screen.type === "run") {
    return (
      <RunAgentApp
        container={container}
        initialAgentId={screen.agentId}
        onExit={goHome}
        onBack={() => {
          const row = agents.find((a) => a.id === screen.agentId);
          setScreen({
            type: "agent-menu",
            agentId: screen.agentId,
            enabled: row?.enabled ?? true,
          });
        }}
      />
    );
  }

  if (screen.type === "skills") {
    return (
      <SkillsApp
        container={container}
        agentId={screen.agentId}
        onBack={() => {
          setScreen({
            type: "agent-menu",
            agentId: screen.agentId,
            enabled: screen.enabled,
          });
        }}
      />
    );
  }

  if (screen.type === "mcp") {
    return (
      <McpServersApp
        container={container}
        agentId={screen.agentId}
        onBack={() => {
          setScreen({
            type: "agent-menu",
            agentId: screen.agentId,
            enabled: screen.enabled,
          });
        }}
      />
    );
  }

  if (screen.type === "delete-confirm") {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="configure" />
        <Text bold>Delete agent?</Text>
        <Text>
          This will remove <Text color="cyan">{screen.agentId}</Text> from the
          registry and delete its files (config, MCP, skills). This cannot be
          undone.
        </Text>
        {actionError ? (
          <Box marginTop={1}>
            <Text color="red">{actionError}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: "No", value: "no" },
              { label: "Yes", value: "yes" },
            ]}
            itemComponent={
              DeleteConfirmSelectItem as FC<{
                isSelected?: boolean;
                label: string;
              }>
            }
            onSelect={(item) => {
              void (async () => {
                setActionError(null);
                if (item.value === "no") {
                  setScreen({
                    type: "agent-menu",
                    agentId: screen.agentId,
                    enabled: screen.enabled,
                  });
                  return;
                }
                try {
                  await remove(screen.agentId);
                  goHome();
                } catch (e) {
                  setActionError(e instanceof Error ? e.message : String(e));
                }
              })();
            }}
          />
        </Box>
        <KeyHints
          mode="custom"
          children="Esc — back without deleting · Ctrl+C — quit"
        />
      </Box>
    );
  }

  if (screen.type === "agent-menu") {
    const menuItems = [
      ...(screen.enabled ? [{ label: "Run", value: "run" as const }] : []),
      { label: "Update", value: "update" },
      { label: "Skills", value: "skills" as const },
      { label: "MCPs", value: "mcp" as const },
      ...(screen.enabled
        ? [{ label: "Disable", value: "disable" as const }]
        : [{ label: "Enable", value: "enable" as const }]),
      { label: "Delete", value: "delete" as const },
      { label: "Back to agents", value: "back" as const },
    ];

    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="configure · agent" />
        <Text>
          Agent <Text color="cyan">{screen.agentId}</Text>
          <Text dimColor> ({screen.enabled ? "enabled" : "disabled"})</Text>
        </Text>
        <Text dimColor>Choose an action</Text>
        <SelectInput
          items={menuItems}
          itemComponent={
            AgentMenuSelectItem as FC<{
              isSelected?: boolean;
              label: string;
            }>
          }
          onSelect={(item) => {
            void (async () => {
              if (item.value === "back") {
                goHome();
              } else if (item.value === "delete") {
                setActionError(null);
                setScreen({
                  type: "delete-confirm",
                  agentId: screen.agentId,
                  enabled: screen.enabled,
                });
              } else if (item.value === "enable" || item.value === "disable") {
                await toggle(screen.agentId);
                refreshList();
                setScreen({ ...screen, enabled: !screen.enabled });
              } else if (item.value === "skills") {
                setScreen({
                  type: "skills",
                  agentId: screen.agentId,
                  enabled: screen.enabled,
                });
              } else if (item.value === "mcp") {
                setScreen({
                  type: "mcp",
                  agentId: screen.agentId,
                  enabled: screen.enabled,
                });
              } else if (item.value === "run") {
                if (!screen.enabled) {
                  return;
                }
                setScreen({ type: "run", agentId: screen.agentId });
              } else if (item.value === "update") {
                setScreen({
                  type: "update-menu",
                  agentId: screen.agentId,
                  enabled: screen.enabled,
                });
              }
            })();
          }}
        />
        <KeyHints mode="back_quit" />
      </Box>
    );
  }

  if (loading) {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="configure" />
        <Text color="cyan">Loading…</Text>
      </Box>
    );
  }

  if (loadError) {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle="configure" />
        <Text color="red">{loadError}</Text>
        <KeyHints mode="quit_only" />
      </Box>
    );
  }

  const items: { label: string; value: string }[] = [
    { label: "+ Create new agent", value: "__create__" },
  ];

  for (const a of agents) {
    items.push({
      label: `${a.name} [${a.id}]`,
      value: `open:${a.id}`,
    });
  }

  return (
    <Box flexDirection="column">
      <HoomanBanner subtitle="configure" />
      <Text bold color="magenta">
        Agents
      </Text>
      <Text dimColor>
        Select an agent or create · Esc — leave · Ctrl+C — quit
      </Text>
      <SelectInput
        items={items}
        itemComponent={
          homeItemComponent as FC<{
            isSelected?: boolean;
            label: string;
          }>
        }
        onSelect={(item) => {
          void (async () => {
            if (item.value === "__create__") {
              setScreen({ type: "create" });
              return;
            }
            if (item.value.startsWith("open:")) {
              const id = item.value.slice("open:".length);
              const row = agents.find((x) => x.id === id);
              setScreen({
                type: "agent-menu",
                agentId: id,
                enabled: row?.enabled ?? true,
              });
            }
          })();
        }}
      />
      <KeyHints mode="configure_root" />
    </Box>
  );
}
