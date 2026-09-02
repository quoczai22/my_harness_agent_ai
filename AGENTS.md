# Agent workflow

This repository uses a small reviewed workflow:

1. Create a change in `openspec/changes/` with a proposal, design, requirements, and tasks.
2. Register implementation tasks through the `continuity` MCP server.
3. Request and obtain a spec-review checkpoint before implementation.
4. Before a code change, call `get_status` and `check_scope`.
5. Run the relevant tests, mark implementation complete, and request implementation review.

`check_scope` is an advisory keyword-based guardrail, not an authorization system. Human review remains required for security-sensitive or destructive work.

For compact shell output, use `rtk` commands when RTK is installed. Do not hide failures: consult the full output file when RTK reports one.
