# Harden Workflow Dashboard Security & Local Bundling

## Why

Review findings for the dashboard MVP identified security and architectural improvements needed prior to production readiness:
1. **Path Containment Flaw**: String `startsWith` checks can be bypassed by prefix-sibling paths (e.g. `/path/to/workspace-sibling` starting with `/path/to/workspace`). A segment-aware relative path check using `path.relative` is needed.
2. **CORS & Network Exposure**: `Access-Control-Allow-Origin: *` is overly permissive for a local development tool. The server should remove wildcard CORS and bind exclusively to `127.0.0.1` by default to avoid unintended LAN exposure.
3. **Runtime CDN Dependency**: The HTML dashboard currently loads React, ReactDOM, and Babel from external unpkg CDNs at runtime. The dashboard must operate 100% offline without external network dependencies by bundling or self-hosting UI scripts.

## Scope

- Replace `isPathContained` in `src/dashboard.ts` with a segment-aware validator based on `path.relative` that rejects targets outside the root, absolute relative results, and `..` segments.
- Remove wildcard `Access-Control-Allow-Origin: *` headers from `src/dashboard.ts`.
- Bind the dashboard server exclusively to `127.0.0.1` (localhost).
- Remove runtime CDN script tags for React/Babel; embed/bundle self-contained vanilla/pre-rendered or bundled client script that runs completely offline without internet connection.
- Update `src/dashboard.test.ts` to test prefix-sibling path rejection, absence of wildcard CORS, localhost binding, and offline asset rendering.
- Verify all tests pass via `npm test`.

## Out of scope

- No commit or push to Git.
- No changes to core MCP workflow logic or `.continuity/state.json`.
