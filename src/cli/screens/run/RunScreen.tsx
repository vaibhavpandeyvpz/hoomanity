import { useState, useEffect } from "react";
import type { HoomanContainer } from "../../container.js";
import { ContainerProvider } from "../../context/ContainerContext.js";
import { SelectAgentScreen } from "./SelectAgentScreen.js";
import { SessionPickerScreen } from "./SessionPickerScreen.js";
import { AgentChatScreen } from "./AgentChatScreen.js";
import { ChannelSelectScreen } from "./ChannelSelectScreen.js";
import { BotStatusScreen } from "./BotStatusScreen.js";
import { BotMemoryModeScreen } from "./BotMemoryModeScreen.js";
import { read as readConfig } from "../../../store/agent-config.js";
import {
  sessionIdForCliMain,
  type BotMemoryMode,
} from "../../../engine/memory/session-ids.js";
import { isBotChannelType } from "../../../channels/registry.js";
import type { ChannelType } from "../../../channels/types.js";

export type RunScreenProps = {
  readonly container: HoomanContainer;
  readonly initialAgentId?: string;
  readonly initialPrompt?: string;
  readonly initialChannel?: ChannelType;
  /** When starting the bot via `--channel`, skips the memory picker. */
  readonly initialBotMemoryMode?: BotMemoryMode;
  readonly onExit?: () => void;
  readonly onBack?: () => void;
};

function initialStep(
  initialAgentId: string | undefined,
  initialPrompt: string | undefined,
  initialChannel: ChannelType | undefined,
): "select" | "session" | "channel" | "chat" | "bot" | "botMemory" {
  if (initialAgentId) {
    if (initialChannel !== undefined && isBotChannelType(initialChannel)) {
      return "bot";
    }
    if (initialPrompt) {
      return "chat";
    }
    return "channel";
  }
  return "select";
}

export function RunScreen({
  container,
  initialAgentId,
  initialPrompt,
  initialChannel,
  initialBotMemoryMode,
  onExit,
  onBack,
}: RunScreenProps) {
  const [step, setStep] = useState<
    "select" | "session" | "channel" | "chat" | "bot" | "botMemory"
  >(() => initialStep(initialAgentId, initialPrompt, initialChannel));
  const [agentId, setAgentId] = useState(initialAgentId || "");
  const [agentName, setAgentName] = useState("");
  const [sessionId, setSessionId] = useState(() =>
    initialAgentId && initialPrompt ? sessionIdForCliMain() : "",
  );
  const [channelType, setChannelType] = useState<ChannelType>(
    initialChannel || "cli",
  );
  const [botMemoryMode, setBotMemoryMode] = useState<BotMemoryMode>(
    () => initialBotMemoryMode ?? "multi",
  );

  useEffect(() => {
    if (!agentId) return;
    void (async () => {
      try {
        const cfg = await readConfig(agentId);
        setAgentName(cfg.name);
      } catch {
        setAgentName(agentId);
      }
    })();
  }, [agentId]);

  useEffect(() => {
    if (step === "bot" && !isBotChannelType(channelType)) {
      setStep("channel");
    }
  }, [step, channelType]);

  const handleExit = () => {
    if (onExit) onExit();
    else process.exit(0);
  };

  const handleBackFromChat = () => {
    setSessionId("");
    setStep("session");
  };

  const handleBackFromBot = () => {
    if (initialChannel !== undefined && isBotChannelType(initialChannel)) {
      if (onBack) onBack();
      else handleExit();
      return;
    }
    setStep("botMemory");
  };

  const handleBackFromBotMemory = () => {
    setStep("channel");
  };

  const handleBackFromChannel = () => {
    if (initialAgentId && onBack) {
      onBack();
      return;
    }
    setAgentId("");
    setAgentName("");
    setStep("select");
  };

  const handleBackFromSession = () => {
    setSessionId("");
    setStep("channel");
  };

  const handleBackFromSelect = () => {
    if (initialAgentId && onBack) {
      onBack();
      return;
    }
    handleExit();
  };

  return (
    <ContainerProvider container={container}>
      {step === "select" ? (
        <SelectAgentScreen
          onSelect={(id) => {
            setAgentId(id);
            setStep("channel");
          }}
          onExit={handleBackFromSelect}
        />
      ) : step === "channel" ? (
        <ChannelSelectScreen
          agentId={agentId}
          onSelect={(chan) => {
            setChannelType(chan);
            if (chan === "cli") {
              setStep("session");
            } else {
              setStep("botMemory");
            }
          }}
          onBack={handleBackFromChannel}
        />
      ) : step === "session" ? (
        <SessionPickerScreen
          agentId={agentId}
          agentName={agentName || agentId}
          onSelect={(sid) => {
            setSessionId(sid);
            setStep("chat");
          }}
          onBack={handleBackFromSession}
          onExit={handleExit}
        />
      ) : step === "botMemory" ? (
        isBotChannelType(channelType) ? (
          <BotMemoryModeScreen
            agentName={agentName || agentId}
            channelType={channelType}
            onSelect={(mode) => {
              setBotMemoryMode(mode);
              setStep("bot");
            }}
            onBack={handleBackFromBotMemory}
            onExit={handleExit}
          />
        ) : null
      ) : step === "bot" ? (
        isBotChannelType(channelType) ? (
          <BotStatusScreen
            agentId={agentId}
            channelType={channelType}
            botMemoryMode={botMemoryMode}
            onBack={handleBackFromBot}
            onExit={handleExit}
          />
        ) : null
      ) : (
        <AgentChatScreen
          agentId={agentId}
          sessionId={sessionId}
          initialPrompt={initialPrompt}
          onBack={handleBackFromChat}
          onExit={handleExit}
        />
      )}
    </ContainerProvider>
  );
}
