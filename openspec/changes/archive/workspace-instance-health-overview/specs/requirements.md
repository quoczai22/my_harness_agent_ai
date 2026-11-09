# Requirements

## Instance Health Probing & SSRF Prevention

- The server SHALL probe instance health exclusively on `http://127.0.0.1:<port>/api/health` for registered workspaces with a defined `port`.
- The server SHALL NOT accept arbitrary URLs, hostnames, IP addresses, or endpoints from HTTP query parameters, bodies, or headers for health checking.
- Health check requests SHALL use a strict timeout not exceeding 1000ms (default 800ms) with `AbortController` to guarantee bounded latency.
- If the target instance responds with HTTP 200 and `{ status: "ok" }`, `instanceHealth` SHALL be `"ONLINE"`.
- If the target instance is unreachable, timed out, connection refused, or responds with non-200, `instanceHealth` SHALL be `"OFFLINE"`.
- If no port is configured or the port is invalid, `instanceHealth` SHALL be `"UNKNOWN"`.

## Asynchronous Endpoint & React UI

- `GET /api/workspaces` SHALL include `instanceHealth` in each workspace summary object.
- The React dashboard UI SHALL render instance health badges (`ONLINE`, `OFFLINE`, `UNKNOWN`, `UNAVAILABLE`) on each workspace card.
- Slow or offline instances SHALL NOT crash the server or block `/api/workspaces` past the bounded timeout window.

## Security & Operational Invariants

- The server SHALL NOT spawn, restart, or kill processes.
- The server SHALL NOT scan the local filesystem for unlisted instances or open ports.
- The server SHALL bind strictly to `127.0.0.1`.
- The server SHALL reject all mutation HTTP methods with HTTP 405.
- The server SHALL NOT emit wildcard CORS headers.
- All workspace data and artifact queries SHALL enforce `isPathContained(targetWorkspaceRoot, targetPath)`.
