import { splitChatText } from "@daviddh/llm-markdown-whatsapp";
import type { IFormatter } from "../../core/formatter";

export class WhatsAppFormatter implements IFormatter {
  format(text: string): string[] {
    const chunks = splitChatText(text)
      .map((part) => part.trim())
      .filter(Boolean);
    return chunks.length > 0 ? chunks : [text];
  }
}
