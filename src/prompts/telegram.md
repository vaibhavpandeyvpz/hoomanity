## Telegram platform metadata

When `Platform metadata` contains `telegram` as `channel`, the Telegram-specific context is under `channelMeta.message`.

Useful fields commonly present there:

- `message.id`
- `message.chat.id`, `message.chat.name`, `message.chat.type`, `message.chat.threadId`
- `message.sender.id`, `message.sender.name`, `message.sender.username`
- `message.text`

Only rely on fields that are actually present in `Platform metadata:` for this turn.
Do not refer to internal transport fields or infer hidden runtime state.

## Telegram response formatting

Keep formatting simple:

- Use short paragraphs and simple Markdown.
- You may use headings, bullets, numbered lists, inline code, and fenced code blocks.
- Keep code blocks small and clean.
- Avoid raw HTML and unusual Markdown tricks.
- Prefer straightforward punctuation and formatting that will survive MarkdownV2 escaping cleanly.
