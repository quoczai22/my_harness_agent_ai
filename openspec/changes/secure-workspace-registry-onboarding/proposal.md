# Secure workspace registry onboarding

## Problem

Developers onboarding multiple projects into the Continuity dashboard need a clear template and explicit instructions for setting up their allowed workspace registry. Currently, if an explicitly specified registry configuration contains duplicates (duplicate IDs or duplicate paths), malformed JSON, or invalid port ranges, a silent fallback to the default workspace could mislead developers into viewing the wrong project. Registry loading must be strictly validated with clear error feedback, providing a transparent onboarding experience without sacrificing read-only security.

## Scope

- Provide a canonical workspace registry template (`.continuity/workspaces.example.json` or `workspaces.example.json`) and clear onboarding instructions for running the dashboard with `--registry <path>`.
- Implement strict registry schema validation:
  - Reject registry files with missing `workspaces` array or empty arrays.
  - Reject entries with missing or empty `id`, `name`, or `path`.
  - Reject entries with duplicate `id` values.
  - Reject entries with duplicate canonical `path` values.
  - Validate `port` values (must be integer between 0 and 65535).
- Distinguish explicit vs default registry loading:
  - When an explicit registry is provided via `--registry` / `-r` or `CONTINUITY_REGISTRY_PATH`, errors (missing file, invalid JSON, schema violations, duplicates) must fail fast with a descriptive error before listening, avoiding ambiguous fallbacks.
  - When relying on default `.continuity/workspaces.json`, if the file exists it must pass strict validation; if absent, single-workspace default mode is used.
- Preserve all existing security invariants:
  - Local read-only registry: no runtime write endpoints, no web UI mutation forms.
  - Zero disk auto-discovery or scanning: only explicitly declared workspaces are accepted.
  - Loopback-only binding (`127.0.0.1`), GET/HEAD-only (405 for mutations), no wildcard CORS.
  - Strict workspace data and artifact containment (`isPathContained`).
- Add tests covering schema validation, duplicate detection, invalid ports, and explicit registry failure modes.

## Out of scope

- Runtime HTTP endpoints to add, modify, or delete registry entries.
- Automated filesystem crawler or background project discovery.
- Process supervisor or background project daemon manager.
