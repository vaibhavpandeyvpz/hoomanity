import { useCallback, useRef, useState } from "react";
import type {
  McpApprovalChoice,
  McpApprovalPrompt,
} from "../../store/allowance.js";

export type McpApprovalInfo = {
  toolName: string;
  inputPreview: string;
  callId: string | undefined;
};

export function useMcpApproval() {
  const approvalResolveRef = useRef<
    ((choice: McpApprovalChoice) => void) | null
  >(null);
  const [mcpApprovalInfo, setMcpApprovalInfo] =
    useState<McpApprovalInfo | null>(null);

  const completeMcpApproval = useCallback((choice: McpApprovalChoice) => {
    const resolve = approvalResolveRef.current;
    approvalResolveRef.current = null;
    setMcpApprovalInfo(null);
    resolve?.(choice);
  }, []);

  const mcpApprovalPrompt = useCallback<McpApprovalPrompt>((info) => {
    return new Promise((resolve) => {
      const raw =
        typeof info.input === "string"
          ? info.input
          : info.input == null
            ? ""
            : JSON.stringify(info.input);
      const inputPreview = raw.length > 400 ? `${raw.slice(0, 397)}…` : raw;
      approvalResolveRef.current = resolve;
      setMcpApprovalInfo({
        toolName: info.toolName,
        inputPreview,
        callId: info.callId,
      });
    });
  }, []);

  const cancelPendingApproval = useCallback(() => {
    const pending = approvalResolveRef.current;
    if (pending) {
      approvalResolveRef.current = null;
      setMcpApprovalInfo(null);
      pending("deny");
    }
  }, []);

  return {
    mcpApprovalInfo,
    mcpApprovalPrompt,
    completeMcpApproval,
    cancelPendingApproval,
  };
}
