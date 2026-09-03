# Requirements

## Restore Offline React Dashboard

### Scenario: Local React and ReactDOM UI
- **WHEN** the dashboard is loaded in a browser
- **THEN** it SHALL be powered by genuine React and ReactDOM components running in the client
- **AND** it SHALL NOT use vanilla DOM manipulation as a substitute for React.

### Scenario: Local bundling with zero runtime CDN
- **WHEN** the project is built via `npm run build`
- **THEN** React, ReactDOM, and application UI components SHALL be bundled locally using a local build tool (e.g. `esbuild`)
- **AND** the served HTML and bundle SHALL NOT reference or request any external CDN (e.g., `unpkg.com`, `cdnjs.cloudflare.com`, `jsdelivr.net`, `cdn.jsdelivr.net`, or external Babel)
- **AND** the dashboard SHALL render fully when the machine has no Internet connection.

### Scenario: Server security and read-only static hosting
- **WHEN** the dashboard server is started
- **THEN** it SHALL bind exclusively to loopback `127.0.0.1`
- **AND** it SHALL NOT emit `Access-Control-Allow-Origin: *` wildcard CORS headers
- **AND** it SHALL serve the pre-compiled local React bundle and static HTML
- **AND** it SHALL provide read-only API endpoints (`/api/health`, `/api/state`, `/api/git`, `/api/artifacts`) with segment-aware path containment preventing directory traversal or prefix-sibling bypasses.

### Scenario: Test verification
- **WHEN** tests are executed via `npm test`
- **THEN** tests SHALL verify that:
  1. The local React bundle exists and is served locally.
  2. No external CDN script or stylesheet links exist in the HTML response.
  3. Server binds to `127.0.0.1` without wildcard CORS.
  4. Path containment strictly enforces workspace boundaries.
  5. All test suites pass.
