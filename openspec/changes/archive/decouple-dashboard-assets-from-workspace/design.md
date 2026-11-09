# Design

`/bundle.js` will resolve a fixed absolute path relative to the compiled dashboard module (`dist/public/bundle.js`). The asset route accepts no caller-controlled path input and does not call `isPathContained()`.

Artifact and workspace-data routes retain their existing resolution and `isPathContained(workspaceRoot, target)` enforcement. The server remains loopback-only and read-only.

Tests will create a normal workspace root, a distinct workspace root, and a nonexistent workspace root. Each must receive the fixed bundle. Traversal and outside-target artifact requests must remain forbidden.
