import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  createDashboardServer,
  isAllowlistedArtifact,
  isPathContained,
} from "./dashboard.js";

test("segment-aware path containment and prefix-sibling rejection", () => {
  const root = resolve(".");
  // Valid inside workspace
  assert.equal(
    isPathContained(root, resolve("./reports/antigravity-handoff.json")),
    true,
  );
  assert.equal(isPathContained(root, resolve("./openspec/README.md")), true);

  // Path traversal with parent relative
  assert.equal(isPathContained(root, resolve("../outside.txt")), false);

  // Prefix-sibling directory rejection (e.g. root is /workspace, target is /workspace-sibling)
  const siblingPath = resolve(
    "..",
    `${root.split(/[\/\\]/).pop()}-sibling`,
    "file.txt",
  );
  assert.equal(isPathContained(root, siblingPath), false);

  // Cross-drive or absolute relative on Windows
  assert.equal(
    isPathContained("D:\\harness_agent", "C:\\Windows\\System32"),
    false,
  );
});

test("allowlist artifact validation with strict containment", () => {
  const root = resolve(".");
  assert.equal(
    isAllowlistedArtifact(root, resolve("./reports/antigravity-handoff.json")),
    true,
  );
  assert.equal(
    isAllowlistedArtifact(root, resolve("./openspec/README.md")),
    true,
  );
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
  assert.equal(
    existsSync(bundlePath),
    true,
    "dist/public/bundle.js must exist after build",
  );
  const content = readFileSync(bundlePath, "utf8");
  assert.ok(
    content.length > 50000,
    "Bundle must contain compiled React + ReactDOM runtime",
  );
  // Check for React client markers in bundle
  assert.ok(
    content.includes("react") ||
      content.includes("createRoot") ||
      content.includes("Continuity Core Dashboard"),
    "Bundle must contain React code and Dashboard UI",
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
    const artFetchRes = await fetch(
      `${baseUrl}/api/artifacts?path=reports/antigravity-handoff.json`,
    );
    assert.equal(artFetchRes.status, 200);
    const artText = await artFetchRes.text();
    assert.ok(artText.includes("changeId"));

    // 6. Path traversal rejection
    const badRes = await fetch(
      `${baseUrl}/api/artifacts?path=../../package.json`,
    );
    assert.equal(badRes.status, 403);

    // 7. HTML Web UI: zero CDN scripts, 100% offline shell referencing local bundle
    const uiRes = await fetch(`${baseUrl}/`);
    assert.equal(uiRes.status, 200);
    assert.equal(
      uiRes.headers.get("content-type")?.includes("text/html"),
      true,
    );
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
    assert.equal(
      bundleRes.headers.get("content-type")?.includes("application/javascript"),
      true,
    );
    assert.equal(bundleRes.headers.get("access-control-allow-origin"), null);
    const bundleText = await bundleRes.text();
    assert.ok(bundleText.length > 50000);
  } finally {
    await dashboard.stop();
  }
});

test("dashboard serves bundle.js independently of workspaceRoot (valid, different, and nonexistent workspaces)", async () => {
  const currentRoot = resolve(".");
  const externalRoot = resolve("..", "external-test-workspace-sample");
  const nonexistentRoot = resolve(".", "nonexistent-dir-for-test-9999");

  // 1. Valid workspace root
  const dashboardValid = createDashboardServer({
    workspaceRoot: currentRoot,
    port: 0,
  });
  const portValid = await dashboardValid.start();
  try {
    const res = await fetch(`http://127.0.0.1:${portValid}/bundle.js`);
    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get("content-type")?.includes("application/javascript"),
      true,
    );
    const text = await res.text();
    assert.ok(text.length > 50000);
  } finally {
    await dashboardValid.stop();
  }

  // 2. Different / external workspace root
  const dashboardExternal = createDashboardServer({
    workspaceRoot: externalRoot,
    port: 0,
  });
  const portExternal = await dashboardExternal.start();
  try {
    const res = await fetch(`http://127.0.0.1:${portExternal}/bundle.js`);
    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get("content-type")?.includes("application/javascript"),
      true,
    );
    const text = await res.text();
    assert.ok(text.length > 50000);
  } finally {
    await dashboardExternal.stop();
  }

  // 3. Nonexistent workspace root
  const dashboardNonexistent = createDashboardServer({
    workspaceRoot: nonexistentRoot,
    port: 0,
  });
  const portNonexistent = await dashboardNonexistent.start();
  try {
    const res = await fetch(`http://127.0.0.1:${portNonexistent}/bundle.js`);
    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get("content-type")?.includes("application/javascript"),
      true,
    );
    const text = await res.text();
    assert.ok(text.length > 50000);
  } finally {
    await dashboardNonexistent.stop();
  }
});

test("workspace containment and artifact safety: path traversal and outside-target files return 403", async () => {
  const dashboard = createDashboardServer({ port: 0 });
  const port = await dashboard.start();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Parent relative traversal
    const res1 = await fetch(`${baseUrl}/api/artifacts?path=../package.json`);
    assert.equal(res1.status, 403);

    const res2 = await fetch(`${baseUrl}/api/artifacts?path=../../etc/passwd`);
    assert.equal(res2.status, 403);

    // Sibling prefix traversal (e.g. workspace-sibling)
    const res3 = await fetch(
      `${baseUrl}/api/artifacts?path=../harness_agent-sibling/secret.txt`,
    );
    assert.equal(res3.status, 403);

    // Non-allowlisted file inside workspace
    const res4 = await fetch(`${baseUrl}/api/artifacts?path=package.json`);
    assert.equal(res4.status, 403);

    const res5 = await fetch(`${baseUrl}/api/artifacts?path=src/store.ts`);
    assert.equal(res5.status, 403);

    // Absolute path outside workspace
    const res6 = await fetch(
      `${baseUrl}/api/artifacts?path=C:/Windows/win.ini`,
    );
    assert.equal(res6.status, 403);

    // Verify no write endpoint exists (returns 405 Method Not Allowed)
    const postRes = await fetch(`${baseUrl}/api/state`, {
      method: "POST",
      body: "{}",
    });
    assert.equal(postRes.status, 405);

    const putRes = await fetch(`${baseUrl}/api/artifacts`, {
      method: "PUT",
      body: "hack",
    });
    assert.equal(putRes.status, 405);
  } finally {
    await dashboard.stop();
  }
});

test("state containment: /api/state rejects absolute CONTINUITY_STATE_PATH outside target workspace with 403", async () => {
  const originalEnv = process.env.CONTINUITY_STATE_PATH;
  const targetWorkspace = resolve("..", "another-isolated-project-root");
  const outsideStatePath = resolve(".", ".continuity", "state.json");

  try {
    process.env.CONTINUITY_STATE_PATH = outsideStatePath;
    const dashboard = createDashboardServer({
      workspaceRoot: targetWorkspace,
      port: 0,
    });
    const port = await dashboard.start();
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const res = await fetch(`${baseUrl}/api/state`);
      assert.equal(res.status, 403);
      const json = await res.json();
      assert.ok(json.error && json.error.includes("Access denied"));
      assert.equal(json.currentChangeId, undefined);
      assert.equal(json.tasks, undefined);
    } finally {
      await dashboard.stop();
    }
  } finally {
    if (originalEnv !== undefined) {
      process.env.CONTINUITY_STATE_PATH = originalEnv;
    } else {
      delete process.env.CONTINUITY_STATE_PATH;
    }
  }
});
