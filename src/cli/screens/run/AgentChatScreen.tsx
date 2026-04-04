import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useAgentSession } from "../../hooks/useAgentSession.js";
import { useMcpApproval } from "../../hooks/useMcpApproval.js";
import { useMcpStats } from "../../hooks/useMcpStats.js";
import { SessionProvider } from "../../context/SessionContext.js";
import { HoomanBanner } from "../../ui/HoomanBanner.js";
import { ChatMessage } from "../../ui/ChatMessage.js";
import { ChatInput } from "../../ui/ChatInput.js";
import { Footer } from "../../ui/Footer.js";
import { KeyHints } from "../../ui/KeyHints.js";
import { McpApprovalBlock } from "../../ui/McpApprovalBlock.js";
import { theme } from "../../ui/theme.js";

type Props = {
  agentId: string;
  sessionId?: string;
  initialPrompt?: string;
  onBack?: () => void;
  onExit: () => void;
};

export function AgentChatScreen({
  agentId,
  sessionId,
  initialPrompt,
  onBack,
  onExit,
}: Props) {
  const { mcpApprovalInfo, mcpApprovalPrompt, completeMcpApproval } =
    useMcpApproval();

  const session = useAgentSession(agentId, mcpApprovalPrompt, sessionId);
  const mcpStats = useMcpStats(agentId);

  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [hasSentInitial, setHasSentInitial] = useState(false);

  // ... rest of the code is fine, but I need to map meta
  // Wait, I can just replace the whole chunk

  // Auto-send initial prompt if provided
  if (
    initialPrompt &&
    session.state.isReady &&
    !hasSentInitial &&
    !session.state.isRunning
  ) {
    setHasSentInitial(true);
    setPrompt("");
    session.actions.submitPrompt(initialPrompt);
  }

  useInput(
    (input, key) => {
      if (mcpApprovalInfo) return; // intercepted by McpApprovalBlock

      if (key.ctrl && input === "c") {
        void session.actions.leaveSession().then(() => onExit());
        return;
      }

      if (key.escape) {
        if (session.state.isRunning) {
          session.actions.cancelPrompt();
        } else {
          void session.actions.leaveSession().then(() => {
            if (onBack) onBack();
            else onExit();
          });
        }
      }
    },
    { isActive: !mcpApprovalInfo },
  );

  return (
    <SessionProvider
      value={{ ...session.state, meta: session.state.agentMeta, agentId }}
    >
      <Box flexDirection="column" width="100%">
        <HoomanBanner subtitle="chat" compact />

        {session.state.error && (
          <Box marginBottom={1} paddingX={1}>
            <Text color={theme.error}>Error: {session.state.error}</Text>
          </Box>
        )}

        <Box flexDirection="column" marginTop={1}>
          {session.state.messages.map((m, i) => {
            const isPending =
              m.role === "assistant" &&
              session.state.isRunning &&
              i === session.state.messages.length - 1 &&
              m.text === "";

            return (
              <ChatMessage
                key={i}
                message={m}
                agentName={session.state.agentMeta?.name || "Agent"}
                isPendingAssistant={isPending}
                liveReasoning={isPending ? session.state.liveReasoning : ""}
              />
            );
          })}
        </Box>

        {mcpApprovalInfo && (
          <McpApprovalBlock
            toolName={mcpApprovalInfo.toolName}
            inputPreview={mcpApprovalInfo.inputPreview}
            onChoice={completeMcpApproval}
          />
        )}

        {(!session.state.isRunning || mcpApprovalInfo) && (
          <ChatInput
            value={prompt}
            onChange={setPrompt}
            onSubmit={(val) => {
              setPrompt("");
              session.actions.submitPrompt(val);
            }}
            isActive={!mcpApprovalInfo}
          />
        )}

        <Footer mcpCount={mcpStats?.mcp} skillsCount={mcpStats?.skills} />
        <KeyHints mode="custom">
          enter — send · esc{" "}
          {session.state.isRunning
            ? "— cancel prompt"
            : onBack
              ? "— menu"
              : "— leave"}{" "}
          · ctrl+c — quit
        </KeyHints>
      </Box>
    </SessionProvider>
  );
}
