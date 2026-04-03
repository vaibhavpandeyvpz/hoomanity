import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import {
  read as readConfig,
  write as writeConfig,
} from "../../agents/config.js";
import { read, write } from "../../agents/instructions.js";
import { provision } from "../../agents/provision.js";
import { openEditorWithInitialContent } from "../utils/open-in-editor.js";
import type { HoomanContainer } from "../container.js";
import type {
  AnthropicProviderConfig,
  BedrockProviderConfig,
  ModelProvider,
  OllamaProviderConfig,
  OpenAIProviderConfig,
} from "../../providers/types.js";
import { createProviderWizard } from "../../providers/index.js";
import type { ProviderWizardField } from "../../providers/types.js";
import { finalizeAgentConfig } from "../utils/finalize-agent-config.js";
import { HoomanBanner } from "../ui/HoomanBanner.js";
import { KeyHints } from "../ui/KeyHints.js";

export type CreateAgentAppProps = {
  readonly container: HoomanContainer;
  readonly mode?: "create" | "edit";
  readonly editAgentId?: string;
  readonly onFinished?: () => void;
  /** Edit mode: return to the previous menu (e.g. update agent) without saving. */
  readonly onBack?: () => void;
};

const emptyOpenAI: OpenAIProviderConfig = {};
const emptyAnthropic: AnthropicProviderConfig = {};
const emptyBedrock: BedrockProviderConfig = {};
const emptyOllama: OllamaProviderConfig = {};

function getProviderField(
  p: ModelProvider,
  key: string,
  openai: OpenAIProviderConfig,
  anthropic: AnthropicProviderConfig,
  bedrock: BedrockProviderConfig,
  ollama: OllamaProviderConfig,
): string {
  switch (p) {
    case "openai":
      return String((openai as Record<string, string | undefined>)[key] ?? "");
    case "anthropic":
      return String(
        (anthropic as Record<string, string | undefined>)[key] ?? "",
      );
    case "bedrock":
      return String((bedrock as Record<string, string | undefined>)[key] ?? "");
    case "ollama":
      return String((ollama as Record<string, string | undefined>)[key] ?? "");
    default: {
      const _e: never = p;
      return _e;
    }
  }
}

function setProviderField(
  p: ModelProvider,
  key: string,
  value: string,
  setOpenai: Dispatch<SetStateAction<OpenAIProviderConfig>>,
  setAnthropic: Dispatch<SetStateAction<AnthropicProviderConfig>>,
  setBedrock: Dispatch<SetStateAction<BedrockProviderConfig>>,
  setOllama: Dispatch<SetStateAction<OllamaProviderConfig>>,
): void {
  switch (p) {
    case "openai":
      setOpenai((prev) => ({ ...prev, [key]: value }));
      break;
    case "anthropic":
      setAnthropic((prev) => ({ ...prev, [key]: value }));
      break;
    case "bedrock":
      setBedrock((prev) => ({ ...prev, [key]: value }));
      break;
    case "ollama":
      setOllama((prev) => ({ ...prev, [key]: value }));
      break;
    default: {
      const _e: never = p;
      void _e;
    }
  }
}

function finishOrExit(onFinished: CreateAgentAppProps["onFinished"]): void {
  if (onFinished) {
    onFinished();
  } else {
    process.exit(0);
  }
}

export function CreateAgentApp({
  container,
  mode = "create",
  editAgentId,
  onFinished,
  onBack,
}: CreateAgentAppProps) {
  const { llmRegistry } = container;
  const isEdit = mode === "edit" && Boolean(editAgentId);

  const [booting, setBooting] = useState(isEdit);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  /** How to enter instructions on step 1 (editor path skips back to step 2 immediately). */
  const [instrMode, setInstrMode] = useState<"choose" | "inline">("choose");
  const [provider, setProvider] = useState<ModelProvider>("openai");
  const [model, setModel] = useState(
    () => createProviderWizard("openai").defaultModelId,
  );
  const [openai, setOpenai] = useState<OpenAIProviderConfig>(emptyOpenAI);
  const [anthropic, setAnthropic] =
    useState<AnthropicProviderConfig>(emptyAnthropic);
  const [bedrock, setBedrock] = useState<BedrockProviderConfig>(emptyBedrock);
  const [ollama, setOllama] = useState<OllamaProviderConfig>(emptyOllama);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Edit mode: offer Skip vs change for steps that use TextInput (avoids stealing `s` from input). */
  const [namePhase, setNamePhase] = useState<"pick" | "type">(() =>
    mode === "edit" ? "pick" : "type",
  );
  const [providerFieldPhase, setProviderFieldPhase] = useState<"pick" | "type">(
    "type",
  );
  const [modelPhase, setModelPhase] = useState<"pick" | "type">("type");

  useEffect(() => {
    if (!isEdit || !editAgentId) {
      return;
    }
    void (async () => {
      try {
        const cfg = await readConfig(editAgentId);
        setName(cfg.name);
        const fromDisk = await read(editAgentId);
        setInstructions(fromDisk);
        setProvider(cfg.provider);
        setModel(cfg.model);
        setOpenai(cfg.openai ?? {});
        setAnthropic(cfg.anthropic ?? {});
        setBedrock(cfg.bedrock ?? {});
        setOllama(cfg.ollama ?? {});
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBooting(false);
      }
    })();
  }, [isEdit, editAgentId, container]);

  useEffect(() => {
    if (!isEdit) {
      setNamePhase("type");
    }
  }, [isEdit]);

  const fields: readonly ProviderWizardField[] = useMemo(
    () => createProviderWizard(provider).fields,
    [provider],
  );

  const modelStep = 3 + fields.length;

  const goBackInEditWizard = useCallback(() => {
    if (!isEdit || !onBack) {
      return;
    }
    if (step === 0 && namePhase === "pick") {
      onBack();
      return;
    }
    if (step === 1 && instrMode === "choose") {
      setStep(0);
      setNamePhase("pick");
      return;
    }
    if (step === 2) {
      setStep(1);
      setInstrMode("choose");
      return;
    }
    if (step >= 3 && step < modelStep && providerFieldPhase === "pick") {
      if (step === 3) {
        setStep(2);
      } else {
        setStep(step - 1);
        setProviderFieldPhase("pick");
      }
      return;
    }
    if (step === modelStep && modelPhase === "pick") {
      if (modelStep <= 3) {
        setStep(2);
      } else {
        setStep(modelStep - 1);
        setProviderFieldPhase("pick");
      }
    }
  }, [
    isEdit,
    onBack,
    step,
    namePhase,
    instrMode,
    modelStep,
    modelPhase,
    providerFieldPhase,
  ]);

  useEffect(() => {
    if (isEdit && step >= 3 && step < modelStep) {
      setProviderFieldPhase("pick");
    } else if (!isEdit && step >= 3 && step < modelStep) {
      setProviderFieldPhase("type");
    }
  }, [isEdit, step, modelStep]);

  useEffect(() => {
    if (step !== modelStep) {
      return;
    }
    setModelPhase(isEdit ? "pick" : "type");
  }, [step, modelStep, isEdit]);

  const defaultModelForProvider = (p: ModelProvider) =>
    createProviderWizard(p).defaultModelId;

  const performSave = useCallback(async () => {
    try {
      const baseConfig = finalizeAgentConfig(
        llmRegistry,
        {
          name,
          provider,
          model: model.trim() || defaultModelForProvider(provider),
        },
        { openai, anthropic, bedrock, ollama },
      );
      const instructionsBody =
        instructions.trim().length > 0
          ? instructions.endsWith("\n")
            ? instructions
            : `${instructions}\n`
          : "";
      if (!instructionsBody.trim()) {
        setError("Instructions cannot be empty.");
        return;
      }
      if (isEdit && editAgentId) {
        const prev = await readConfig(editAgentId);
        await writeConfig(editAgentId, { ...prev, ...baseConfig });
        await write(editAgentId, instructionsBody);
        setMessage(`Saved agent ${editAgentId}.`);
      } else {
        const agentId = await provision({
          config: baseConfig,
          instructions: instructionsBody,
        });
        setMessage(
          `Created agent ${agentId} (enabled). ~/.hoomanity/agents/${agentId}/ (see INSTRUCTIONS.md)`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [
    anthropic,
    bedrock,
    ollama,
    editAgentId,
    instructions,
    isEdit,
    llmRegistry,
    model,
    name,
    openai,
    provider,
  ]);

  /** Esc = back (dismiss / wizard navigation). Ctrl+C = quit the CLI (Ink exit-on-Ctrl+C disabled in cli.tsx). */
  useInput(
    (input, key) => {
      if (booting) {
        if (key.ctrl && input === "c") {
          process.exit(0);
          return;
        }
        if (key.escape) {
          if (isEdit && onBack) {
            onBack();
          } else {
            process.exit(0);
          }
        }
        return;
      }
      if (message || error) {
        if (key.ctrl && input === "c") {
          process.exit(0);
          return;
        }
        if (key.escape) {
          finishOrExit(onFinished);
        }
        return;
      }
      if (key.ctrl && input === "c") {
        process.exit(0);
      }
    },
    { isActive: true },
  );

  useInput(
    (_input, key) => {
      if (step !== 1 || instrMode !== "inline") {
        return;
      }
      if (key.escape) {
        setInstrMode("choose");
      }
    },
    { isActive: step === 1 && instrMode === "inline" && !message && !error },
  );

  useInput(
    (_input, key) => {
      if (!isEdit || message || error || step !== 0 || namePhase !== "type") {
        return;
      }
      if (key.escape) {
        setNamePhase("pick");
      }
    },
    {
      isActive:
        isEdit && step === 0 && namePhase === "type" && !message && !error,
    },
  );

  useInput(
    (_input, key) => {
      if (!isEdit || message || error || !key.escape) {
        return;
      }
      if (step >= 3 && step < modelStep && providerFieldPhase === "type") {
        setProviderFieldPhase("pick");
        return;
      }
      if (step === modelStep && modelPhase === "type") {
        setModelPhase("pick");
      }
    },
    {
      isActive:
        isEdit &&
        !message &&
        !error &&
        ((step >= 3 && step < modelStep && providerFieldPhase === "type") ||
          (step === modelStep && modelPhase === "type")),
    },
  );

  useInput(
    (_input, key) => {
      if (!key.escape || !isEdit || !onBack || message || error) {
        return;
      }
      goBackInEditWizard();
    },
    {
      isActive:
        isEdit &&
        Boolean(onBack) &&
        !message &&
        !error &&
        ((step === 0 && namePhase === "pick") ||
          (step === 1 && instrMode === "choose") ||
          step === 2 ||
          (step >= 3 && step < modelStep && providerFieldPhase === "pick") ||
          (step === modelStep && modelPhase === "pick")),
    },
  );

  const providerItems = useMemo(
    () =>
      llmRegistry.list().map((p) => ({
        label: createProviderWizard(p.key).displayLabel,
        value: p.key,
      })),
    [llmRegistry],
  );

  const providerSelectItems = useMemo(() => {
    const skip = isEdit
      ? [{ label: "Skip — keep current provider", value: "__skip__" }]
      : [];
    return [...skip, ...providerItems];
  }, [isEdit, providerItems]);

  const bannerSubtitle = isEdit ? "configure · model" : "configure · create";
  const shellTitle = isEdit ? "Model, provider & instructions" : "Create agent";

  if (booting) {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle={bannerSubtitle} />
        <Text bold color="magenta">
          {shellTitle}
        </Text>
        {isEdit && editAgentId ? (
          <Text dimColor>
            Agent <Text color="cyan">{editAgentId}</Text>
          </Text>
        ) : null}
        <Box marginTop={1}>
          <Text color="cyan">Loading agent…</Text>
        </Box>
      </Box>
    );
  }

  if (message) {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle={bannerSubtitle} />
        <Text bold color="magenta">
          {shellTitle}
        </Text>
        {isEdit && editAgentId ? (
          <Text dimColor>
            Agent <Text color="cyan">{editAgentId}</Text>
          </Text>
        ) : null}
        <Box marginTop={1}>
          <Text color="green">{message}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Esc — back · Ctrl+C — quit</Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <HoomanBanner subtitle={bannerSubtitle} />
        <Text bold color="magenta">
          {shellTitle}
        </Text>
        {isEdit && editAgentId ? (
          <Text dimColor>
            Agent <Text color="cyan">{editAgentId}</Text>
          </Text>
        ) : null}
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Esc — back · Ctrl+C — quit</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <HoomanBanner subtitle={bannerSubtitle} />
      <Text bold color="magenta">
        {shellTitle}
      </Text>
      {isEdit && editAgentId ? (
        <Text dimColor>
          Agent <Text color="cyan">{editAgentId}</Text>
        </Text>
      ) : (
        <Text dimColor>
          Display name, INSTRUCTIONS.md, provider keys, and model id
        </Text>
      )}
      <Box marginTop={1} flexDirection="column">
        {step === 0 && (
          <>
            <Text bold>Agent display name</Text>
            {isEdit && namePhase === "pick" ? (
              <>
                <Text dimColor>
                  Skip keeps the name on disk; change to edit.
                </Text>
                <SelectInput
                  items={[
                    {
                      label: `Skip — keep “${
                        name.trim()
                          ? name.length > 40
                            ? `${name.slice(0, 37)}…`
                            : name
                          : "(current)"
                      }”`,
                      value: "skip",
                    },
                    { label: "Change display name", value: "edit" },
                  ]}
                  onSelect={(item) => {
                    if (item.value === "skip") {
                      setStep(1);
                    } else {
                      setNamePhase("type");
                    }
                  }}
                />
              </>
            ) : (
              <>
                <TextInput
                  value={name}
                  placeholder="My assistant"
                  onChange={setName}
                  onSubmit={(v) => {
                    if (!v.trim()) {
                      return;
                    }
                    setName(v.trim());
                    setNamePhase(isEdit ? "pick" : "type");
                    setStep(1);
                  }}
                />
              </>
            )}
          </>
        )}
        {step === 1 && instrMode === "choose" && (
          <>
            <Text bold>
              System instructions (saved as INSTRUCTIONS.md in the agent folder)
            </Text>
            <Text dimColor>
              VISUAL or EDITOR opens your editor; Windows defaults to notepad if
              unset
            </Text>
            <SelectInput
              items={[
                ...(isEdit
                  ? [
                      {
                        label: "Skip — keep INSTRUCTIONS.md as-is",
                        value: "__skip__",
                      },
                    ]
                  : []),
                {
                  label: "Open $VISUAL / $EDITOR (multi-line)",
                  value: "editor",
                },
                {
                  label: "Type or paste here, Enter to continue",
                  value: "inline",
                },
              ]}
              onSelect={(item) => {
                if (item.value === "__skip__") {
                  setStep(2);
                  return;
                }
                if (item.value === "inline") {
                  setInstrMode("inline");
                  return;
                }
                try {
                  const text = openEditorWithInitialContent(
                    instructions.trim()
                      ? instructions
                      : "# Agent instructions\n\nYou are a helpful assistant.\n",
                  );
                  const t = text.trim();
                  if (!t) {
                    setError("Instructions cannot be empty.");
                    return;
                  }
                  setInstructions(text.endsWith("\n") ? text : `${text}\n`);
                  setStep(2);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}
            />
          </>
        )}
        {step === 1 && instrMode === "inline" && (
          <>
            <Text bold>System instructions — Enter when done</Text>
            {isEdit ? (
              <Text dimColor>
                To skip: go back to the menu above, then choose “Skip — keep
                INSTRUCTIONS.md”.
              </Text>
            ) : null}
            <Text dimColor>
              Multi-line paste is OK; content is written to INSTRUCTIONS.md on
              save
            </Text>
            <TextInput
              value={instructions}
              placeholder="You are a helpful assistant..."
              onChange={setInstructions}
              onSubmit={(v) => {
                if (!v.trim()) {
                  return;
                }
                setInstructions(v.endsWith("\n") ? v : `${v}\n`);
                setInstrMode("choose");
                setStep(2);
              }}
            />
          </>
        )}
        {step === 2 && (
          <>
            <Text bold>
              Model provider (AI SDK → OpenAI Agents via
              @openai/agents-extensions)
            </Text>
            <SelectInput
              items={providerSelectItems}
              onSelect={(item) => {
                if (item.value === "__skip__") {
                  setStep(3);
                  return;
                }
                const next = item.value as ModelProvider;
                const prev = provider;
                setProvider(next);
                if (!isEdit) {
                  setModel(createProviderWizard(next).defaultModelId);
                  setOpenai({});
                  setAnthropic({});
                  setBedrock({});
                  setOllama({});
                } else if (next !== prev) {
                  setModel(createProviderWizard(next).defaultModelId);
                }
                setStep(3);
              }}
            />
          </>
        )}
        {step >= 3 && step < modelStep && (
          <>
            {(() => {
              const idx = step - 3;
              const field = fields[idx];
              if (!field) {
                return null;
              }
              const val = getProviderField(
                provider,
                field.key,
                openai,
                anthropic,
                bedrock,
                ollama,
              );
              const goNextField = () => {
                if (idx + 1 < fields.length) {
                  setStep(step + 1);
                } else {
                  setStep(modelStep);
                }
              };
              const showPick = isEdit && providerFieldPhase === "pick";
              return (
                <>
                  <Text bold>
                    {field.label}
                    {field.required ? (
                      <>
                        {" "}
                        <Text color="red">*</Text>
                      </>
                    ) : null}{" "}
                    ({provider})
                  </Text>
                  {field.hint?.trim() ? (
                    <Text dimColor>{field.hint}</Text>
                  ) : null}
                  {showPick ? (
                    <>
                      <Text dimColor>
                        Skip keeps the saved value; change to edit this field.
                      </Text>
                      <SelectInput
                        items={[
                          { label: "Skip — keep saved value", value: "skip" },
                          { label: "Change this field", value: "edit" },
                        ]}
                        onSelect={(item) => {
                          if (item.value === "skip") {
                            goNextField();
                          } else {
                            setProviderFieldPhase("type");
                          }
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <TextInput
                        value={val}
                        placeholder=""
                        mask={field.mask}
                        onChange={(v) =>
                          setProviderField(
                            provider,
                            field.key,
                            v,
                            setOpenai,
                            setAnthropic,
                            setBedrock,
                            setOllama,
                          )
                        }
                        onSubmit={(v) => {
                          setProviderField(
                            provider,
                            field.key,
                            v,
                            setOpenai,
                            setAnthropic,
                            setBedrock,
                            setOllama,
                          );
                          goNextField();
                        }}
                      />
                    </>
                  )}
                </>
              );
            })()}
          </>
        )}
        {step === modelStep &&
          (() => {
            const modelPreview =
              model.trim() || defaultModelForProvider(provider);
            const modelPreviewShown =
              modelPreview.length > 36
                ? `${modelPreview.slice(0, 33)}…`
                : modelPreview;
            return (
              <>
                <Text bold>
                  Model id ({provider}) — default is fine for most cases
                </Text>
                {isEdit && modelPhase === "pick" ? (
                  <>
                    <Text dimColor>
                      Skip keeps the current model id; change to edit.
                    </Text>
                    <SelectInput
                      items={[
                        {
                          label: `Skip — keep “${modelPreviewShown}”`,
                          value: "skip",
                        },
                        { label: "Change model id", value: "edit" },
                      ]}
                      onSelect={(item) => {
                        if (item.value === "skip") {
                          void performSave();
                        } else {
                          setModelPhase("type");
                        }
                      }}
                    />
                  </>
                ) : (
                  <>
                    <TextInput
                      value={model}
                      placeholder={defaultModelForProvider(provider)}
                      onChange={setModel}
                      onSubmit={(v) => {
                        const m = v.trim() || defaultModelForProvider(provider);
                        setModel(m);
                        setModelPhase(isEdit ? "pick" : "type");
                        void performSave();
                      }}
                    />
                  </>
                )}
              </>
            );
          })()}
      </Box>
      <Box marginTop={1}>
        <KeyHints mode={isEdit && onBack ? "back_quit" : "configure_root"} />
      </Box>
    </Box>
  );
}
