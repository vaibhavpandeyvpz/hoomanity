import { IFormatter } from "../../core/formatter";
import { markdownToSlack } from "md-to-slack";

export class SlackFormatter implements IFormatter {
  format(text: string): string[] {
    return [markdownToSlack(text)];
  }
}
