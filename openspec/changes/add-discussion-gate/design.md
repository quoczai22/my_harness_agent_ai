# Design

`ContextState.blockers` remains a JSON string array. `raise_discussion` appends a timestamped entry; `resolve_discussion` removes one matching entry and writes the resolution to `decisions`. `set_status` rejects all transitions while blockers are non-empty. The MCP adapter exposes both operations.
