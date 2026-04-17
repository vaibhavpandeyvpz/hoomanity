import type {
  Blockquote,
  Code,
  Definition,
  FootnoteDefinition,
  FootnoteReference,
  Heading,
  Html,
  Image,
  ImageReference,
  InlineCode,
  Link,
  LinkReference,
  List,
  ListItem,
  Nodes,
  Paragraph,
  Parent,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  TableRow,
  Text,
  ThematicBreak,
} from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { IFormatter } from "../../core/formatter";

type DefinitionEntry = { url: string; title: string | null };

/**
 * Converts GitHub-flavored markdown into Slack `mrkdwn` text, following the
 * syntax documented at https://docs.slack.dev/messaging/formatting-message-text/.
 *
 * Supported output constructs:
 *  - `*bold*`, `_italic_`, `~strike~`
 *  - `` `inline code` `` and ```` ```multi-line code``` ```` (language tag stripped)
 *  - `> quote` (one `>` per line, nesting supported)
 *  - Bullet lists rendered with `•`/`◦`, ordered lists with `N.`
 *  - Links as `<url|text>` / `<url>` / `<mailto:addr|label>`
 *  - Tables rendered inside aligned monospace blocks
 *  - Headings rendered as bold lines
 *  - Footnotes renumbered and appended at the end
 *
 * Text nodes are HTML-escaped per Slack's rules (`&`, `<`, `>` become
 * `&amp;`, `&lt;`, `&gt;`) so arbitrary output cannot be misinterpreted as
 * Slack control syntax. Code (inline and fenced) is emitted verbatim.
 */
export class SlackFormatter implements IFormatter {
  private definitions = new Map<string, DefinitionEntry>();
  private footnotes = new Map<string, FootnoteDefinition>();
  private footnoteOrder: string[] = [];

  format(text: string): string {
    if (!text || text.trim().length === 0) {
      return text;
    }

    this.definitions = new Map();
    this.footnotes = new Map();
    this.footnoteOrder = [];

    const tree = unified().use(remarkParse).use(remarkGfm).parse(text) as Root;
    this.collectReferences(tree);

    const body = this.renderBlocks(tree.children);
    const footnotes = this.renderFootnotes();
    const combined = footnotes ? `${body}\n\n${footnotes}` : body;

    const rewritten = combined
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return rewritten.length > 0 ? rewritten : text;
  }

  private collectReferences(node: Nodes): void {
    if (node.type === "definition") {
      const def = node as Definition;
      this.definitions.set(def.identifier.toLowerCase(), {
        url: def.url,
        title: def.title ?? null,
      });
    }
    if (node.type === "footnoteDefinition") {
      const def = node as FootnoteDefinition;
      this.footnotes.set(def.identifier.toLowerCase(), def);
    }
    if ("children" in node && Array.isArray((node as Parent).children)) {
      for (const child of (node as Parent).children) {
        this.collectReferences(child as Nodes);
      }
    }
  }

  private renderBlocks(children: RootContent[]): string {
    const parts: string[] = [];
    for (const child of children) {
      const rendered = this.renderBlock(child);
      if (rendered !== null && rendered.length > 0) {
        parts.push(rendered);
      }
    }
    return parts.join("\n\n");
  }

  private renderBlock(node: RootContent): string | null {
    switch (node.type) {
      case "paragraph":
        return this.renderInline((node as Paragraph).children);
      case "heading":
        return this.renderHeading(node as Heading);
      case "blockquote":
        return this.renderBlockquote(node as Blockquote);
      case "list":
        return this.renderList(node as List, 0);
      case "code":
        return this.renderCode(node as Code);
      case "thematicBreak":
        return this.renderThematicBreak(node as ThematicBreak);
      case "table":
        return this.renderTable(node as Table);
      case "html":
        return this.renderHtml((node as Html).value);
      case "definition":
      case "footnoteDefinition":
      case "yaml":
        return null;
      default:
        if ("children" in node && Array.isArray((node as Parent).children)) {
          return this.renderInline(
            (node as Parent).children as PhrasingContent[],
          );
        }
        return null;
    }
  }

  private renderHeading(node: Heading): string {
    const text = this.renderInline(node.children).trim();
    return text.length > 0 ? `*${text}*` : "";
  }

  private renderBlockquote(node: Blockquote): string {
    const inner = this.renderBlocks(node.children);
    if (!inner) return "";
    return inner
      .split("\n")
      .map((line) => (line.length > 0 ? `> ${line}` : ">"))
      .join("\n");
  }

  private renderList(node: List, depth: number): string {
    const indent = "    ".repeat(depth);
    const ordered = node.ordered === true;
    const start = typeof node.start === "number" ? node.start : 1;
    const bulletChar = depth % 2 === 0 ? "•" : "◦";

    const lines: string[] = [];
    node.children.forEach((item, index) => {
      const bullet = ordered ? `${start + index}. ` : `${bulletChar} `;
      const rendered = this.renderListItem(item, depth, bullet, indent);
      if (rendered.length > 0) {
        lines.push(rendered);
      }
    });
    return lines.join("\n");
  }

  private renderListItem(
    item: ListItem,
    depth: number,
    bullet: string,
    indent: string,
  ): string {
    const pieces: string[] = [];
    for (const child of item.children) {
      if (child.type === "list") {
        pieces.push(this.renderList(child as List, depth + 1));
      } else if (child.type === "paragraph") {
        pieces.push(this.renderInline((child as Paragraph).children));
      } else {
        const rendered = this.renderBlock(child);
        if (rendered !== null && rendered.length > 0) {
          pieces.push(rendered);
        }
      }
    }

    let body = pieces.join("\n");
    if (item.checked === true) body = `[x] ${body}`;
    else if (item.checked === false) body = `[ ] ${body}`;

    if (body.length === 0) return "";

    const continuation = " ".repeat([...bullet].length);
    const rawLines = body.split("\n");
    const first = `${indent}${bullet}${rawLines[0] ?? ""}`;
    const rest = rawLines.slice(1).map((line) => {
      if (line.length === 0) return "";
      if (line.startsWith("    ")) return `${indent}${line}`;
      return `${indent}${continuation}${line}`;
    });
    return [first, ...rest].join("\n");
  }

  private renderCode(node: Code): string {
    const value = (node.value ?? "").replace(/\r\n?/g, "\n");
    return `\`\`\`\n${value}\n\`\`\``;
  }

  private renderThematicBreak(_node: ThematicBreak): string {
    return "---";
  }

  private renderTable(node: Table): string {
    const rows: string[][] = node.children.map((row: TableRow) =>
      row.children.map((cell) =>
        this.renderInline(cell.children).replace(/\s+/g, " ").trim(),
      ),
    );
    if (rows.length === 0) return "";

    const colCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const widths: number[] = [];
    for (let c = 0; c < colCount; c += 1) {
      widths[c] = rows.reduce(
        (max, row) => Math.max(max, (row[c] ?? "").length),
        0,
      );
    }

    const formatRow = (cells: string[]): string =>
      cells
        .concat(Array(colCount - cells.length).fill(""))
        .map((cell, i) => (cell ?? "").padEnd(widths[i] ?? 0))
        .join(" | ")
        .replace(/\s+$/g, "");

    const lines: string[] = [];
    for (let r = 0; r < rows.length; r += 1) {
      const row = rows[r];
      if (!row) continue;
      lines.push(formatRow(row));
      if (r === 0 && rows.length > 1) {
        const sep = widths.map((w) => "-".repeat(Math.max(w, 1))).join("-+-");
        lines.push(sep);
      }
    }

    return `\`\`\`\n${lines.join("\n")}\n\`\`\``;
  }

  private renderHtml(raw: string): string {
    const stripped = raw
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]*>/g, "");
    return escapeMrkdwnText(stripped.trim());
  }

  private renderInline(children: readonly PhrasingContent[]): string {
    return children.map((child) => this.renderInlineNode(child)).join("");
  }

  private renderInlineNode(node: PhrasingContent): string {
    switch (node.type) {
      case "text":
        return escapeMrkdwnText((node as Text).value);
      case "strong": {
        const inner = this.renderInline(node.children).trim();
        return inner.length > 0 ? `*${inner}*` : "";
      }
      case "emphasis": {
        const inner = this.renderInline(node.children).trim();
        return inner.length > 0 ? `_${inner}_` : "";
      }
      case "delete": {
        const inner = this.renderInline(node.children).trim();
        return inner.length > 0 ? `~${inner}~` : "";
      }
      case "inlineCode":
        return `\`${(node as InlineCode).value}\``;
      case "break":
        return "\n";
      case "link":
        return this.renderLink(node as Link);
      case "image":
        return this.renderImage(node as Image);
      case "linkReference":
        return this.renderLinkReference(node as LinkReference);
      case "imageReference":
        return this.renderImageReference(node as ImageReference);
      case "footnoteReference":
        return this.renderFootnoteReference(node as FootnoteReference);
      case "html":
        return this.renderHtml((node as Html).value);
      default:
        if ("children" in node && Array.isArray((node as Parent).children)) {
          return this.renderInline(
            (node as Parent).children as PhrasingContent[],
          );
        }
        return "";
    }
  }

  private renderLink(node: Link): string {
    const text = this.renderInline(node.children).trim();
    return formatMrkdwnLink(text, node.url);
  }

  private renderImage(node: Image): string {
    return formatMrkdwnLink(escapeMrkdwnText(node.alt ?? ""), node.url);
  }

  private renderLinkReference(node: LinkReference): string {
    const text = this.renderInline(node.children).trim();
    const def = this.definitions.get(node.identifier.toLowerCase());
    if (!def) {
      return text.length > 0
        ? text
        : escapeMrkdwnText(`[${node.label ?? node.identifier}]`);
    }
    return formatMrkdwnLink(text, def.url);
  }

  private renderImageReference(node: ImageReference): string {
    const def = this.definitions.get(node.identifier.toLowerCase());
    const alt = escapeMrkdwnText(node.alt ?? "");
    if (!def) {
      return alt.length > 0
        ? alt
        : escapeMrkdwnText(`[${node.label ?? node.identifier}]`);
    }
    return formatMrkdwnLink(alt, def.url);
  }

  private renderFootnoteReference(node: FootnoteReference): string {
    const id = node.identifier.toLowerCase();
    if (!this.footnotes.has(id))
      return escapeMrkdwnText(`[^${node.identifier}]`);
    if (!this.footnoteOrder.includes(id)) this.footnoteOrder.push(id);
    const index = this.footnoteOrder.indexOf(id) + 1;
    return `[^${index}]`;
  }

  private renderFootnotes(): string {
    if (this.footnoteOrder.length === 0) return "";
    const parts: string[] = [];
    this.footnoteOrder.forEach((id, idx) => {
      const def = this.footnotes.get(id);
      if (!def) return;
      const body = this.renderBlocks(def.children).replace(/\n+/g, " ").trim();
      parts.push(`[^${idx + 1}]: ${body}`);
    });
    return parts.join("\n");
  }
}

function escapeMrkdwnText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatMrkdwnLink(text: string, url: string): string {
  const cleanUrl = (url ?? "").trim();
  if (cleanUrl.length === 0) return text;
  const label = text.trim();
  if (
    label.length === 0 ||
    label === cleanUrl ||
    label === escapeMrkdwnText(cleanUrl)
  ) {
    return `<${cleanUrl}>`;
  }
  return `<${cleanUrl}|${label}>`;
}
