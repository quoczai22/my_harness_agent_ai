# Agent Loop Pipeline

Turn Harness Atlas from a read-only cockpit into a local workspace that runs a reviewed multi-agent loop on an imported repository, and shows that loop live.

The page gets four areas: a session list, a chat with Claude Code as the main AI, a place to import repositories, and a live view of the harness at work. The view shows one card per agent (Antigravity, Codex, Claude Code, plus local LM Studio/Ollama and the repository's own build/test command) and the pipeline the current run is following.

The default pipeline is the loop the user described: Claude Code splits a request into tasks; Antigravity builds the interface; Codex tests it; on failure the run returns to Antigravity with the failure; on success Claude Code reviews the result and commits it to the run branch; then the next task starts. Pipelines are data, so a stage can also be a documentation source, a local model, a shell command or a human checkpoint, not only one of the three cloud agents.

The engine follows what `~/agent-kit/bin/agent-run` already does on this machine (CLI invocation per agent, timeouts, allowed-file checks, `VERDICT:` parsing), rewritten in TypeScript inside the Harness so there is one application and one state store.

Decisions taken with the user on 2026-11-10:

- Build on Harness Atlas and borrow agent-run's mechanics; do not call agent-run as a subprocess.
- Agents write files only inside a per-run git worktree on its own branch. The imported repository's working tree is never written; merging stays with the user.
- A test stage passes only when the repository's real test command exits 0 and Codex reports `VERDICT: PASS`. A task stops after 3 failed rounds and waits for the user.
- After a pass, Claude Code reviews the diff; on approval the run branch receives a commit. Merging into the main branch remains the user's step.

This change amends requirement R8 of `universal-codeatlas-harness` ("This MVP shall not directly overwrite project files"): writes become allowed, but only inside an isolated worktree that the user merges.

Out of scope: merging or pushing, public hosting, storing account credentials (each CLI keeps its own login), running agents outside a worktree, and scheduled/unattended runs.
