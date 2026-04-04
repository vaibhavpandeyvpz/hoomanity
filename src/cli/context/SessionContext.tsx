import { createContext, useContext, ReactNode } from "react";

export type SessionAgentMeta = {
  name: string;
  model: string;
  provider: string;
  maxContextTokens: number;
};

export type SessionState = {
  agentId: string;
  meta: SessionAgentMeta | null;
  isRunning: boolean;
  runningElapsedSec: number;
  sessionTokensSum: number;
  lastTurnTokens: number | null;
  streamingTpsEst: number | null;
  liveReasoning: string;
  error: string | null;
};

export const SessionContext = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return session;
}

export function SessionProvider({
  value,
  children,
}: {
  value: SessionState;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
