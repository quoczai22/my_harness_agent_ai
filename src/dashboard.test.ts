import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createDashboardServer, isAllowlistedArtifact, isPathContained } from "./dashboard.js";

test("segment-aware path containment and prefix-sibling rejection", () => {
  const root = resolve(".");
  // Valid inside workspace
  assert.equal(isPathContained(root, resolve("./reports/antigravity-handoff.json")), true);
  assert.equal(isPathContained(root, resolve("./openspec/README.md")), true);

  // Path traversal with parent relative
  assert.equal(isPathContained(root, resolve("../outside.txt")), false);

  // Prefix-sibling directory rejection (e.g. root is /workspace, target is /workspace-sibling)
  const siblingPath = resolve("..", `${root.split(/[\/\\]/).pop()}-sibling`, "file.txt");
  assert.equal(isPathContained(root, siblingPath), false);

  // Cross-drive or absolute relative on Windows
  assert.equal(isPathContained("D:\\harness_agent", "C:\\Windows\\System32"), false);
});

test("allowlist artifact validation with strict containment", () => {
  const root = resolve(".");
  assert.equal(isAllowlistedArtifact(root, resolve("./reports/antigravity-handoff.json")), true);
  assert.equal(isAllowlistedArtifact(root, resolve("./openspec/README.md")), true);
  assert.equal(isAllowlistedArtifact(root, resolve("./tasks/archive")), true);

  // Non-allowlisted files inside workspace
  assert.equal(isAllowlistedArtifact(root, resolve("./package.json")), false);
  assert.equal(isAllowlistedArtifact(root, resolve("./src/store.ts")), false);

  // Prefix-sibling with allowlist name (e.g. reports-sibling)
  const prefixSibling = resolve("..", "reports-fake", "test.json");
  assert.equal(isAllowlistedArtifact(root, prefixSibling), false);
});

test("offline React bundle exists and is compiled by esbuild", () => {
  const bundlePath = resolve("./dist/public/bundle.js");
  assert.equal(existsSync(bundlePath), true, "dist/public/bundle.js must exist after build");
  const content = readFileSync(bundlePath, "utf8");
  assert.ok(content.length > 50000, "Bundle must contain compiled React + ReactDOM runtime");
  // Check for React client markers in bundle
  assert.ok(
    content.includes("react") || content.includes("createRoot") || content.includes("Continuity Core Dashboard"),
    "Bundle must contain React code and Dashboard UI"
  );
});

test("dashboard server binds to 127.0.0.1, omits wildcard CORS, and serves local React bundle 100% offline", async () => {
  const dashboard = createDashboardServer({ port: 0 });
  const port = await dashboard.start();
  const address = dashboard.server.address();
  assert.ok(address && typeof address === "object");
  assert.equal(address.address, "127.0.0.1");

  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Health check & no wildcard CORS
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get("access-control-allow-origin"), null);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.status, "ok");

    // 2. State API
    const stateRes = await fetch(`${baseUrl}/api/state`);
    assert.equal(stateRes.status, 200);
    assert.equal(stateRes.headers.get("access-control-allow-origin"), null);
    const stateJson = await stateRes.json();
    assert.ok(stateJson.stage);
    assert.ok(Array.isArray(stateJson.tasks));

    // 3. Git API
    const gitRes = await fetch(`${baseUrl}/api/git`);
    assert.equal(gitRes.status, 200);
    const gitJson = await gitRes.json();
    assert.ok(typeof gitJson.branch === "string");
    assert.ok(typeof gitJson.clean === "boolean");

    // 4. Artifacts listing & retrieval
    const artListRes = await fetch(`${baseUrl}/api/artifacts`);
    assert.equal(artListRes.status, 200);
    const artListJson = await artListRes.json();
    assert.ok(Array.isArray(artListJson.artifacts));

    // 5. Valid artifact retrieval
    const artFetchRes = await fetch(`${baseUrl}/api/artifacts?path=reports/antigravity-handoff.json`);
    assert.equal(artFetchRes.status, 200);
    const artText = await artFetchRes.text();
    assert.ok(artText.includes("changeId"));

    // 6. Path traversal rejection
    const badRes = await fetch(`${baseUrl}/api/artifacts?path=../../package.json`);
    assert.equal(badRes.status, 403);

    // 7. HTML Web UI: zero CDN scripts, 100% offline shell referencing local bundle
    const uiRes = await fetch(`${baseUrl}/`);
    assert.equal(uiRes.status, 200);
    assert.equal(uiRes.headers.get("content-type")?.includes("text/html"), true);
    const html = await uiRes.text();
    assert.ok(html.includes("Continuity Core Dashboard"));
    assert.ok(html.includes('id="root"'));
    assert.ok(html.includes('<script src="/bundle.js"></script>'));

    // Assert NO external runtime CDN scripts or stylesheets
    assert.equal(html.includes("unpkg.com"), false);
    assert.equal(html.includes("cdnjs.cloudflare.com"), false);
    assert.equal(html.includes("jsdelivr.net"), false);
    assert.equal(html.includes("googleapis.com"), false);
    assert.equal(html.includes("babel"), false);

    // 8. Serve local bundle.js
    const bundleRes = await fetch(`${baseUrl}/bundle.js`);
    assert.equal(bundleRes.status, 200);
    assert.equal(bundleRes.headers.get("content-type")?.includes("application/javascript"), true);
    assert.equal(bundleRes.headers.get("access-control-allow-origin"), null);
    const bundleText = await bundleRes.text();
    assert.ok(bundleText.length > 50000);
  } finally {
    await dashboard.stop();
  }
});
