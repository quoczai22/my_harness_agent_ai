# Requirements

## CLI & Option Parsing

- The dashboard launcher SHALL parse `--workspace` (or `-w`) and `--port` (or `-p`) arguments.
- Precedence SHALL be: explicit function options > CLI flags > environment variables > defaults.
- The launcher SHALL validate that the target workspace exists and is a directory before listening.
- Nonexistent or non-directory workspace paths SHALL produce a clear error and reject startup before listening.
- Port values SHALL be validated as integers between 1 and 65535; invalid values SHALL reject startup before listening.

## Instance Isolation & Asset Decoupling

- Each dashboard instance SHALL serve exactly one workspace on its configured loopback port.
- `/bundle.js` SHALL be delivered from the fixed module-relative dashboard install path regardless of target workspace location.
- `/api/state`, `/api/artifacts`, and `/api/git` SHALL strictly remain confined to the chosen `workspaceRoot`.
- Requests attempting path traversal or referencing files outside `workspaceRoot` SHALL return 403.

## Security & Protocol Constraints

- The dashboard server SHALL bind only to `127.0.0.1`.
- The dashboard server SHALL reject all write/mutation methods (POST, PUT, DELETE, etc.) with HTTP 405.
- The dashboard server SHALL NOT set any wildcard CORS (`Access-Control-Allow-Origin: *`) headers.
