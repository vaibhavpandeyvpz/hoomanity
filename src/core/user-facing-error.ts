const ACP_AUTH_REQUIRED_CODE = -32000;

type RequestLikeError = {
  code?: unknown;
  message?: unknown;
};

/**
 * Convert low-level ACP / transport errors into short user-facing text.
 */
export function toUserFacingErrorMessage(error: unknown): string {
  if (isAuthRequiredError(error)) {
    return "Agent authentication is required. Authenticate the ACP agent, then retry your message.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isAuthRequiredError(error: unknown): boolean {
  const req = error as RequestLikeError | undefined;
  if (!req || typeof req !== "object") {
    return false;
  }
  if (req.code === ACP_AUTH_REQUIRED_CODE) {
    return true;
  }
  return (
    typeof req.message === "string" &&
    req.message.toLowerCase().includes("authentication required")
  );
}
