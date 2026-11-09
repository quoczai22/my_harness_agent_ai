# Dashboard Security Hardening & Local Bundling Design

## 1. Segment-Aware Path Containment (`src/dashboard.ts`)

```typescript
export function isPathContained(workspaceRoot: string, targetPath: string): boolean {
  const root = resolve(workspaceRoot);
  const target = resolve(targetPath);
  if (root === target) return true;
  const rel = relative(root, target);
  return Boolean(rel && !rel.startsWith("..") && !isAbsolute(rel));
}
```
- Rejects targets outside the workspace root.
- Rejects prefix-sibling directory confusion (e.g. `/root-sibling` relative to `/root` yields `../root-sibling`).
- Rejects cross-drive Windows absolute paths (e.g. `C:\` vs `D:\`).

## 2. Server Binding & CORS Security (`src/dashboard.ts`)
- Bind exclusively to `"127.0.0.1"`: `server.listen(port, "127.0.0.1", ...)`.
- Completely remove `Access-Control-Allow-Origin: *` headers from all responses.

## 3. 100% Offline Client UI (Zero CDN Runtime Dependencies)
- Eliminate all external CDN dependencies (`unpkg.com`, external `<script>` tags, Babel standalone).
- Implement a self-contained, high-performance, responsive Single Page Application with zero runtime network requirements.
- Full parity with workflow lane timeline, active stage highlight, task boards, checkpoint reviews, blocker alerts, and artifact browser.

## 4. Test Verification (`src/dashboard.test.ts`)
- Verify prefix-sibling containment rejection.
- Verify cross-drive traversal rejection.
- Verify server binds to `127.0.0.1`.
- Verify response headers do not include wildcard CORS.
- Verify served HTML contains no external CDN script tags.
