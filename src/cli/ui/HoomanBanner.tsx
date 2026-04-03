import { useEffect, useState } from "react";
import { Box, Text, useStdout } from "ink";

const TITLE = "hooman";
const PALETTE = ["magenta", "cyan", "blue", "green", "yellow"] as const;

/** Rainbow title (static colors; no timer — avoids Ink redraws that break terminal scroll). */
export function HoomanBanner({ subtitle }: { readonly subtitle?: string }) {
  const { stdout } = useStdout();
  const [cols, setCols] = useState(() => Math.max(24, stdout?.columns ?? 80));

  useEffect(() => {
    const c = stdout;
    if (!c) {
      return;
    }
    const sync = () => setCols(Math.max(24, c.columns ?? 80));
    sync();
    c.on("resize", sync);
    return () => {
      c.off("resize", sync);
    };
  }, [stdout]);

  const inner = Math.max(0, cols - 2);
  const rule = `╭${"─".repeat(inner)}╮`;
  const ruleBot = `╰${"─".repeat(inner)}╯`;

  return (
    <Box flexDirection="column" marginBottom={1} width={cols}>
      <Text dimColor>{rule}</Text>
      <Box width={cols} flexDirection="row">
        <Box flexDirection="row" flexShrink={0}>
          <Text color="magenta">◆ </Text>
          {TITLE.split("").map((ch, i) => {
            const c = PALETTE[i % PALETTE.length];
            return (
              <Text key={i} bold color={c}>
                {ch}
              </Text>
            );
          })}
          {subtitle ? <Text dimColor> · {subtitle}</Text> : null}
        </Box>
        <Box flexGrow={1} minWidth={0} />
      </Box>
      <Text dimColor>{ruleBot}</Text>
    </Box>
  );
}
