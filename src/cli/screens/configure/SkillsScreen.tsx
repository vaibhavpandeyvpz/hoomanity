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
import type { SkillListEntry } from "../../../skills/registry.js";
import type { SearchSkill } from "../../../skills/utils/search-skills-api.js";

export type SkillsScreenProps = {
  readonly container: HoomanContainer;
  readonly agentId: string;
  readonly onBack: () => void;
};

type View = "list" | "install" | "find" | "skill-menu" | "delete-confirm";

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

function SkillMenuItem({
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

function formatInstalls(count: number): string {
  if (!count || count <= 0) {
    return "";
  }
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M installs`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K installs`;
  }
  return `${count} install${count === 1 ? "" : "s"}`;
}

export function SkillsScreen({
  container,
  agentId,
  onBack,
}: SkillsScreenProps) {
  const [view, setView] = useState<View>("list");
  const [rows, setRows] = useState<SkillListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [installSource, setInstallSource] = useState("");
  const [installError, setInstallError] = useState<string | null>(null);
  const [findQuery, setFindQuery] = useState("");
  const [findError, setFindError] = useState<string | null>(null);
  const [findBusy, setFindBusy] = useState(false);
  const [findUi, setFindUi] = useState<"input" | "pick">("input");
  const findUiRef = useRef(findUi);
  findUiRef.current = findUi;
  const [findMatches, setFindMatches] = useState<SearchSkill[]>([]);
  const [findInstallBusy, setFindInstallBusy] = useState(false);
  const findInstallBusyRef = useRef(false);
  findInstallBusyRef.current = findInstallBusy;
  const [findInstallError, setFindInstallError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await container.skillsRegistry.list(agentId);
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [container, agentId]);

  const refresh = useCallback(async () => {
    try {
      const list = await container.skillsRegistry.list(agentId);
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [container, agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const listItems = useMemo(() => {
    const items: { label: string; value: string }[] = [
      { label: "+ Install skill", value: "__install__" },
      { label: "Find in catalog", value: "__find__" },
    ];
    for (const r of rows) {
      items.push({
        label: `${r.folder} — ${r.title}`,
        value: `open:${r.folder}`,
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
      if (view === "install") {
        setInstallSource("");
        setInstallError(null);
        setView("list");
        return;
      }
      if (view === "find") {
        if (findInstallBusyRef.current) {
          return;
        }
        if (findUiRef.current === "pick") {
          setFindUi("input");
          setFindMatches([]);
          setFindInstallError(null);
          return;
        }
        setFindQuery("");
        setFindError(null);
        setFindMatches([]);
        setFindUi("input");
        setFindInstallError(null);
        setView("list");
        return;
      }
      if (view === "skill-menu") {
        setSelectedFolder(null);
        setView("list");
        return;
      }
      if (view === "delete-confirm") {
        setActionError(null);
        setView("skill-menu");
        return;
      }
      onBack();
    },
    { isActive: true },
  );

  if (loading) {
    return (
      <Box>
        <Text color="cyan">Loading skills…</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">{error}</Text>
        <Text dimColor>Esc — back to agent · Ctrl+C — quit</Text>
      </Box>
    );
  }

  if (view === "install") {
    return (
      <Box flexDirection="column">
        <Text bold>Skills — install</Text>
        <Text dimColor>
          Agent <Text color="cyan">{agentId}</Text>
          <Text dimColor> · installs under </Text>
          <Text color="cyan">skills/</Text>
        </Text>
        <Text dimColor>
          You can use owner/repo, GitHub tree URLs, local paths,{" "}
          <Text color="cyan">owner/repo@skill-name</Text>, and other standard
          sources.
        </Text>
        {installError ? (
          <Box marginTop={1}>
            <Text color="red">{installError}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <TextInput
            value={installSource}
            placeholder="vercel-labs/agent-skills  or  https://github.com/.../tree/main/skills/foo"
            onChange={(v) => {
              setInstallSource(v);
              setInstallError(null);
            }}
            onSubmit={(v) => {
              const t = v.trim();
              if (!t) {
                return;
              }
              void (async () => {
                try {
                  await container.skillsRegistry.install(agentId, t);
                  setInstallSource("");
                  setInstallError(null);
                  await refresh();
                  setView("list");
                } catch (e) {
                  setInstallError(e instanceof Error ? e.message : String(e));
                }
              })();
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter — install · Esc — cancel</Text>
        </Box>
      </Box>
    );
  }

  if (view === "find") {
    return (
      <Box flexDirection="column">
        <Text bold>Skills — find in catalog</Text>
        <Text dimColor>
          Search the public catalog (skills.sh). Matches use the same API as the
          skills CLI. Pick a result to install{" "}
          <Text color="cyan">owner/repo@skill-name</Text>.
        </Text>
        {findError ? (
          <Box marginTop={1}>
            <Text color="red">{findError}</Text>
          </Box>
        ) : null}
        {findInstallError ? (
          <Box marginTop={1}>
            <Text color="red">{findInstallError}</Text>
          </Box>
        ) : null}

        {findUi === "input" ? (
          <>
            <Box marginTop={1}>
              <TextInput
                value={findQuery}
                placeholder="e.g. typescript, react, vercel (min. 2 characters)"
                onChange={(v) => {
                  setFindQuery(v);
                  setFindError(null);
                }}
                onSubmit={(v) => {
                  const t = v.trim();
                  if (!t) {
                    return;
                  }
                  if (t.length < 2) {
                    setFindError("Use at least 2 characters to search.");
                    return;
                  }
                  void (async () => {
                    setFindBusy(true);
                    setFindError(null);
                    try {
                      const matches =
                        await container.skillsRegistry.searchCatalog(t);
                      setFindMatches(matches);
                      if (matches.length === 0) {
                        setFindError("No skills found.");
                      } else {
                        setFindUi("pick");
                      }
                    } catch (e) {
                      setFindError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setFindBusy(false);
                    }
                  })();
                }}
              />
            </Box>
            {findBusy ? (
              <Box marginTop={1}>
                <Text color="cyan">Searching…</Text>
              </Box>
            ) : null}
          </>
        ) : (
          <>
            <Box marginTop={1}>
              <Text dimColor>Search: </Text>
              <Text color="cyan">{findQuery.trim() || "(empty)"}</Text>
            </Box>
            {findInstallBusy ? (
              <Box marginTop={1}>
                <Text color="cyan">Installing…</Text>
              </Box>
            ) : (
              <Box marginTop={1}>
                <SelectInput
                  items={[
                    ...findMatches.map((s, i) => ({
                      label: `${s.name} — ${formatInstalls(s.installs)} · ${s.source || s.slug}`,
                      value: `skill:${i}`,
                    })),
                    { label: "← Edit search", value: "__edit__" },
                  ]}
                  onSelect={(item) => {
                    if (item.value === "__edit__") {
                      setFindUi("input");
                      setFindMatches([]);
                      setFindInstallError(null);
                      return;
                    }
                    const m = item.value.match(/^skill:(\d+)$/);
                    if (!m) {
                      return;
                    }
                    const skill = findMatches[Number(m[1])];
                    if (!skill) {
                      return;
                    }
                    void (async () => {
                      setFindInstallBusy(true);
                      setFindInstallError(null);
                      try {
                        const pkg = skill.source || skill.slug;
                        const spec = `${pkg}@${skill.name}`;
                        await container.skillsRegistry.install(agentId, spec);
                        setFindUi("input");
                        setFindMatches([]);
                        setFindQuery("");
                        await refresh();
                        setView("list");
                      } catch (e) {
                        setFindInstallError(
                          e instanceof Error ? e.message : String(e),
                        );
                      } finally {
                        setFindInstallBusy(false);
                      }
                    })();
                  }}
                />
              </Box>
            )}
          </>
        )}

        <Box marginTop={1}>
          <Text dimColor>
            {findUi === "input"
              ? "Enter — search · Esc — back"
              : "↑↓ — choose · Enter — install · Esc — edit search"}
          </Text>
        </Box>
      </Box>
    );
  }

  if (view === "delete-confirm" && selectedFolder) {
    return (
      <Box flexDirection="column">
        <Text bold>Delete skill?</Text>
        <Text>
          Remove skill <Text color="cyan">{selectedFolder}</Text>. This cannot
          be undone.
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
                  setView("skill-menu");
                  return;
                }
                try {
                  await container.skillsRegistry.delete(
                    agentId,
                    selectedFolder,
                  );
                  setSelectedFolder(null);
                  await refresh();
                  setView("list");
                } catch (e) {
                  setActionError(e instanceof Error ? e.message : String(e));
                }
              })();
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Esc — back without deleting</Text>
        </Box>
      </Box>
    );
  }

  if (view === "skill-menu" && selectedFolder) {
    const title =
      rows.find((r) => r.folder === selectedFolder)?.title ?? selectedFolder;
    return (
      <Box flexDirection="column">
        <Text bold>Skills</Text>
        <Text>
          <Text color="cyan">{selectedFolder}</Text>
          <Text dimColor> — {title}</Text>
        </Text>
        <Text dimColor>Choose an action</Text>
        <SelectInput
          items={[
            { label: "Delete", value: "delete" },
            { label: "Back to skills", value: "back" },
          ]}
          itemComponent={
            SkillMenuItem as FC<{
              isSelected?: boolean;
              label: string;
            }>
          }
          onSelect={(item) => {
            if (item.value === "back") {
              setSelectedFolder(null);
              setView("list");
            } else {
              setActionError(null);
              setView("delete-confirm");
            }
          }}
        />
        <Box marginTop={1}>
          <Text dimColor>Esc — back to skills list</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <HoomanBanner subtitle="configure · skills" />
      <Text bold color="magenta">
        Skills
      </Text>
      <Text dimColor>
        Agent <Text color="cyan">{agentId}</Text>
      </Text>
      <Text dimColor>
        Install, search the catalog, remove, or open skills. Stored under{" "}
        <Text color="cyan">skills/</Text> in this agent’s folder.
      </Text>
      <Box marginTop={1}>
        <SelectInput
          items={listItems}
          onSelect={(item) => {
            if (item.value === "__back__") {
              onBack();
              return;
            }
            if (item.value === "__install__") {
              setInstallSource("");
              setInstallError(null);
              setView("install");
              return;
            }
            if (item.value === "__find__") {
              setFindQuery("");
              setFindError(null);
              setFindMatches([]);
              setFindUi("input");
              setFindInstallError(null);
              setView("find");
              return;
            }
            if (item.value.startsWith("open:")) {
              const folder = item.value.slice("open:".length);
              setSelectedFolder(folder);
              setView("skill-menu");
            }
          }}
        />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Esc — back to agent · Ctrl+C — quit</Text>
      </Box>
    </Box>
  );
}
