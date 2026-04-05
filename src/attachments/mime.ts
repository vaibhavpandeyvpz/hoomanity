/** MIME types sent as `input_image` (vision) in the Agents SDK. */
export function isVisionImageMime(mime: string): boolean {
  const base = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  return (
    base === "image/jpeg" ||
    base === "image/png" ||
    base === "image/gif" ||
    base === "image/webp"
  );
}
