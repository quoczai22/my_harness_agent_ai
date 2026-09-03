# Tasks

- [x] Harden path containment with segment-aware `path.relative` check, remove wildcard CORS, and bind server strictly to `127.0.0.1` in `src/dashboard.ts`. Keywords: `isPathContained`, `path.relative`, `127.0.0.1`, `dashboard.ts`.
- [x] Remove runtime React/Babel CDN dependencies to ensure the dashboard UI operates 100% offline. Keywords: `dashboard.ts`, `React`, `ReactDOM`, `offline-bundle`.
- [x] Update `src/dashboard.test.ts` to test prefix-sibling rejection, CORS restriction, 127.0.0.1 binding, and zero-CDN offline rendering, verified with `npm test`. Keywords: `dashboard.test.ts`, `npm test`, `isPathContained`, `CORS`.
