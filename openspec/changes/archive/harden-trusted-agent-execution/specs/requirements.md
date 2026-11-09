# Requirements

- Trusted mode SHALL expose a visible local command path that invokes only the guarded gateway.
- A create operation SHALL fail when its target already exists and SHALL never overwrite it.
- Replace SHALL require an existing safe regular file.
- Inline completion SHALL debounce, cancel stale work, and use valid Qwen FIM markers.
- Tests SHALL exercise actual create/replace application and all rejected cases.
