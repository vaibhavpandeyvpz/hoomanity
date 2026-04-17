import { beforeEach, describe, expect, it } from "bun:test";
import { SlackFormatter } from "../../../src/listeners/slack/formatter";

describe("SlackFormatter", () => {
  let formatter: SlackFormatter;

  beforeEach(() => {
    formatter = new SlackFormatter();
  });

  it("returns input unchanged for empty strings", () => {
    expect(formatter.format("")).toBe("");
    expect(formatter.format("   \n\t  ")).toBe("   \n\t  ");
  });

  it("preserves plain text untouched", () => {
    expect(formatter.format("hello world")).toBe("hello world");
  });

  it("rewrites double-asterisk bold to single-asterisk mrkdwn bold", () => {
    expect(formatter.format("This is **bold** text")).toBe(
      "This is *bold* text",
    );
    expect(formatter.format("__also bold__")).toBe("*also bold*");
  });

  it("rewrites italics using underscores", () => {
    expect(formatter.format("an *italic* phrase")).toBe("an _italic_ phrase");
    expect(formatter.format("mixed _italic_ word")).toBe("mixed _italic_ word");
  });

  it("rewrites GFM strikethrough to single-tilde mrkdwn strike", () => {
    expect(formatter.format("before ~~gone~~ after")).toBe(
      "before ~gone~ after",
    );
  });

  it("preserves inline code verbatim without escaping", () => {
    expect(formatter.format("run `a < b && c > d`")).toBe(
      "run `a < b && c > d`",
    );
  });

  it("renders fenced code blocks without language tag", () => {
    expect(formatter.format("```ts\nconst x: T<U> = 1;\n```")).toBe(
      "```\nconst x: T<U> = 1;\n```",
    );
  });

  it("turns headings into bold lines", () => {
    expect(formatter.format("# Title\n\nbody text")).toBe(
      "*Title*\n\nbody text",
    );
  });

  it("escapes HTML entities in text but not in code", () => {
    expect(formatter.format("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
    expect(formatter.format("`a & b < c > d`")).toBe("`a & b < c > d`");
  });

  it("converts markdown links to <url|text> form", () => {
    expect(formatter.format("see [docs](https://example.com)")).toBe(
      "see <https://example.com|docs>",
    );
  });

  it("emits bare <url> when link text matches url", () => {
    expect(formatter.format("[https://x.io](https://x.io)")).toBe(
      "<https://x.io>",
    );
  });

  it("converts autolinks to <url>", () => {
    expect(formatter.format("<https://x.io>")).toBe("<https://x.io>");
  });

  it("converts mailto links", () => {
    expect(formatter.format("[Email me](mailto:a@b.com)")).toBe(
      "<mailto:a@b.com|Email me>",
    );
  });

  it("converts images to <url|alt>", () => {
    expect(formatter.format("![logo](https://example.com/a.png)")).toBe(
      "<https://example.com/a.png|logo>",
    );
  });

  it("resolves reference-style links", () => {
    expect(formatter.format("see [docs][d]\n\n[d]: https://example.com")).toBe(
      "see <https://example.com|docs>",
    );
  });

  it("renders unordered lists with bullet characters", () => {
    expect(formatter.format("- one\n- two\n- three")).toBe(
      "• one\n• two\n• three",
    );
  });

  it("renders ordered lists with numeric prefixes", () => {
    expect(formatter.format("1. first\n2. second\n3. third")).toBe(
      "1. first\n2. second\n3. third",
    );
  });

  it("indents nested lists and uses hollow bullet at deeper levels", () => {
    expect(formatter.format("- parent\n  - child\n  - sibling\n- next")).toBe(
      "• parent\n    ◦ child\n    ◦ sibling\n• next",
    );
  });

  it("renders task lists with checkbox markers", () => {
    expect(formatter.format("- [ ] pending\n- [x] done")).toBe(
      "• [ ] pending\n• [x] done",
    );
  });

  it("prefixes blockquote lines with literal greater-than", () => {
    expect(formatter.format("> line one\n> line two")).toBe(
      "> line one\n> line two",
    );
  });

  it("escapes > inside quoted content but keeps the leading marker literal", () => {
    const output = formatter.format("> a > b");
    expect(output.startsWith("> ")).toBe(true);
    expect(output).toBe("> a &gt; b");
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

  it("strips raw HTML tags while keeping inner text escaped", () => {
    expect(formatter.format("<div>hello <span>world</span></div>")).toBe(
      "hello world",
    );
  });

  it("numbers and appends footnotes at the end", () => {
    const output = formatter.format(
      "See note[^a] and another[^b].\n\n[^a]: First note.\n[^b]: Second note.",
    );
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
        "Welcome to *v2*! Check the <https://example.com/log|changelog>.",
        "",
        "*Highlights*",
        "",
        "• ~Old behaviour~ replaced",
        "• New `--flag` with _options_",
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
