# Proposal: Workspace picker and local project registry

## Why

Harness Atlas currently starts with a workspace supplied on the command line or in a hand-written registry. The user needs to choose another project directly from the UI and have Harness remember it without editing paths or restarting the service.

## What changes

- Add an explicit **Choose workspace** action to the Harness Atlas project switcher.
- On Windows, open a native folder picker only after the user clicks that action.
- Canonicalize and validate the selected directory before registering it.
- Persist user-selected workspaces in a Harness-owned local registry and merge them with configured workspaces.
- Switch the UI to the newly selected project and preserve per-project session/context isolation.
- Provide a typed-path fallback when a native picker is unavailable.
- Build an initial **Project Flow** from safe indexed files and explicit local relationships.
- Show a separate **Harness Flow** from workspace selection through safe context, provider routing, proposal review, checkpoint, and later application.
- Connect the installed official Antigravity CLI (`agy`) as the first real provider adapter.
- Send bounded context through headless stream-JSON input and return the answer, usage, and conversation identity to the active Harness session.

## Non-goals

- No automatic drive-wide scanning.
- No background discovery of private folders.
- No reading a project until the user explicitly selects it.
- No deletion or modification of project source files.
- No invented business flow when relationships cannot be proven from project files.
- No automatic quota-consuming Antigravity request during page load or provider discovery.
- No `--dangerously-skip-permissions` and no direct Antigravity writes to the selected project.

