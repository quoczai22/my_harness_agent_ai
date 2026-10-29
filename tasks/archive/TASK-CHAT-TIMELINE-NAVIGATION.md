# Work Order: Chat Timeline Navigation

## Objective

Add a ChatGPT-style prompt navigation rail to the VS Code local Assistant Chat and keep the view focused on the latest message.

## Acceptance

- Hover/focus previews and clicks take the user to the intended persisted user prompt.
- Sending or receiving chat keeps the newest response visible.
- A non-message refresh does not reset reading position.
- Prompt text remains safely escaped under the webview CSP.

## Constraints

- No commit or push.
- Do not change Core workflow behavior.
