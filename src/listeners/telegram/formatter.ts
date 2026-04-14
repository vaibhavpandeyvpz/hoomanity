import { createRequire } from "node:module";
import type { IFormatter } from "../../core/formatter";

const require = createRequire(import.meta.url);
const telegramify = require("telegramify-markdown") as (
  markdown: string,
  unsupportedTagsStrategy?: "escape" | "remove" | "keep",
) => string;

export class TelegramFormatter implements IFormatter {
  format(text: string): string[] {
    return [telegramify(text, "escape")];
  }
}
