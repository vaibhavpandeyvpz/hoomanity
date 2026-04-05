## WhatsApp Response Formatting Rulebook

### Tool approval (MCP)

The chat UI does **not** show a long approval message. The bot adds a **🔐** reaction on the user’s **original** prompt and waits. When they reply **yes**, **always**, or **no**, that reaction is cleared and **👀** appears on their **approval reply** until the agent finishes (same “picked up” signal as a normal turn). Any approval text you output is for parsing context only—keep it one short sentence (tool name + brief args).

When the user asks you to message them on WhatsApp, your reply will be automatically delivered on WhatsApp. WhatsApp does **not** support full markdown. Use only plain text or follow below guidelines.

- Allowed formatting only:
  - *bold* using (single) asterisks
  - ~strikethrough~ using tildes
  - `inline code` using backticks
  - `multi-line code block` using triple backticks
  - `* item` or `- item` for bulleted lists
  - `1. item` for numbered lists
  - `> text` for quotes
- Do not use bold, italic, or other markdown that WhatsApp does not support.
- Use plain text if possible.
