# Requirements

## L1 — Workspace layout

The page shall present a session list, a repository list with an import action, a chat with Claude Code, per-agent cards, and a live pipeline panel at the same time on a desktop-width screen, and stack them on narrow screens. The existing file tree, preview and Project Flow shall remain reachable.

## L2 — Repository import

The user shall be able to register a local folder by path and clone an `https://` Git URL into a configured directory. The Harness shall not store Git credentials.

## L3 — Claude Code chat

Each Harness session shall keep its own Claude Code session id and stream replies to the page. The main chat shall run in a read-only permission mode. Turning a request into tasks shall require the user's approval before tasks enter the queue.

## L4 — Pipelines as data

Pipelines shall be JSON documents made of `context`, `agent`, `command`, `gate`, `human` and `commit` stages with optional pass/fail transitions and a round limit. The Harness shall ship the default pipeline Antigravity implement → Codex test gate → Claude review → commit, and shall reject invalid pipelines with an actionable message.

## L5 — Isolated writes

Each run shall work in its own Git worktree and branch outside the imported repository. No stage shall write to the imported repository's working tree, merge, or push.

## L6 — Gates and rounds

A test gate shall pass only when the repository's test command exits 0 and the agent reports `VERDICT: PASS`. A failure shall return to the configured stage with the failure details in the next prompt. After 3 failed rounds (configurable) the task shall become `blocked` and the run shall wait for the user.

## L7 — Scope enforcement

Files changed outside a task's allowed files shall be reverted and count as a failed round.

## L8 — Review and commit

After a passing gate, Claude Code shall review the diff against the task's acceptance criteria. On `PASS` the Harness shall commit the worktree to the run branch; on `FAIL` the run shall follow the review stage's failure transition.

## L9 — Live, durable observation

Every stage start, output chunk, verdict, round change and commit shall be recorded in a per-run event log and streamed to the page while it runs. Agent cards and the pipeline panel shall reflect the current stage, round and last result, and the log shall survive a restart.

## L10 — Control

The user shall be able to start, pause at the next stage boundary, cancel, and resume a run, and approve or reject `human` stages. Cancelling shall stop the running agent process.

## L11 — Honest agent status

Agent cards shall keep the existing four availability states and shall not show a stage as passed without a recorded verdict or exit code.

## L12 — Amended R8

Requirement R8 of `universal-codeatlas-harness` is amended: generated changes may be written, but only inside a run worktree, and reach the user's repository only through a merge the user performs.
