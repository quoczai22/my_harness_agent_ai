# Requirements

## R1 — Explicit selection

The Harness shall expose a visible **Choose workspace** action and shall not open a native picker without a direct user click.

## R2 — Native Windows picker

On Windows, the local service shall open a folder-only picker and return either one selected directory or a cancellation result.

## R3 — Safe fallback

When the native picker is unavailable, the UI shall allow an explicitly entered absolute directory path and explain that the path is processed only by the local loopback service.

## R4 — Validation

The server shall canonicalize the selected path, require an existing directory, reject files and malformed paths, and deduplicate workspaces by canonical path.

## R5 — Persistent registry

User-selected workspaces shall persist across Harness restarts in a Harness-owned local registry without modifying a project’s source files.

## R6 — Immediate switching

After successful registration, the UI shall add the workspace to the project selector, activate it, and load its safe index without restarting the server.

## R7 — Isolation

Files, selected context, sessions, prompts, and proposals shall remain isolated by canonical workspace root when the user switches projects.

## R8 — No ambient scanning

The Harness shall not scan complete drives, home directories, recent-file databases, or sibling folders to discover projects automatically.

## R9 — Existing safety rules

All existing loopback, traversal, secret filtering, size limit, generated-folder exclusion, and read-only proposal boundaries shall continue to apply.

## R10 — Verification

Tests shall cover successful registration, cancellation, invalid paths, duplicate paths, persistence, immediate API visibility, workspace isolation, and regressions in the full suite.

## R11 — Initial Project Flow

For every active workspace, the initial project screen shall display a bounded graph derived from safe indexed files and explicit local relationships. The graph shall support opening a represented file and shall disclose truncation when limits are reached.

## R12 — Evidence-bound graph

The Project Flow shall not invent routes, database relations, calls, or business steps that cannot be derived from indexed project evidence. Unknown or unsupported relationships shall be labeled accordingly.

## R13 — Harness execution flow

The initial screen shall display the provider-neutral Harness path from workspace selection through indexing, context preparation, routing, proposal review, human checkpoint, and later application.

## R14 — Honest live state

Harness Flow steps shall reflect actual local availability and workflow state. Antigravity execution may become active after explicit verification; provider execution or application steps that are not implemented shall remain disabled and visibly described as unavailable.

## R15 — Graph performance and accessibility

Both flows shall remain usable on narrow screens, expose a readable text/list representation, support keyboard navigation, and enforce node/edge limits so large projects do not freeze the UI.

## R16 — Official Antigravity discovery

Harness shall resolve the official `agy` executable from `PATH` or its standard Windows installation directory and shall report the installed version without making a model request.

## R17 — Explicit quota use

Harness shall not consume Antigravity quota during page load, workspace switching, or passive health checks. A model request may run only after an explicit connection-test or send action by the user.

## R18 — Safe headless transport

Harness shall send prompts through Antigravity stream-JSON stdin and parse stream-JSON results. It shall run the CLI in sandboxed plan mode, disable slash expansion, and never use `--dangerously-skip-permissions`.

## R19 — Context boundary

Antigravity shall run in a Harness-owned temporary directory outside the selected project root and receive only the bounded safe context packet. It shall not directly read or modify the original project through this adapter.

## R20 — Session continuity and isolation

The adapter shall associate Antigravity conversation identity, responses, usage, and errors with exactly one Harness session and canonical workspace. Conversation state shall never be reused by another project.

## R21 — Reviewable output

Antigravity responses shall appear in the active chat session. Proposed file changes shall remain read-only proposals/diffs; applying them is outside this change.

## R22 — Execution controls

Antigravity runs shall enforce input/output/time limits, support cancellation, terminate abandoned child processes, and expose terminal success, authentication-required, timeout, cancellation, and error states.

## R23 — Theme preference

Harness Atlas shall provide accessible Light, Dark, and System theme choices. The preference shall persist locally in the browser, System mode shall follow operating-system color-scheme changes, and the initial document shall apply the resolved theme before the React bundle loads to avoid a visible wrong-theme flash. Theme selection shall not alter project or session data.

