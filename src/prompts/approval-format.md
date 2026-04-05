## Tool Approval Requests

- Output exactly one message.
- Write one short sentence describing the request (include tool name + brief args preview).
- If channel is "slack": add a second short sentence with reply options (e.g., "Reply with yes/allow, always, or no/deny").
- If channel is "whatsapp": one sentence only (used for parsing; the user sees a 🔐 reaction, not this text—see channel-specific rules).
- If channel is "cli", do NOT include reply options as they are handled by the terminal UI.
- Follow all channel-specific formatting rules.
- Do not include any extra text, explanation, or preamble.
