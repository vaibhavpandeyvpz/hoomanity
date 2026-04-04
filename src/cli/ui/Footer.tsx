import { Box, Text } from "ink";
import { theme } from "./theme.js";
import { useSession } from "../context/SessionContext.js";
import { Spinner } from "./Spinner.js";

function pctCtxLeft(sessionTokens: number, window: number | null): string {
  if (window == null || window <= 0) {
    return "0%";
  }
  const p = Math.min(100, Math.round((sessionTokens / window) * 100));
  return `${p}%`;
}

function truncateString(s: string, maxLen: number): string {
  const t = s.trim();
  const absMax = Math.abs(maxLen);
  if (t.length <= absMax) return t;
  if (maxLen < 0) {
    return `…${t.slice(t.length - absMax + 1)}`;
  }
  return `${t.slice(0, maxLen - 1)}…`;
}

function StatusBarSection({ children }: { children: React.ReactNode }) {
  return <Text color={theme.headerText}>{children}</Text>;
}

export function Footer({
  mcpCount,
  skillsCount,
}: {
  mcpCount?: number;
  skillsCount?: number;
}) {
  const {
    agentId,
    meta,
    isRunning,
    sessionTokensSum,
    runningElapsedSec,
    streamingTpsEst,
  } = useSession();

  const cwdStr = truncateString(process.cwd(), -30);
  const mcpStr = mcpCount != null ? `mcp: ${mcpCount}` : "";
  const skillsStr = skillsCount != null ? `skills: ${skillsCount}` : "";

  const ctxWinStr = meta?.maxContextTokens
    ? pctCtxLeft(sessionTokensSum, meta.maxContextTokens)
    : "";

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box
        flexDirection="row"
        justifyContent="space-between"
        backgroundColor={theme.headerBg}
        paddingX={1}
      >
        <Box>
          <StatusBarSection>{agentId}</StatusBarSection>
          {meta?.model && (
            <StatusBarSection>
              {` · `}
              {truncateString(meta.model, 20)}
            </StatusBarSection>
          )}
        </Box>
        <Box>
          {isRunning ? (
            <StatusBarSection>
              <Spinner type="pulse" color={theme.accentSecondary} />{" "}
              {runningElapsedSec}s
              {streamingTpsEst != null
                ? ` · ~${streamingTpsEst.toFixed(1)} tk/s`
                : ""}
            </StatusBarSection>
          ) : (
            <StatusBarSection> · ready</StatusBarSection>
          )}
        </Box>
      </Box>
      <Box flexDirection="row" justifyContent="space-between" marginTop={0}>
        <Box>
          <Text color={theme.dim}> cwd: {cwdStr}</Text>
          {mcpStr && <Text color={theme.dim}> · {mcpStr}</Text>}
          {skillsStr && <Text color={theme.dim}> · {skillsStr}</Text>}
        </Box>
        <Box>
          <Text color={theme.dim}>
            ctx used: {ctxWinStr} ({sessionTokensSum}t){" "}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
