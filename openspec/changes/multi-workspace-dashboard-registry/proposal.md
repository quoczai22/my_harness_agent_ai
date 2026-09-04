# Multi-workspace dashboard registry (Phase C)

## Problem

Following Phase A (offline decoupled asset serving) and Phase B (multi-workspace CLI launcher with explicit `--workspace` and `--port`), developers frequently manage multiple local repositories or active feature worktrees. Currently, viewing each workspace requires manually starting independent CLI servers or remembering separate port assignments. A lightweight local registry of explicitly allowed workspaces enables a centralized read-only dashboard home where developers can view summary cards/lanes across known projects and navigate directly to inspect a chosen workspace.

## Scope

- Define a local workspace registry schema (e.g., `.continuity/workspaces.json` or explicit config file) containing user-allowed workspace paths and metadata (id, name, path, default port).
- Provide read-only `/api/workspaces` registry endpoint returning the allowed workspaces and their high-level summary status (stage, active change, clean Git status, or missing/unreachable flag).
- Update React Dashboard home view to render an overview with workspace cards / lane summaries for each registered project.
- Allow user to select a workspace to inspect its workflow state and allowlisted artifacts.
- Validate registered workspace paths strictly (directory existence, canonical path resolution); handle missing/moved workspaces gracefully without server failure.
- Zero whole-disk scanning: only explicitly configured workspace directories are enumerated.
- Preserve 100% loopback-only (`127.0.0.1`) binding, strict read-only HTTP method enforcement (GET/HEAD only, 405 for mutations), and no wildcard CORS.
- Decoupled offline bundle delivery and strict workspace data containment (`isPathContained`) for each selected workspace.

## Out of scope

- Automatic disk scanning, filesystem indexing, or directory crawling.
- Automatic background process supervisor, process spawning daemon, or daemon management.
- Agent dispatching, write endpoints, remote hosting, or cloud database synchronization.
