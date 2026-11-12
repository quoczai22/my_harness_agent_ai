# Design

## Page layout

The existing three-column workspace is reorganized into four areas:

1. **Left rail**: the session list for the selected repository (create, rename, archive) and the repository list with an **Import repo** action.
2. **Centre**: the chat with Claude Code. Each Harness session keeps its own Claude Code session id, so switching sessions never mixes conversations.
3. **Right rail**: one card per agent or tool: Antigravity, Codex, Claude Code, LM Studio, Ollama, and the repository's build/test command. Each card shows availability (existing honest states: available, authentication required, offline, not installed) and, during a run, what it is doing now, its round, and its last result.
4. **Bottom panel**: the pipeline of the current run as a row of stages with live status (waiting, running, passed, failed, skipped), the round counter, the task queue, and the event log. Selecting a stage shows its prompt, output tail, verdict and the diff it produced.

The existing file tree, file preview and Project Flow move behind a **Code** tab, so nothing current is lost.

## Repository import

- **Register a local folder**: the existing registry flow. A typed absolute path works in WSL; the Windows folder picker is offered only on Windows.
- **Clone from URL**: `https://` Git URLs only, cloned with `git clone` into a configured projects directory and then registered. No credentials are stored; private repositories rely on the user's own Git credential setup.

## Chat with Claude Code

The server runs `claude -p <message> --output-format stream-json --resume <id>` (no `--resume` on a session's first message) with the repository as the working directory and `--permission-mode plan`, so the main chat reads and plans but does not edit. Output streams to the browser over Server-Sent Events. The chat can turn a request into tasks: Claude Code returns a JSON task list (id, title, owner stage, allowedFiles, acceptance), which the user approves before it enters the queue, the same proposal→approve step agent-run uses.

## Pipeline definition

A pipeline is a JSON document stored per repository in the Harness state directory. The built-in default:

```json
{
  "id": "ui-test-review",
  "maxRounds": 3,
  "stages": [
    { "id": "context", "kind": "context", "sources": ["README.md", "AGENTS.md", "DESIGN.md", "openspec/"] },
    { "id": "build-ui", "kind": "agent", "agent": "antigravity", "role": "implement" },
    { "id": "test", "kind": "gate", "command": "test", "agent": "codex", "role": "test",
      "onPass": "review", "onFail": "build-ui" },
    { "id": "review", "kind": "agent", "agent": "claude", "role": "review",
      "onPass": "commit", "onFail": "build-ui" },
    { "id": "commit", "kind": "commit" }
  ]
}
```

Stage kinds:

- `context`: assembles the existing bounded context packet from listed documentation sources; no model call.
- `agent`: runs one agent in a role (`plan`, `implement`, `test`, `review`). Agents: `claude`, `codex`, `antigravity`, `lmstudio`, `ollama`. LM Studio and Ollama answer through their loopback HTTP APIs and cannot edit files, so they take only reading roles (`plan`, `test`, `review`).
- `command`: runs the repository's Build or Test command.
- `gate`: a command and an agent verdict that must both pass.
- `human`: pauses the run until the user approves or rejects in the UI.
- `commit`: commits the worktree to the run branch.

Transitions default to the next stage; `onPass`/`onFail` override them. A failure that returns to an earlier stage starts a new round; when a task reaches `maxRounds` failures it is marked `blocked` and the run waits for the user. The validator rejects unknown stage ids, cycles without a gate, and pipelines without a `commit` or `human` end.

## Run engine

- **Isolation**: each run gets a branch `harness/<runId>` and a `git worktree` under the Harness state directory, outside the imported repository. Every agent process runs with that worktree as its working directory. The imported repository's working tree is never written; the user merges the branch when satisfied. A repository with uncommitted changes can still be used: the worktree starts from its `HEAD`, and the UI says so.
- **Agent invocation**: commands come from a config file that uses agent-run's `config.json` shape (`cmd` for writing roles, `review_cmd` for read-only roles, `{prompt}` placeholder). The first run copies the user's `~/agent-kit/config.json` when present. Processes are spawned without a shell, with per-role timeouts, and can be cancelled from the UI.
- **Prompts**: each agent prompt contains the task, its acceptance criteria and allowed files, the context packet, and, after a failure, the failing stage's verdict, issues and the tail of the test output.
- **Scope check**: after an `implement` stage, changed files outside the task's `allowedFiles` are reverted and count as a failed round, as in agent-run.
- **Verdicts**: `test` and `review` roles must end with `VERDICT: PASS | FAIL` and `ISSUES:`. A missing verdict is retried once and then counts as a failure. Gates require both the command's exit code 0 and `PASS`.
- **Commit**: the Harness, not the agent, commits after a passing review, using a message that names the task and the review verdict.
- **Concurrency**: one active run per repository; a second request queues.

## State and live updates

- Runs, tasks and pipelines are stored per repository under the Harness state directory using the existing locked JSON store. Each run also appends events to a JSONL log (stage started, output chunk, verdict, round change, commit), which survives restarts.
- `GET /api/runs/:id/events` streams events over Server-Sent Events; the UI rebuilds the agent cards and pipeline row from them.
- On restart, runs that were mid-stage are marked `interrupted`; the user can resume from the last completed stage.

## Security boundaries

Unchanged: loopback-only binding, registered-workspace containment, secret and vendor filtering for context, no credentials in browser state or repository files.

New:

- Writes happen only inside the run's worktree. Paths are validated against the worktree root.
- Agent CLIs are run with fixed argument arrays from config; user text reaches them only as the prompt argument or a prompt file, never through a shell.
- No merge or push is performed by the Harness.
- Clone accepts `https://` URLs only.
- Loop state, run worktrees and the agent config live in a per-user directory outside every repository (`$HARNESS_STATE_DIR`, else `$XDG_STATE_HOME/harness-atlas`, else `~/.local/state/harness-atlas`).
- Before and after every agent, command and gate stage the Harness compares the imported repository's HEAD, branch and working-tree status; any change stops the run with the task blocked. Atlas chat metadata under `.continuity/harness/` is excluded.
- A changed path that is a symlink pointing outside the worktree is reverted and counts as a failed round.
- `/api/loop/*` requires a loopback Host; POSTs also require the page's own Origin and a JSON body.
- Repository build/test commands are the user's own configured strings and run with `sh -c` in the worktree.

Known limits, recorded from the independent review on 2026-11-12: agent CLIs run with the user's own permissions, so containment rests on each CLI's mode (Codex sandbox, Claude permission mode) plus the after-the-fact repository check above; that check cannot see a push to a remote. Another process of the same user can still call the loopback API. Closing these needs an OS-level sandbox and is out of scope for this change.

## Verification

Unit tests for the pipeline validator, transition and round counting, verdict parsing, scope revert, worktree creation and cleanup, and the Claude stream-json parser. An integration test runs the default pipeline against a temporary Git repository with fake agent commands (scripts that edit files and print verdicts), covering: pass on the first round, fail then pass, and stop after 3 failures. The UI is exercised in a browser against that fake setup; a real run with the three CLIs is a manual check recorded in the review.
