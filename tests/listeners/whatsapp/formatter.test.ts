import { beforeEach, describe, expect, it } from "bun:test";
import { WhatsAppFormatter } from "../../../src/listeners/whatsapp/formatter";

describe("WhatsAppFormatter", () => {
  let formatter: WhatsAppFormatter;

  beforeEach(() => {
    formatter = new WhatsAppFormatter();
  });

  it("returns input unchanged for empty strings", () => {
    expect(formatter.format("")).toBe("");
    expect(formatter.format("   \n\t  ")).toBe("   \n\t  ");
  });

  it("preserves plain text untouched", () => {
    expect(formatter.format("hello world")).toBe("hello world");
  });

  it("rewrites bold markers to WhatsApp syntax", () => {
    expect(formatter.format("This is **bold** text")).toBe(
      "This is *bold* text",
    );
    expect(formatter.format("__also bold__")).toBe("*also bold*");
  });

  it("rewrites italics using underscores", () => {
    expect(formatter.format("an *italic* phrase")).toBe("an _italic_ phrase");
    expect(formatter.format("mixed _italic_ word")).toBe("mixed _italic_ word");
  });

  it("rewrites strikethrough from GFM to WhatsApp syntax", () => {
    expect(formatter.format("before ~~gone~~ after")).toBe(
      "before ~gone~ after",
    );
  });

  it("preserves inline code and converts fenced blocks", () => {
    const input = "run `npm test` then:\n\n```js\nconst x = 1;\n```";
    const output = formatter.format(input);
    expect(output).toContain("`npm test`");
    expect(output).toContain("```\nconst x = 1;\n```");
    expect(output).not.toContain("```js");
  });

  it("turns headings into bold lines", () => {
    expect(formatter.format("# Title\n\nbody text")).toBe(
      "*Title*\n\nbody text",
    );
  });

  it("renders nested bold and italic combinations", () => {
    expect(formatter.format("***both***")).toBe("_*both*_");
    expect(formatter.format("**bold _nested_ inside**")).toBe(
      "*bold _nested_ inside*",
    );
  });

  it("renders links using text (url) form", () => {
    expect(formatter.format("see [docs](https://example.com)")).toBe(
      "see docs (https://example.com)",
    );
  });

  it("collapses bare links whose text equals the url", () => {
    expect(formatter.format("[https://x.io](https://x.io)")).toBe(
      "https://x.io",
    );
  });

  it("converts images to alt (url) form", () => {
    expect(formatter.format("![logo](https://example.com/a.png)")).toBe(
      "logo (https://example.com/a.png)",
    );
  });

  it("resolves reference-style links", () => {
    const input = "see [docs][d]\n\n[d]: https://example.com";
    expect(formatter.format(input)).toBe("see docs (https://example.com)");
  });

  it("formats unordered lists with asterisks", () => {
    expect(formatter.format("- one\n- two\n- three")).toBe(
      "* one\n* two\n* three",
    );
  });

  it("formats ordered lists with numeric prefixes", () => {
    expect(formatter.format("1. first\n2. second\n3. third")).toBe(
      "1. first\n2. second\n3. third",
    );
  });

  it("indents nested lists by four spaces", () => {
    expect(formatter.format("- parent\n  - child\n  - sibling\n- next")).toBe(
      "* parent\n    * child\n    * sibling\n* next",
    );
  });

  it("renders task lists with checkbox markers", () => {
    expect(formatter.format("- [ ] pending\n- [x] done")).toBe(
      "* [ ] pending\n* [x] done",
    );
  });

  it("prefixes blockquote lines with greater-than", () => {
    expect(formatter.format("> line one\n> line two")).toBe(
      "> line one\n> line two",
    );
  });

  it("renders nested blockquotes correctly", () => {
    const output = formatter.format("> outer\n>\n> > inner");
    expect(output.split("\n")[0]).toBe("> outer");
    expect(output).toContain("> > inner");
  });

  it("converts horizontal rule to triple dash", () => {
    expect(formatter.format("above\n\n---\n\nbelow")).toBe(
      "above\n\n---\n\nbelow",
    );
  });

  it("renders tables inside a monospace block with aligned columns", () => {
    const output = formatter.format("| h1 | h2 |\n| --- | --- |\n| a | bb |");
    expect(output.startsWith("```")).toBe(true);
    expect(output.endsWith("```")).toBe(true);
    expect(output).toContain("h1 | h2");
    expect(output).toContain("a  | bb");
    expect(output).toContain("---+---");
  });

  it("strips raw HTML tags but keeps inner text", () => {
    expect(formatter.format("<div>hello <span>world</span></div>")).toBe(
      "hello world",
    );
  });

  it("numbers and appends footnotes at the end", () => {
    const input =
      "See note[^a] and another[^b].\n\n[^a]: First note.\n[^b]: Second note.";
    const output = formatter.format(input);
    expect(output).toContain("See note[^1] and another[^2].");
    expect(output).toContain("[^1]: First note.");
    expect(output).toContain("[^2]: Second note.");
  });

  it("collapses surplus blank lines", () => {
    expect(formatter.format("first\n\n\n\nsecond")).toBe("first\n\nsecond");
  });

  it("can be reused across multiple format calls without state leaking", () => {
    const first = formatter.format("note[^a]\n\n[^a]: first");
    const second = formatter.format("note[^a]\n\n[^a]: second");
    expect(first).toContain("[^1]: first");
    expect(second).toContain("[^1]: second");
    expect(second).not.toContain("first");
  });

  it("renders a mixed document end-to-end", () => {
    const input = [
      "# Release Notes",
      "",
      "Welcome to **v2**! Check the [changelog](https://example.com/log).",
      "",
      "## Highlights",
      "",
      "- ~~Old behaviour~~ replaced",
      "- New `--flag` with _options_",
      "",
      "> Remember to upgrade.",
      "",
      "```ts",
      "const v = 2;",
      "```",
    ].join("\n");
    expect(formatter.format(input)).toBe(
      [
        "*Release Notes*",
        "",
        "Welcome to *v2*! Check the changelog (https://example.com/log).",
        "",
        "*Highlights*",
        "",
        "* ~Old behaviour~ replaced",
        "* New `--flag` with _options_",
        "",
        "> Remember to upgrade.",
        "",
        "```",
        "const v = 2;",
        "```",
      ].join("\n"),
    );
  });
});
