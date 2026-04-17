import { beforeEach, describe, expect, it } from "bun:test";
import { TelegramFormatter } from "../../../src/listeners/telegram/formatter";

describe("TelegramFormatter", () => {
  let formatter: TelegramFormatter;

  beforeEach(() => {
    formatter = new TelegramFormatter();
  });

  it("returns input unchanged for empty strings", () => {
    expect(formatter.format("")).toBe("");
    expect(formatter.format("   \n\t  ")).toBe("   \n\t  ");
  });

  it("escapes all reserved punctuation in plain text", () => {
    expect(formatter.format("1 + 2 = 3.")).toBe("1 \\+ 2 \\= 3\\.");
    expect(formatter.format("hi (world)!")).toBe("hi \\(world\\)\\!");
    expect(formatter.format("path\\to/file")).toBe("path\\\\to/file");
  });

  it("does not escape non-reserved characters like &, <, >", () => {
    expect(formatter.format("a & b")).toBe("a & b");
  });

  it("rewrites bold and italic to single-char markers", () => {
    expect(formatter.format("This is **bold** text")).toBe(
      "This is *bold* text",
    );
    expect(formatter.format("an *italic* phrase")).toBe("an _italic_ phrase");
  });

  it("rewrites strikethrough to single tilde", () => {
    expect(formatter.format("before ~~gone~~ after")).toBe(
      "before ~gone~ after",
    );
  });

  it("emits inline code and escapes backticks/backslashes inside", () => {
    expect(formatter.format("run `npm test`")).toBe("run `npm test`");
    expect(formatter.format("see `a \\ b` here")).toBe("see `a \\\\ b` here");
  });

  it("does not escape reserved chars inside inline code", () => {
    expect(formatter.format("code: `1 + 2 = 3.`")).toBe("code: `1 + 2 = 3.`");
  });

  it("preserves fenced code block language tag and escapes backticks/backslashes", () => {
    expect(formatter.format("```ts\nconst x: T = 1;\n```")).toBe(
      "```ts\nconst x: T = 1;\n```",
    );
  });

  it("escapes backticks inside fenced code body", () => {
    expect(formatter.format("```\nx = `y`\n```")).toBe("```\nx = \\`y\\`\n```");
  });

  it("turns headings into bold lines", () => {
    expect(formatter.format("# Release Notes\n\nbody.")).toBe(
      "*Release Notes*\n\nbody\\.",
    );
  });

  it("renders links with reserved text escaped and URL escaping ) and backslash", () => {
    expect(formatter.format("see [docs.v2](https://example.com)")).toBe(
      "see [docs\\.v2](https://example.com)",
    );
    expect(formatter.format("[x](https://a.com/foo(bar))")).toBe(
      "[x](https://a.com/foo(bar\\))",
    );
  });

  it("renders autolinks", () => {
    expect(formatter.format("<https://x.io>")).toBe(
      "[https://x\\.io](https://x.io)",
    );
  });

  it("renders mailto links", () => {
    expect(formatter.format("[Email](mailto:a@b.com)")).toBe(
      "[Email](mailto:a@b.com)",
    );
  });

  it("resolves reference-style links", () => {
    expect(formatter.format("see [docs][d]\n\n[d]: https://example.com")).toBe(
      "see [docs](https://example.com)",
    );
  });

  it("renders images as links", () => {
    expect(formatter.format("![logo](https://example.com/a.png)")).toBe(
      "[logo](https://example.com/a.png)",
    );
  });

  it("renders unordered lists with bullets that do not require escaping", () => {
    expect(formatter.format("- one\n- two\n- three")).toBe(
      "• one\n• two\n• three",
    );
  });

  it("renders ordered lists with escaped dot", () => {
    expect(formatter.format("1. first\n2. second\n3. third")).toBe(
      "1\\. first\n2\\. second\n3\\. third",
    );
  });

  it("indents nested lists with hollow bullet at odd depths", () => {
    expect(formatter.format("- parent\n  - child\n  - sibling\n- next")).toBe(
      "• parent\n    ◦ child\n    ◦ sibling\n• next",
    );
  });

  it("renders task lists with escaped brackets", () => {
    expect(formatter.format("- [ ] pending\n- [x] done")).toBe(
      "• \\[ \\] pending\n• \\[x\\] done",
    );
  });

  it("prefixes blockquote lines with a literal greater-than", () => {
    expect(formatter.format("> first\n> second")).toBe(">first\n>second");
  });

  it("escapes > inside quoted content while keeping the leading marker literal", () => {
    expect(formatter.format("> a > b")).toBe(">a \\> b");
  });

  it("supports nested blockquotes", () => {
    expect(formatter.format("> outer\n>\n> > inner")).toBe(
      ">outer\n>\n>>inner",
    );
  });

  it("renders horizontal rule as em dashes that need no escape", () => {
    expect(formatter.format("above\n\n---\n\nbelow")).toBe(
      "above\n\n———\n\nbelow",
    );
  });

  it("renders tables as code blocks with aligned columns and no escapes inside", () => {
    const output = formatter.format("| h.1 | h2 |\n| --- | --- |\n| a | bb |");
    expect(output.startsWith("```\n")).toBe(true);
    expect(output.endsWith("\n```")).toBe(true);
    expect(output).toContain("h.1 | h2");
    expect(output).toContain("---+---");
    expect(output).not.toContain("\\.");
  });

  it("strips raw HTML tags while escaping the remaining text", () => {
    expect(formatter.format("<div>hello (world)</div>")).toBe(
      "hello \\(world\\)",
    );
  });

  it("numbers and appends footnotes at the end with escaped brackets", () => {
    const output = formatter.format(
      "See note[^a] and another[^b].\n\n[^a]: First note.\n[^b]: Second note.",
    );
    expect(output).toContain("See note\\[^1\\] and another\\[^2\\]\\.");
    expect(output).toContain("\\[^1\\]: First note\\.");
    expect(output).toContain("\\[^2\\]: Second note\\.");
  });

  it("collapses surplus blank lines", () => {
    expect(formatter.format("first\n\n\n\nsecond")).toBe("first\n\nsecond");
  });

  it("can be reused across multiple format calls without state leaking", () => {
    const first = formatter.format("note[^a]\n\n[^a]: first");
    const second = formatter.format("note[^a]\n\n[^a]: second");
    expect(first).toContain("\\[^1\\]: first");
    expect(second).toContain("\\[^1\\]: second");
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
        "Welcome to *v2*\\! Check the [changelog](https://example.com/log)\\.",
        "",
        "*Highlights*",
        "",
        "• ~Old behaviour~ replaced",
        "• New `--flag` with _options_",
        "",
        ">Remember to upgrade\\.",
        "",
        "```ts",
        "const v = 2;",
        "```",
      ].join("\n"),
    );
  });
});
