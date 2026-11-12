# Work Order: Agent Loop Pipeline

> **Status:** Accepted 2026-11-12 by the user in chat ("Duyệt") after real runs and two independent Codex reviews; see `reports/agent-loop-pipeline/verification.md`.

Implement `openspec/changes/agent-loop-pipeline`: a local Harness page with sessions, repository import, a Claude Code chat, per-agent cards, and a live pipeline that loops Antigravity (implement) → Codex (test gate) → Claude Code (review and commit), returning to Antigravity on failure and stopping after 3 failed rounds.

Agents write only inside a per-run Git worktree and branch. The Harness never merges or pushes. Do not start implementation before the spec review is approved.
