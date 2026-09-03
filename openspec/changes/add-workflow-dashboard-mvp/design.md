# Design

The MVP has two local processes:

1. A TypeScript HTTP server reads the configured workspace's `.continuity/state.json`, Git status, and allowlisted report files. It returns only read-only JSON endpoints.
2. A React client renders the current change as a lane timeline and shows a compact task/checkpoint/artifact panel. It polls the API for updates.

The lane maps Continuity stages to visible nodes: `IDLE`, `SPEC_READY`, `CHECKPOINT_1`, `IMPL_IN_PROGRESS`, `IMPL_DONE`, `CHECKPOINT_2`, and `DONE`. Pending checkpoints and blockers are highlighted. The UI uses fixture data when the workspace has no active change so the structure remains inspectable.

The server validates every resolved path remains inside the configured workspace and exposes no mutation endpoint.
