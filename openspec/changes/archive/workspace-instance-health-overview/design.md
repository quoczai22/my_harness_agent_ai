# Design: Workspace instance health overview

## Technical Design

### Health probe mechanism
In `src/dashboard.ts`, implement `probeWorkspaceInstanceHealth(port: number, timeoutMs = 800)`:
```ts
export async function probeWorkspaceInstanceHealth(
  port: number,
  timeoutMs = 800
): Promise<"ONLINE" | "OFFLINE" | "UNKNOWN"> {
  if (typeof port !== "number" || !Number.isSafeInteger(port) || port <= 0 || port > 65535) {
    return "UNKNOWN";
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: controller.signal,
      headers: { "Accept": "application/json" }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === "ok") {
        return "ONLINE";
      }
    }
    return "OFFLINE";
  } catch {
    return "OFFLINE";
  } finally {
    clearTimeout(timeout);
  }
}
```

### SSRF Prevention Architecture
- **Fixed Origin**: Probing is hardcoded to `http://127.0.0.1:${port}/api/health`.
- **Strict Source of Truth**: `port` is retrieved exclusively from the pre-validated registry entry (`loadWorkspaceRegistry` / `validateWorkspaceRegistryData`).
- **Zero URL Parameter Injection**: No query parameter (such as `?target=...` or `?host=...`) or request header is ever accepted to specify a probe host or endpoint.

### Bounded Latency & Asynchronous Resolution
In `getWorkspacesSummaryList(registry)`:
- Workspace summaries and instance health checks are resolved asynchronously using `Promise.all()` with individual timeout wrappers.
- The total response time for `GET /api/workspaces` is capped at the maximum single-probe timeout (`~800ms`), ensuring the primary dashboard remains fast and responsive.

### Extended WorkspaceSummary Schema
```ts
export interface WorkspaceSummary {
  id: string;
  name: string;
  path: string;
  port?: number;
  status: "ACTIVE" | "UNAVAILABLE";
  instanceHealth?: "ONLINE" | "OFFLINE" | "UNKNOWN";
  error?: string;
  stage?: string;
  currentChangeId?: string | null;
  tasksCount?: number;
  blockersCount?: number;
  gitClean?: boolean;
}
```

### UI Representation in `src/ui/App.tsx`
- Each workspace card displays an instance status badge:
  - `ONLINE` (green badge): `● Online :<port>`
  - `OFFLINE` (amber/gray badge): `○ Offline :<port>`
  - `UNKNOWN` (gray badge): `– Unconfigured`
- If an instance is `ONLINE`, clicking the badge or link allows the user to open that instance directly in a new tab if desired, while workspace selection in the current UI remains seamless.

### Security & Invariants
- **Read-only**: No write endpoints, no process spawning or process killing.
- **Loopback binding**: `127.0.0.1` only.
- **Method filtering**: GET and HEAD only; non-GET/HEAD return 405.
- **Zero wildcard CORS**: No permissive `Access-Control-Allow-Origin: *`.
- **Per-workspace containment**: `isPathContained` enforced for all filesystem operations.
