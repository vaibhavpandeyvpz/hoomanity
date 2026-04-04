import { useState } from "react";
import type { HoomanContainer } from "../../container.js";
import { ContainerProvider } from "../../context/ContainerContext.js";
import { SelectAgentScreen } from "./SelectAgentScreen.js";
import { AgentChatScreen } from "./AgentChatScreen.js";

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
  const [step, setStep] = useState<"select" | "chat">(() =>
    initialAgentId ? "chat" : "select",
  );
  const [agentId, setAgentId] = useState(initialAgentId || "");

  const handleExit = () => {
    if (onExit) onExit();
    else process.exit(0);
  };

  const handleBack = () => {
    if (initialAgentId) {
      if (onBack) onBack();
      else handleExit();
    } else {
      setStep("select");
      setAgentId("");
    }
  };

  return (
    <ContainerProvider container={container}>
      {step === "select" ? (
        <SelectAgentScreen
          onSelect={(id) => {
            setAgentId(id);
            setStep("chat");
          }}
          onExit={handleExit}
        />
      ) : (
        <AgentChatScreen
          agentId={agentId}
          initialPrompt={initialPrompt}
          onBack={handleBack}
          onExit={handleExit}
        />
      )}
    </ContainerProvider>
  );
}
