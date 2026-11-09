# Design: Multi-workspace dashboard registry

## Registry storage model

The registry is stored in a local JSON configuration file (defaulting to `.continuity/workspaces.json` or configured via `CONTINUITY_REGISTRY_PATH` / `--registry`).

Example schema:
```json
{
  "workspaces": [
    {
      "id": "harness-agent",
      "name": "Harness Agent",
      "path": "D:\\harness_agent",
      "port": 3456
    }
  ]
}
```

## Path validation & missing workspace handling

For each entry in the registry:
1. Canonicalize path: `resolve(entry.path)`.
2. Check existence: `existsSync(canonicalPath)` and `statSync(canonicalPath).isDirectory()`.
3. If valid: read workspace status (`.continuity/state.json` inside that workspace using `isPathContained(canonicalPath, statePath)`) and Git summary.
4. If invalid / missing / inaccessible: mark entry with status `UNAVAILABLE` or `MISSING` with a clear reason, without crashing or removing the entry.

## API & Endpoints

- `GET /api/workspaces`: returns list of registered workspaces with their summarized status and availability.
- `GET /api/state?workspace=<id>`: returns workflow state for the specified registered workspace after containment validation.
- `GET /api/artifacts?workspace=<id>&path=<rel>`: returns allowlisted artifact content within the specified workspace root.
- Rejects non-registered or non-contained workspace paths with `403 Access Denied`.
- Rejects write methods with `405 Method Not Allowed`.

## UI Overview & Navigation

- React UI introduces a Workspace Selector / Registry Home view rendering summary cards (project name, stage badge, active change, blocker count, health/Git badge).
- Selecting a workspace switches active context to render the detailed Continuity workflow lane for that workspace.
- Offline React bundle remains shared and served from the fixed module install path (`dist/public/bundle.js`).

## Security architecture

- **No disk crawling**: Only explicitly configured workspace paths are ever read.
- **Strict containment**: Each workspace data request strictly enforces `isPathContained(targetWorkspaceRoot, targetPath)`.
- **Loopback & Read-only**: Bound strictly to `127.0.0.1`, GET/HEAD only, zero wildcard CORS.
