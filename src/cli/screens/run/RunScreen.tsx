import { useState, useEffect } from "react";
import type { HoomanContainer } from "../../container.js";
import { ContainerProvider } from "../../context/ContainerContext.js";
import { SelectAgentScreen } from "./SelectAgentScreen.js";
import { SessionPickerScreen } from "./SessionPickerScreen.js";
import { AgentChatScreen } from "./AgentChatScreen.js";
import { read as readConfig } from "../../../store/agent-config.js";
import { generateSessionId } from "../../../engine/memory/constants.js";

export type RunScreenProps = {
  readonly container: HoomanContainer;
  readonly initialAgentId?: string;
  readonly initialPrompt?: string;
  readonly onExit?: () => void;
  readonly onBack?: () => void;
};

export function RunScreen({
  container,
  initialAgentId,
  initialPrompt,
  onExit,
  onBack,
}: RunScreenProps) {
  const [step, setStep] = useState<"select" | "session" | "chat">(() =>
    initialAgentId ? "session" : "select",
  );
  const [agentId, setAgentId] = useState(initialAgentId || "");
  const [agentName, setAgentName] = useState("");
  const [sessionId, setSessionId] = useState("");

  // Load agent name when agentId changes
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

  const handleExit = () => {
    if (onExit) onExit();
    else process.exit(0);
  };

  const handleBackFromChat = () => {
    if (initialAgentId) {
      // Came from CLI with --agent, go back to session picker
      setSessionId("");
      setStep("session");
    } else {
      setSessionId("");
      setStep("session");
    }
  };

  const handleBackFromSession = () => {
    if (initialAgentId) {
      if (onBack) onBack();
      else handleExit();
    } else {
      setAgentId("");
      setAgentName("");
      setStep("select");
    }
  };

  // If initial prompt is provided with initial agent, skip session picker
  if (initialAgentId && initialPrompt && step === "session" && !sessionId) {
    const sid = generateSessionId();
    setSessionId(sid);
    setStep("chat");
  }

  return (
    <ContainerProvider container={container}>
      {step === "select" ? (
        <SelectAgentScreen
          onSelect={(id) => {
            setAgentId(id);
            setStep("session");
          }}
          onExit={handleExit}
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
