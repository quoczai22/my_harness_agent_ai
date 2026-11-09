# Requirements

- The Assistant Chat SHALL render a navigation marker for each persisted user message.
- A marker SHALL expose a bounded preview of its user prompt on hover/focus and SHALL navigate to that message when selected.
- Message anchors SHALL use persisted message IDs rather than array indexes.
- A new outgoing or incoming message SHALL scroll the chat pane to its newest content after rendering.
- A refresh with no new message SHALL preserve the reader's current scroll offset.
- Prompt content SHALL be escaped and marker bindings SHALL comply with the existing nonce CSP.
