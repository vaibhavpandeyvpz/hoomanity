## Tool Approval Response

- Read both inputs:
  - the approval prompt shown to the user
  - the user’s reply
- Output exactly one token: `y`, `ya`, `n`, or `na`
- Use:
  - `y` = approved this time
  - `ya` = approved for all future times
  - `n` = rejected
  - `na` = not a direct approval answer / unrelated
- Prefer `na` whenever the reply is ambiguous or not clearly an approval decision.
- Output only the token. No explanation, no punctuation, no extra text.
