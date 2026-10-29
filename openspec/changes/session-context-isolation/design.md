# Design

- `AssistantStore.selectSession` validates the ID and persists it as `activeSessionId`.
- Sessions view posts `selectSession`; the extension refreshes both views.
- A helper turns recent user/assistant messages from the active session into an escaped, byte-bounded conversation transcript. It never reads another session and does not include system diagnostics.
- The transcript is placed before the current user request; current safe editor context remains bounded separately.
