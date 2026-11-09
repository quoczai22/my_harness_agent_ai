# Design: Secure workspace registry onboarding

## Template & Onboarding Documentation

A template file `.continuity/workspaces.example.json` provides an explicit starting structure:
```json
{
  "workspaces": [
    {
      "id": "project-alpha",
      "name": "Project Alpha",
      "path": "D:\\Projects\\project-alpha",
      "port": 3457
    },
    {
      "id": "project-beta",
      "name": "Project Beta",
      "path": "D:\\Projects\\project-beta",
      "port": 3458
    }
  ]
}
```

Usage instructions:
```bash
# Copy template
cp .continuity/workspaces.example.json .continuity/workspaces.json

# Launch dashboard with explicit registry
node dist/dashboard.js --registry .continuity/workspaces.json
# or alias
node dist/dashboard.js -r .continuity/workspaces.json
```

## Strict Validation Rules

A dedicated validation function `validateWorkspaceRegistryData(data, sourcePath)` enforces:
1. **Root Type**: `data` must be a non-null object with a `workspaces` property of type Array.
2. **Non-empty List**: `workspaces` array must contain at least 1 workspace entry.
3. **Field Validation**:
   - `id`: non-empty string.
   - `name`: non-empty string.
   - `path`: non-empty string.
   - `port` (optional): integer in range `0 <= port <= 65535`.
4. **Duplicate Prevention**:
   - Track seen IDs (case-sensitive / trimmed). If duplicate ID is encountered, throw `Duplicate workspace id: "<id>"`.
   - Track seen canonical paths (`resolve(entry.path)`). If duplicate canonical path is encountered, throw `Duplicate workspace path: "<canonicalPath>"`.

## Error Handling & Fallback Policy

- **Explicit Registry (`--registry` or `CONTINUITY_REGISTRY_PATH`)**:
  - If file does not exist: throw `Registry file does not exist: "<path>"`.
  - If file contains invalid JSON: throw `Invalid JSON syntax in registry file: "<path>"`.
  - If schema or validation fails: throw the specific validation error.
  - **No silent fallback**: Prevents running the server against an unintended default workspace when the user explicitly passed a custom registry.
- **Default Registry Mode (no explicit option specified)**:
  - If `.continuity/workspaces.json` exists: load and validate strictly (throw on malformed syntax or schema violations).
  - If `.continuity/workspaces.json` does not exist: return single default workspace entry for `workspaceRoot`.

## Security Architecture

- **No auto-discovery / scanning**: Workspaces are strictly bounded to the user-supplied list.
- **Loopback & Read-only**: Bound strictly to `127.0.0.1`, GET/HEAD only (405 on mutations), zero wildcard CORS.
- **Containment per workspace**: Data routes enforce `isPathContained(targetWorkspaceRoot, targetPath)` against the validated canonical path.
- **No process spawning**: Dashboard operates as an authoritative read-only monitor.
