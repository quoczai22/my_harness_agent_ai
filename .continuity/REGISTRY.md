# Continuity Workspace Registry Onboarding Guide

The Continuity Dashboard supports a local, explicit multi-workspace registry. This guide explains how to set up and run the dashboard with allowed projects.

---

## 1. Quickstart: Setup Registry

1. Copy the example template to create your local registry:
   ```bash
   cp .continuity/workspaces.example.json .continuity/workspaces.json
   ```

2. Open `.continuity/workspaces.json` and configure your allowed projects.

---

## 2. Registry Schema & Field Reference

Each registry file must be a JSON object with a non-empty `workspaces` array:

```json
{
  "workspaces": [
    {
      "id": "harness-agent",
      "name": "Harness Agent Core",
      "path": ".",
      "port": 3456
    },
    {
      "id": "project-alpha",
      "name": "Project Alpha Feature",
      "path": "../project-alpha",
      "port": 3457
    }
  ]
}
```

### Field Definitions
- **`id`** *(required, string)*: A unique identifier for the workspace (e.g. `"harness-agent"`). Must not be empty or duplicated.
- **`name`** *(required, string)*: A human-readable display label shown on the dashboard cards.
- **`path`** *(required, string)*: Relative or absolute path to the workspace root directory. Each entry must resolve to a unique canonical path on disk.
- **`port`** *(optional, integer)*: Port number for the workspace instance (`0` to `65535`).

---

## 3. Running the Dashboard with a Registry

Start the dashboard by passing the registry path:

```bash
# Using full flag
node dist/dashboard.js --registry ".continuity/workspaces.json"

# Using short alias
node dist/dashboard.js -r ".continuity/workspaces.json"
```

You can also specify the registry location via the environment variable:
```bash
CONTINUITY_REGISTRY_PATH=".continuity/workspaces.json" node dist/dashboard.js
```

---

## 4. Fail-Fast Validation & Common Errors

When an explicit registry is specified via `--registry` / `-r` or `CONTINUITY_REGISTRY_PATH`, the launcher strictly validates the configuration before starting the server. If any check fails, it immediately terminates with a clear message:

| Error Case | Description / Cause |
| :--- | :--- |
| **Missing file** | `Registry file does not exist: "<path>"` — The specified path was not found on disk. |
| **Malformed JSON** | `Invalid JSON syntax in registry file "<path>"` — Syntax error (missing comma, trailing comma, quotes). |
| **Duplicate ID** | `Duplicate workspace id "<id>" found...` — Two entries share the same `id`. |
| **Duplicate Path** | `Duplicate workspace path "<canonicalPath>" found...` — Two entries resolve to the same canonical directory. |
| **Invalid Port** | `Invalid port for workspace "<id>": <port>` — Port is not an integer between 0 and 65535. |
| **Empty Field / Schema** | `"id" must be a non-empty string`, `"workspaces" array cannot be empty`, etc. |

---

## 5. Security & Read-Only Invariants

- **No Disk Scanning**: The dashboard never automatically crawls, searches, or indexes the filesystem for projects. Only explicitly declared workspaces are inspected.
- **Strictly Read-Only**: The dashboard never creates, edits, or deletes entries in the registry file.
- **Loopback & Containment**: Server binds strictly to `127.0.0.1`, enforces GET/HEAD-only (405 for mutations), omits wildcard CORS, and confines artifact access strictly to each workspace directory via `isPathContained`.
