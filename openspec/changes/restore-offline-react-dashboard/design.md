# Restore Offline React Dashboard Design

## 1. Local React UI Architecture (`src/ui/`)

- Source components implemented in TypeScript/TSX using React 18/19:
  - `App.tsx`: Main dashboard container orchestrating state polling and layout.
  - `Header.tsx`: Project name, git status, offline live indicator badge.
  - `WorkflowLane.tsx`: 7-stage workflow timeline (`IDLE`, `SPEC_READY`, `CHECKPOINT_1`, `IMPL_IN_PROGRESS`, `IMPL_DONE`, `CHECKPOINT_2`, `DONE`) with active highlighting and progress bar.
  - `BlockersCard.tsx`: Active blocker notices and gate warnings.
  - `TaskBoard.tsx`: Registered tasks for active change with status and keywords badges.
  - `CheckpointReview.tsx`: Pending checkpoint details, approval status, and audit log.
  - `ArtifactBrowser.tsx`: Allowlisted artifact selector and code preview viewer.
- Client entry point in `src/ui/index.tsx` mounting into DOM `#root` via `createRoot`.

## 2. Local Build Pipeline (`esbuild`)

- Use `esbuild` to compile and bundle TypeScript + JSX (`src/ui/index.tsx` + `react` + `react-dom`) into a single self-contained bundle (e.g. `dist/public/bundle.js`).
- Scripts in `package.json`:
  - `"build:ui"`: `esbuild src/ui/index.tsx --bundle --minify --format=iife --outfile=dist/public/bundle.js` (or embedded as part of build)
  - `"build"`: `tsc && npm run build:ui`
- Offline HTML shell served at `GET /` pointing to local `/bundle.js` (or inline bundled output), with embedded styles and no external scripts or CDN fonts.

## 3. Server Integration & Security Hardening (`src/dashboard.ts`)

- Serve `/` or `/index.html` referencing `/bundle.js` or serving static UI files.
- Serve `/bundle.js` (or `/static/*`) with segment-aware path containment and proper MIME type (`application/javascript`).
- Read-only REST APIs:
  - `GET /api/health`: Health status.
  - `GET /api/state`: Current workflow state, tasks, checkpoints, blockers.
  - `GET /api/git`: Local git branch and modified files summary.
  - `GET /api/artifacts`: List allowlisted artifacts or retrieve file contents within allowlisted prefixes (`openspec`, `reports`, `tasks`, `.continuity`).
- Security guarantees:
  - Listen strictly on `127.0.0.1`.
  - No `Access-Control-Allow-Origin: *` wildcard CORS.
  - Segment-aware path containment (`isPathContained`) using `path.relative` with prefix-sibling rejection.

## 4. Test Verification Plan (`src/dashboard.test.ts`)

- Test local bundle file generation and presence in build output.
- Test that served HTML uses local bundled script and contains no CDN references (`unpkg`, `cdnjs`, `jsdelivr`, `googleapis`).
- Test that React bundle executes and mounts properly.
- Test server loopback `127.0.0.1` binding and absence of wildcard CORS.
- Test read-only API contracts and segment-aware path containment rejection for unauthorized traversals.
- Run complete test suite with `npm test`.
