# Restore Offline React Dashboard

## Why

In the previous hardening change, external runtime CDN dependencies (`unpkg.com`, external Babel/React scripts) were removed to satisfy offline requirements. However, React was replaced with inline vanilla JavaScript DOM manipulation inside `src/dashboard.ts`.

This does not satisfy the original architectural requirement of an interactive React UI running completely offline.

To fulfill the requirements:
1. The dashboard UI must be built with genuine React and ReactDOM components.
2. React, ReactDOM, and application code must be built and bundled locally using a valid build tool (e.g., `esbuild`) at build time into an offline static bundle.
3. No runtime CDN dependencies (unpkg, cdnjs, jsdelivr, Babel standalone) may be used. The dashboard must render and operate 100% offline.
4. The Node.js server (`src/dashboard.ts`) remains a lightweight, read-only static file server and API provider, preserving loopback binding (`127.0.0.1`), segment-aware path containment, and strict CORS headers (no wildcard CORS).

## Scope

- Install `react`, `react-dom`, `@types/react`, `@types/react-dom`, and `esbuild` as local dependencies / devDependencies.
- Implement the React dashboard UI components in `src/ui/` (Workflow Lane, Stage Monitor, Checkpoint Actions, Tasks, Decisions/Audit log, Artifact Viewer).
- Configure build scripts in `package.json` to bundle the React application locally with `esbuild` into static assets (e.g. `dist/public/` or `dist/dashboard-ui.js`).
- Update `src/dashboard.ts` to serve the built local React bundle and static assets alongside read-only APIs (`/api/state`, `/api/git`, `/api/artifacts`, `/api/health`).
- Maintain all security hardening guarantees: bind to `127.0.0.1`, segment-aware `isPathContained`, no wildcard CORS.
- Update `src/dashboard.test.ts` and ensure comprehensive tests verify: zero CDN, local bundle presence, React UI execution, loopback binding, no wildcard CORS, read-only APIs, and `npm test` passing.

## Out of Scope

- Modifying core MCP state machine logic or `.continuity/state.json` store logic outside of dashboard integration.
- Git commit or push.
