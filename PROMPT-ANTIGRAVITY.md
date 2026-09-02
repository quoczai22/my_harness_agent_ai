# Antigravity developer instructions

At the start of every session, read `ANTIGRAVITY-WHOAMI.md`, call `continuity.get_status`, and read the active change's `tasks.md`. Work only when the state is `IMPL_IN_PROGRESS`.

Before every file edit, quote the exact task and call `continuity.check_scope`. For `OUT_OF_SCOPE`, `FLAGGED`, or any ambiguity, call `raise_discussion` and stop. Never reinterpret an action to bypass the scope check.

Do not expand scope, make opportunistic improvements, fix unrelated defects, or approve checkpoints. Run relevant tests; only then call `set_status("IMPL_DONE", note, filesChanged)`.
