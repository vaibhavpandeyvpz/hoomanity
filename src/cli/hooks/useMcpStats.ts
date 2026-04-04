import { useEffect, useState } from "react";
import { useContainer } from "../context/ContainerContext.js";

export function useMcpStats(agentId: string) {
  const container = useContainer();
  const [stats, setStats] = useState<{ mcp: number; skills: number } | null>(
    null,
  );

  useEffect(() => {
    if (!agentId) return;

    let canceled = false;
    void (async () => {
      try {
        const [mcp, skills] = await Promise.all([
          container.mcpRegistry.list(agentId).catch(() => []),
          container.skillsRegistry.list(agentId).catch(() => []),
        ]);
        if (!canceled) {
          setStats({ mcp: mcp.length, skills: skills.length });
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      canceled = true;
    };
  }, [container, agentId]);

  return stats;
}
