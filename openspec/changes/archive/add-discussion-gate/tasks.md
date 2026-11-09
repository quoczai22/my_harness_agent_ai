# Tasks

- [ ] Add `raiseDiscussion` and `resolveDiscussion` to `src/store.ts`; done when blocker state changes are persisted and resolutions are audited. Keywords: `store.ts`, `blockers`, `decisions`.
- [ ] Expose the discussion APIs and the three-keyword validation through `src/index.ts`; done when MCP schemas return structured success or errors. Keywords: `index.ts`, `raise_discussion`, `resolve_discussion`.
- [ ] Extend `src/store.test.ts`; done when unresolved blockers reject a status transition and resolution restores it. Keywords: `store.test.ts`, `setStatus`, `resolveDiscussion`.
- [ ] Add role prompts and a session anchor; done when the manager and developer instructions describe the discussion gate. Keywords: `PROMPT-CODEX.md`, `PROMPT-ANTIGRAVITY.md`, `ANTIGRAVITY-WHOAMI.md`.
