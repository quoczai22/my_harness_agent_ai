# Agent loop pipeline: verification

Date: 2026-11-12. Machine: WSL2 (Linux), Node 22.23.4, user `kami`.
Agents: Antigravity (`agy`, Gemini 3.8 Flash medium), Codex (`codex exec`, gpt-5.6-luna medium), Claude Code (`claude -p`), with commands from `~/agent-kit/config.json`.

## Automated tests

`npm test`: 86/86 pass (51 earlier tests, 35 for the loop).

## Real runs (throwaway repository, task "Trang chào mừng", allowed files `index.html`, `style.css`)

1. Pass in one round: Antigravity wrote both files (43 s), the test command passed and Codex answered `VERDICT: PASS` after checking the criteria (13 s), Claude reviewed `VERDICT: PASS` (7 s), Harness committed `38ab297` to `harness/run-20261112160218-540822`. The repository's `main` working tree stayed unchanged.
2. Fail, loop back, pass: the test command required class `btn-primary`, which the task did not mention. Round 1: the command failed and Codex answered `VERDICT: FAIL` ("add class btn-primary to the login button"). The run went back to Antigravity with that failure, round 2 passed the gate, Claude passed, Harness committed `f3c34a5`.
3. Earlier (2026-11-10), while Codex was out of quota: the first run showed a false PASS because `codex exec` echoes the prompt; fixed in `bcd56da`. The re-run blocked the task at round 0 with Codex's own quota message.

## Browser check

Headless Chrome against fake agents and two demo repositories: chat, task proposals, approval, a run that fails once and loops back, commits on the run branch, conversations grouped per repository, light, dark and 420 px layouts, no console errors. Screenshots in this folder.

## Independent review

Codex, read-only, 2026-11-12: `VERDICT: FAIL` with five findings. Checked one by one:

| Finding | Assessment | Action |
|---|---|---|
| Loop state and worktrees under the Harness root, which can be the imported repository | Valid when the Harness root is the repository being worked on | Moved to a per-user state directory outside all repositories |
| Test command runs with `sh -c` | By design: the user's own command | Documented; changing it now needs a same-origin POST |
| Agents can write outside the worktree | Valid; no OS sandbox | Repository fingerprint before and after each stage; a change stops the run |
| Symlinks pointing outside the worktree | Valid | Reverted and counted as a failed round |
| POST without Origin accepted | Valid | POSTs require the page's Origin |

Remaining limits are listed in the design's security section.

Second Codex review of the fix commit `eba992a`: three of the four fixes confirmed; three gaps reported, all valid and fixed in the next commit: a state directory set inside the repository is refused; the symlink check runs after every agent, command and gate stage whatever its outcome; loop state is keyed by registry id plus repository path.
