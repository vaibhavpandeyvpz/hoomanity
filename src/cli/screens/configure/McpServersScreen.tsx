import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import type { HoomanContainer } from "../../container.js";
import { HoomanBanner } from "../../ui/HoomanBanner.js";
import { formatCliErrorBrief } from "../../error-format.js";
import type { McpListEntry } from "../../../store/mcp-registry.js";
import type { McpServerEntry, McpUrlTransport } from "../../../store/types.js";

export type McpServersScreenProps = {
  readonly container: HoomanContainer;
  readonly agentId: string;
  readonly onBack: () => void;
};

type View =
  | "list"
  | "add-kind"
  | "add-stdio"
  | "add-url"
  | "add-url-transport"
  | "server-menu"
  | "edit-name"
  | "edit-stdio"
  | "edit-url"
  | "edit-url-transport"
  | "delete-confirm";

function kindLabel(k: McpListEntry["kind"]): string {
  if (k === "stdio") {
    return "stdio";
  }
  if (k === "sse") {
    return "SSE";
  }
  return "HTTP";
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
      <Text color="red" bold={isSelected}>
        {label}
      </Text>
    );
  }
  return <Text color={isSelected ? "blue" : undefined}>{label}</Text>;
}

function ServerMenuItem({
  label,
  value,
  isSelected,
}: {
  label: string;
  value: string;
  isSelected?: boolean;
}) {
  if (value === "remove") {
    return (
      <Text color="red" bold={isSelected}>
        {label}
      </Text>
    );
  }
  return <Text color={isSelected ? "blue" : undefined}>{label}</Text>;
}

function stdioSummary(entry: McpServerEntry): string {
  if (entry.fullCommand?.trim()) {
    return entry.fullCommand.trim();
  }
  return [entry.command, ...(entry.args ?? [])].filter(Boolean).join(" ");
}

function clearsStdio(fullCommand: string): Partial<McpServerEntry> {
  return {
    fullCommand: fullCommand.trim(),
    command: undefined,
    args: undefined,
    url: undefined,
    transport: undefined,
  };
}

function clearsUrl(
  url: string,
  transport: McpUrlTransport,
): Partial<McpServerEntry> {
  return {
    url: url.trim(),
    transport,
    fullCommand: undefined,
    command: undefined,
    args: undefined,
  };
}

export function McpServersScreen({
  container,
  agentId,
  onBack,
}: McpServersScreenProps) {
  const [view, setView] = useState<View>("list");
  const [rows, setRows] = useState<McpListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const [addStdioLine, setAddStdioLine] = useState("");
  const [addUrlLine, setAddUrlLine] = useState("");
  const [pendingAddUrl, setPendingAddUrl] = useState("");

  const [editNameValue, setEditNameValue] = useState("");
  const [editStdioValue, setEditStdioValue] = useState("");
  const [editUrlValue, setEditUrlValue] = useState("");
  const [pendingEditUrl, setPendingEditUrl] = useState("");
  const viewRef = useRef(view);
  viewRef.current = view;

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await container.mcpRegistry.list(agentId);
      setRows(list);
    } catch (e) {
      setError(formatCliErrorBrief(e));
    } finally {
      setLoading(false);
    }
  }, [container, agentId]);

  const refresh = useCallback(async () => {
    try {
      const list = await container.mcpRegistry.list(agentId);
      setRows(list);
    } catch (e) {
      setError(formatCliErrorBrief(e));
    }
  }, [container, agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedRow = useMemo(() => {
    if (selectedIndex === null) {
      return null;
    }
    return rows.find((r) => r.index === selectedIndex) ?? null;
  }, [rows, selectedIndex]);

  const listItems = useMemo(() => {
    const items: { label: string; value: string }[] = [
      { label: "+ Add MCP server", value: "__add__" },
    ];
    for (const r of rows) {
      const short =
        r.summary.length > 56 ? `${r.summary.slice(0, 53)}…` : r.summary;
      items.push({
        label: `[${kindLabel(r.kind)}] ${r.name} — ${short}`,
        value: `open:${r.index}`,
      });
    }
    items.push({ label: "Back to agent", value: "__back__" });
    return items;
  }, [rows]);

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        process.exit(0);
        return;
      }
      if (!key.escape) {
        return;
      }
      if (loading || error !== null) {
        onBack();
        return;
      }
      if (viewRef.current === "add-kind") {
        setView("list");
        return;
      }
      if (viewRef.current === "add-stdio") {
        setAddStdioLine("");
        setView("add-kind");
        return;
      }
      if (viewRef.current === "add-url") {
        setAddUrlLine("");
        setView("add-kind");
        return;
      }
      if (viewRef.current === "add-url-transport") {
        setPendingAddUrl("");
        setView("add-url");
        return;
      }
      if (viewRef.current === "server-menu") {
        setSelectedIndex(null);
        setView("list");
        return;
      }
      if (viewRef.current === "edit-name") {
        setEditNameValue("");
        setView("server-menu");
        return;
      }
      if (viewRef.current === "edit-stdio") {
        setEditStdioValue("");
        setView("server-menu");
        return;
      }
      if (viewRef.current === "edit-url") {
        setEditUrlValue("");
        setView("server-menu");
        return;
      }
      if (viewRef.current === "edit-url-transport") {
        setPendingEditUrl("");
        setView("edit-url");
        return;
      }
      if (viewRef.current === "delete-confirm") {
        setActionError(null);
        setView("server-menu");
        return;
      }
      onBack();
    },
    { isActive: true },
  );

  const openServerMenu = async (index: number) => {
    setSelectedIndex(index);
    setActionError(null);
    setView("server-menu");
  };

  const startEditConnection = async () => {
    if (selectedIndex === null) {
      return;
    }
    const file = await container.mcpRegistry.read(agentId);
    const entry = file.servers[selectedIndex];
    if (!entry) {
      return;
    }
    const url = entry.url?.trim();
    if (url) {
      setEditUrlValue(url);
      setPendingEditUrl("");
      setView("edit-url");
    } else {
      setEditStdioValue(stdioSummary(entry));
      setView("edit-stdio");
    }
  };

  if (loading) {
    return (
      <Box>
        <Text color="cyan">Loading MCP servers…</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">{error}</Text>
        <Text dimColor>esc — back to agent · ctrl+c — quit</Text>
      </Box>
    );
  }

  if (view === "add-kind") {
    return (
      <Box flexDirection="column">
        <Text bold>MCP — add server</Text>
        <Text dimColor>
          Agent <Text color="cyan">{agentId}</Text>
        </Text>
        <Text dimColor>Connection type</Text>
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: "Stdio (shell command)", value: "stdio" },
              { label: "Remote URL", value: "url" },
              { label: "← Cancel", value: "cancel" },
            ]}
            onSelect={(item) => {
              if (item.value === "cancel") {
                setView("list");
                return;
              }
              if (item.value === "stdio") {
                setAddStdioLine("");
                setView("add-stdio");
              } else {
                setAddUrlLine("");
                setView("add-url");
              }
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>esc — back</Text>
        </Box>
      </Box>
    );
  }

  if (view === "add-stdio") {
    return (
      <Box flexDirection="column">
        <Text bold>MCP — stdio command</Text>
        <Text dimColor>
          Full shell command (same as in <Text color="cyan">mcp.json</Text>{" "}
          <Text dimColor>fullCommand</Text>).
        </Text>
        {actionError ? (
          <Box marginTop={1}>
            <Text color="red">{actionError}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <TextInput
            value={addStdioLine}
            placeholder="e.g. npx -y @modelcontextprotocol/server-filesystem /tmp"
            onChange={(v) => {
              setAddStdioLine(v);
              setActionError(null);
            }}
            onSubmit={(v) => {
              const t = v.trim();
              if (!t) {
                return;
              }
              void (async () => {
                try {
                  await container.mcpRegistry.add(agentId, {
                    kind: "stdio",
                    mode: "fullCommand",
                    fullCommand: t,
                  });
                  setAddStdioLine("");
                  setActionError(null);
                  await refresh();
                  setView("list");
                } catch (e) {
                  setActionError(formatCliErrorBrief(e));
                }
              })();
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>enter — save · esc — back</Text>
        </Box>
      </Box>
    );
  }

  if (view === "add-url") {
    return (
      <Box flexDirection="column">
        <Text bold>MCP — remote URL</Text>
        <Text dimColor>MCP server endpoint (HTTP or SSE).</Text>
        {actionError ? (
          <Box marginTop={1}>
            <Text color="red">{actionError}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <TextInput
            value={addUrlLine}
            placeholder="https://example.com/mcp"
            onChange={(v) => {
              setAddUrlLine(v);
              setActionError(null);
            }}
            onSubmit={(v) => {
              const t = v.trim();
              if (!t) {
                return;
              }
              setPendingAddUrl(t);
              setView("add-url-transport");
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>enter — choose transport · esc — back</Text>
        </Box>
      </Box>
    );
  }

  if (view === "add-url-transport") {
    return (
      <Box flexDirection="column">
        <Text bold>MCP — transport</Text>
        <Text dimColor>
          URL: <Text color="cyan">{pendingAddUrl}</Text>
        </Text>
        {actionError ? (
          <Box marginTop={1}>
            <Text color="red">{actionError}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: "Streamable HTTP (default)", value: "streamableHttp" },
              { label: "SSE", value: "sse" },
            ]}
            onSelect={(item) => {
              const transport = item.value as McpUrlTransport;
              void (async () => {
                try {
                  await container.mcpRegistry.add(agentId, {
                    kind: "url",
                    url: pendingAddUrl,
                    transport,
                  });
                  setPendingAddUrl("");
                  setAddUrlLine("");
                  setActionError(null);
                  await refresh();
                  setView("list");
                } catch (e) {
                  setActionError(formatCliErrorBrief(e));
                }
              })();
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>esc — edit URL again</Text>
        </Box>
      </Box>
    );
  }

  if (view === "delete-confirm" && selectedIndex !== null && selectedRow) {
    return (
      <Box flexDirection="column">
        <Text bold>Remove MCP server?</Text>
        <Text>
          <Text color="cyan">{selectedRow.name}</Text>
          <Text dimColor> — {selectedRow.summary}</Text>
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
              DeleteConfirmItem as FC<{
                isSelected?: boolean;
                label: string;
              }>
            }
            onSelect={(item) => {
              void (async () => {
                setActionError(null);
                if (item.value === "no") {
                  setView("server-menu");
                  return;
                }
                try {
                  await container.mcpRegistry.remove(agentId, selectedIndex);
                  setSelectedIndex(null);
                  await refresh();
                  setView("list");
                } catch (e) {
                  setActionError(formatCliErrorBrief(e));
                }
              })();
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>esc — back</Text>
        </Box>
      </Box>
    );
  }

  if (view === "edit-name" && selectedIndex !== null) {
    return (
      <Box flexDirection="column">
        <Text bold>MCP — display name</Text>
        <Text dimColor>Optional label in config; leave empty to clear.</Text>
        {actionError ? (
          <Box marginTop={1}>
            <Text color="red">{actionError}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <TextInput
            value={editNameValue}
            placeholder="e.g. my-filesystem"
            onChange={(v) => {
              setEditNameValue(v);
              setActionError(null);
            }}
            onSubmit={(v) => {
              void (async () => {
                try {
                  const name = v.trim() || undefined;
                  await container.mcpRegistry.update(agentId, selectedIndex, {
                    name,
                  });
                  setEditNameValue("");
                  setActionError(null);
                  await refresh();
                  setView("server-menu");
                } catch (e) {
                  setActionError(formatCliErrorBrief(e));
                }
              })();
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>enter — save · esc — back</Text>
        </Box>
      </Box>
    );
  }

  if (view === "edit-stdio" && selectedIndex !== null) {
    return (
      <Box flexDirection="column">
        <Text bold>MCP — stdio command</Text>
        {actionError ? (
          <Box marginTop={1}>
            <Text color="red">{actionError}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <TextInput
            value={editStdioValue}
            placeholder="full command"
            onChange={(v) => {
              setEditStdioValue(v);
              setActionError(null);
            }}
            onSubmit={(v) => {
              const t = v.trim();
              if (!t) {
                return;
              }
              void (async () => {
                try {
                  await container.mcpRegistry.update(
                    agentId,
                    selectedIndex,
                    clearsStdio(t),
                  );
                  setEditStdioValue("");
                  setActionError(null);
                  await refresh();
                  setView("server-menu");
                } catch (e) {
                  setActionError(formatCliErrorBrief(e));
                }
              })();
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>enter — save · esc — back</Text>
        </Box>
      </Box>
    );
  }

  if (view === "edit-url" && selectedIndex !== null) {
    return (
      <Box flexDirection="column">
        <Text bold>MCP — remote URL</Text>
        {actionError ? (
          <Box marginTop={1}>
            <Text color="red">{actionError}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <TextInput
            value={editUrlValue}
            placeholder="https://…"
            onChange={(v) => {
              setEditUrlValue(v);
              setActionError(null);
            }}
            onSubmit={(v) => {
              const t = v.trim();
              if (!t) {
                return;
              }
              setPendingEditUrl(t);
              setView("edit-url-transport");
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>enter — transport · esc — back</Text>
        </Box>
      </Box>
    );
  }

  if (view === "edit-url-transport" && selectedIndex !== null) {
    return (
      <Box flexDirection="column">
        <Text bold>MCP — transport</Text>
        <Text dimColor>
          URL: <Text color="cyan">{pendingEditUrl}</Text>
        </Text>
        {actionError ? (
          <Box marginTop={1}>
            <Text color="red">{actionError}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: "Streamable HTTP", value: "streamableHttp" },
              { label: "SSE", value: "sse" },
            ]}
            onSelect={(item) => {
              const transport = item.value as McpUrlTransport;
              void (async () => {
                try {
                  await container.mcpRegistry.update(
                    agentId,
                    selectedIndex,
                    clearsUrl(pendingEditUrl, transport),
                  );
                  setPendingEditUrl("");
                  setEditUrlValue("");
                  setActionError(null);
                  await refresh();
                  setView("server-menu");
                } catch (e) {
                  setActionError(formatCliErrorBrief(e));
                }
              })();
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>esc — edit URL again</Text>
        </Box>
      </Box>
    );
  }

  if (view === "server-menu" && selectedIndex !== null && selectedRow) {
    return (
      <Box flexDirection="column">
        <Text bold>MCP server</Text>
        <Text>
          <Text color="cyan">{selectedRow.name}</Text>
          <Text dimColor> [{kindLabel(selectedRow.kind)}]</Text>
        </Text>
        <Text dimColor>{selectedRow.summary}</Text>
        <Text dimColor>Choose an action</Text>
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: "Rename", value: "rename" },
              { label: "Edit connection", value: "edit" },
              { label: "Remove", value: "remove" },
              { label: "Back to list", value: "back" },
            ]}
            itemComponent={
              ServerMenuItem as FC<{
                isSelected?: boolean;
                label: string;
              }>
            }
            onSelect={(item) => {
              void (async () => {
                if (item.value === "back") {
                  setSelectedIndex(null);
                  setView("list");
                  return;
                }
                if (item.value === "rename") {
                  const file = await container.mcpRegistry.read(agentId);
                  const entry = file.servers[selectedIndex];
                  setEditNameValue(entry?.name?.trim() ?? "");
                  setActionError(null);
                  setView("edit-name");
                  return;
                }
                if (item.value === "edit") {
                  await startEditConnection();
                  return;
                }
                if (item.value === "remove") {
                  setActionError(null);
                  setView("delete-confirm");
                }
              })();
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>esc — back to list</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <HoomanBanner subtitle="configure · MCP" />
      <Text bold color="magenta">
        MCP servers
      </Text>
      <Text dimColor>
        Agent <Text color="cyan">{agentId}</Text>
        <Text dimColor> · stored in </Text>
        <Text color="cyan">mcp.json</Text>
      </Text>
      <Text dimColor>
        Add, rename, edit, or remove MCP entries for this agent.
      </Text>
      <Box marginTop={1}>
        <SelectInput
          items={listItems}
          onSelect={(item) => {
            if (item.value === "__back__") {
              onBack();
              return;
            }
            if (item.value === "__add__") {
              setActionError(null);
              setView("add-kind");
              return;
            }
            if (item.value.startsWith("open:")) {
              const idx = Number(item.value.slice("open:".length));
              if (!Number.isFinite(idx)) {
                return;
              }
              void openServerMenu(idx);
            }
          }}
        />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>esc — back to agent · ctrl+c — quit</Text>
      </Box>
    </Box>
  );
}
