# Tasks

- [ ] Add the pipeline schema, built-in default pipeline, validator, and transition/round logic with unit tests.
- [ ] Add agent configuration in agent-run's `config.json` shape, process runner with timeouts and cancellation, verdict parsing, and fake-agent test fixtures.
- [ ] Add per-run Git worktree and branch management, scope revert, and Harness-made commits, with tests on a temporary repository.
- [ ] Add the run engine, task queue, durable run/event storage, restart handling, and the Server-Sent Events endpoint; integration-test pass, fail-then-pass, and blocked-after-3 paths.
- [ ] Add Claude Code chat over `claude -p --output-format stream-json --resume`, per-session ids, and the task proposal→approve flow.
- [ ] Add repository import by local path and by `https://` clone.
- [ ] Rebuild the page into sessions, repositories, chat, agent cards and pipeline panel, keeping the Code tab; exercise it in a browser against fake agents.
- [ ] Run the full test suite, record one real run with Antigravity, Codex and Claude Code, then request implementation review.
