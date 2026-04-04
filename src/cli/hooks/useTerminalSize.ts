import { useEffect, useState } from "react";
import { useStdout } from "ink";

export function useTerminalSize(minCols: number = 40) {
  const { stdout } = useStdout();
  const [cols, setCols] = useState(() =>
    Math.max(minCols, stdout?.columns ?? 80),
  );

  useEffect(() => {
    const c = stdout;
    if (!c) return;

    const sync = () => setCols(Math.max(minCols, c.columns ?? 80));
    sync();

    c.on("resize", sync);
    return () => {
      c.off("resize", sync);
    };
  }, [stdout, minCols]);

  return { cols };
}
