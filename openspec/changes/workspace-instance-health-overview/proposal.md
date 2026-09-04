# Workspace instance health overview

## Problem

In multi-workspace environments where separate dashboard instances run on dedicated ports (e.g., project A on port 3456, project B on port 3457), developers viewing the centralized dashboard registry cannot see whether other instances are currently running or offline. Without live instance health checks, developers have to manually check terminals or open browser tabs. A lightweight, bounded health status monitor on the registry overview provides immediate visibility into `ONLINE`, `OFFLINE`, or `UNKNOWN` instances without risking performance degradation or security vulnerabilities.

## Scope

- Add loopback instance health detection for registered workspaces with configured ports:
  - Probe `http://127.0.0.1:<registered_port>/api/health` with a strict, short timeout (e.g., 800ms) using `AbortController`.
  - Non-blocking execution using parallel `Promise.allSettled` to prevent any slow or offline instance from blocking the central dashboard.
  - Report instance status in `/api/workspaces`: `ONLINE` (200 with `{ status: "ok" }`), `OFFLINE` (connection refused, timeout, or non-200), or `UNKNOWN` (no port configured or directory unavailable).
- Strict SSRF (Server-Side Request Forgery) Prevention:
  - Health checks MUST strictly target fixed loopback `127.0.0.1`.
  - Port numbers MUST come exclusively from validated registry entries.
  - No user-supplied host, URL, path, or arbitrary proxy target from HTTP query parameters or request headers is permitted.
- Update React UI to render instance status badges on workspace cards:
  - Green indicator for `ONLINE` with port label.
  - Muted/amber indicator for `OFFLINE` with port label.
  - Gray indicator for `UNKNOWN` (when port is unassigned).
  - Distinct `UNAVAILABLE` badge when workspace path is missing on disk.
- Preserve all existing invariants:
  - Read-only: no process spawning, process killing, or daemon management.
  - Loopback-only (`127.0.0.1`), GET/HEAD only (405 on mutations), no wildcard CORS.
  - Per-workspace containment (`isPathContained`).
  - Zero disk scanning or auto-discovery.

## Out of scope

- Process supervision, daemon management, or auto-spawning/killing dashboard instances.
- Probing external networks, remote hosts, or non-loopback addresses.
- HTTP write endpoints or UI control toggles to start/stop processes.
