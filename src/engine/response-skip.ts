/**
 * When the model’s **entire** intended user-visible reply is “no message”, it should output this
 * marker (see system instructions). The runner then skips {@link Channel.sendMessage} / CLI updates
 * for that turn (same idea as `[hooman:skip]` in the reference backend).
 */
export const RESPONSE_SKIP_MARKER = "[response:skip]" as const;

/** True if the assistant text should not be delivered to the user (channel / CLI). */
export function assistantOutputSkipsUserDelivery(text: string): boolean {
  return text.includes(RESPONSE_SKIP_MARKER);
}
