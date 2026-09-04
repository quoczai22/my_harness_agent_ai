# Tasks

- [x] Implement CLI argument parsing (`--workspace`, `--port`) and validation in `src/dashboard.ts`.
- [x] Add CLI validation tests (nonexistent workspace rejection, invalid port rejection).
- [x] Add multi-instance tests serving distinct external workspaces and random ports with isolated state and shared bundle.
- [x] Verify artifact and state containment regressions (403 on traversal/outside-target) with CLI-launched instances.
- [x] Run `npm test`, update reports, and request implementation review.
