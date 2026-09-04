import assert from "node:assert/strict";
import test from "node:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  createDashboardServer,
  getGitSummary,
  getWorkspacesSummaryList,
  isAllowlistedArtifact,
  isPathContained,
  loadWorkspaceRegistry,
  parseDashboardCliArgs,
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

test("CLI flag parser correctly parses --workspace and --port aliases and values", () => {
  assert.deepEqual(
    parseDashboardCliArgs(["--workspace", "/path/a", "--port", "4000"]),
    {
      workspaceRoot: "/path/a",
      port: 4000,
    },
  );
  assert.deepEqual(parseDashboardCliArgs(["-w", "/path/b", "-p", "5000"]), {
    workspaceRoot: "/path/b",
    port: 5000,
  });
  assert.deepEqual(
    parseDashboardCliArgs(["--workspace=/path/c", "--port=6000"]),
    {
      workspaceRoot: "/path/c",
      port: 6000,
    },
  );
  assert.deepEqual(parseDashboardCliArgs(["-w=/path/d", "-p=7000"]), {
    workspaceRoot: "/path/d",
    port: 7000,
  });
});

test("CLI flag parser rejects missing, empty, and invalid flag values", () => {
  // Reject non-integer suffix (e.g. 3456abc)
  assert.throws(
    () => parseDashboardCliArgs(["--port=3456abc"]),
    /Invalid port value for --port/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["--port", "3456abc"]),
    /Invalid port value for --port/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["-p=8080xyz"]),
    /Invalid port value for -p/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["-p", "invalid"]),
    /Invalid port value for -p/,
  );

  // Reject out of range port values
  assert.throws(
    () => parseDashboardCliArgs(["--port=99999"]),
    /Invalid port number for --port/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["-p", "70000"]),
    /Invalid port number for -p/,
  );

  // Reject missing values for flags
  assert.throws(
    () => parseDashboardCliArgs(["--workspace"]),
    /Missing value for flag --workspace/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["-w"]),
    /Missing value for flag -w/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["--port"]),
    /Missing value for flag --port/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["-p"]),
    /Missing value for flag -p/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["--workspace", "--port", "3000"]),
    /Missing value for flag --workspace/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["-w", "-p", "3000"]),
    /Missing value for flag -w/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["--port", "-w", "/dir"]),
    /Missing value for flag --port/,
  );

  // Reject empty values with equals sign
  assert.throws(
    () => parseDashboardCliArgs(["--workspace="]),
    /Value for flag --workspace cannot be empty/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["-w="]),
    /Value for flag -w cannot be empty/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["--port="]),
    /Value for flag --port cannot be empty/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["-p="]),
    /Value for flag -p cannot be empty/,
  );
});

test("CLI flag parser rejects unknown arguments and typos", () => {
  assert.throws(
    () => parseDashboardCliArgs(["--workspce", "/path"]),
    /Unknown or invalid argument: "--workspce"/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["--unknown"]),
    /Unknown or invalid argument: "--unknown"/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["-x"]),
    /Unknown or invalid argument: "-x"/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["--foo=bar"]),
    /Unknown or invalid argument: "--foo=bar"/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["extra-positional-arg"]),
    /Unknown or invalid argument: "extra-positional-arg"/,
  );
});

test("dashboard launcher rejects nonexistent workspace and non-directory paths before listen", () => {
  const nonexistent = resolve(".", "nonexistent-test-workspace-dir-xyz");
  assert.throws(
    () => createDashboardServer({ workspaceRoot: nonexistent }),
    /Workspace directory does not exist/,
  );

  const filePath = resolve(".", "package.json");
  assert.throws(
    () => createDashboardServer({ workspaceRoot: filePath }),
    /Workspace path is not a directory/,
  );
});

test("dashboard launcher rejects invalid port numbers before listen", () => {
  assert.throws(() => createDashboardServer({ port: -1 }), /Invalid port/);
  assert.throws(() => createDashboardServer({ port: 70000 }), /Invalid port/);
  assert.throws(() => createDashboardServer({ port: NaN }), /Invalid port/);
  assert.throws(() => createDashboardServer({ port: 3.14 }), /Invalid port/);
});

test("dashboard launcher strictly validates PORT environment variable without parseInt prefix acceptance", () => {
  const originalPort = process.env.PORT;

  try {
    process.env.PORT = "3456abc";
    assert.throws(
      () => createDashboardServer(),
      /Invalid port value for PORT environment variable: "3456abc"/,
    );

    process.env.PORT = "";
    assert.throws(
      () => createDashboardServer(),
      /Invalid port value for PORT environment variable: ""/,
    );

    process.env.PORT = "-1";
    assert.throws(
      () => createDashboardServer(),
      /Invalid port value for PORT environment variable: "-1"/,
    );

    process.env.PORT = "70000";
    assert.throws(
      () => createDashboardServer(),
      /Invalid port number for PORT environment variable: 70000/,
    );

    process.env.PORT = "3458";
    const dash = createDashboardServer();
    assert.equal(dash.port, 3458);
  } finally {
    if (originalPort !== undefined) {
      process.env.PORT = originalPort;
    } else {
      delete process.env.PORT;
    }
  }
});

test("CLI process execution: rejects nonexistent workspace and invalid port with non-zero exit code", () => {
  const scriptPath = resolve("./dist/dashboard.js");

  // Nonexistent workspace
  try {
    execFileSync(
      process.execPath,
      [scriptPath, "--workspace", "./nonexistent_workspace_dir_cli"],
      {
        encoding: "utf8",
        stdio: "pipe",
      },
    );
    assert.fail("Should have failed on nonexistent workspace");
  } catch (err: any) {
    assert.equal(err.status, 1);
    assert.ok(
      err.stderr.includes("Workspace directory does not exist") ||
        err.stdout.includes("Workspace directory does not exist"),
    );
  }

  // Invalid port
  try {
    execFileSync(process.execPath, [scriptPath, "--port", "invalid_port_abc"], {
      encoding: "utf8",
      stdio: "pipe",
    });
    assert.fail("Should have failed on invalid port");
  } catch (err: any) {
    assert.equal(err.status, 1);
    assert.ok(
      err.stderr.includes("Invalid port") ||
        err.stdout.includes("Invalid port"),
    );
  }

  // Unknown flag
  try {
    execFileSync(process.execPath, [scriptPath, "--workspce", "."], {
      encoding: "utf8",
      stdio: "pipe",
    });
    assert.fail("Should have failed on unknown flag");
  } catch (err: any) {
    assert.equal(err.status, 1);
    assert.ok(
      err.stderr.includes("Unknown or invalid argument") ||
        err.stdout.includes("Unknown or invalid argument"),
    );
  }
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

test("multi-instance dashboard: distinct workspace roots on distinct ports serve isolated state and shared bundle", async () => {
  const originalEnv = process.env.CONTINUITY_STATE_PATH;
  // Test isolation: ensure multi-instance test manages CONTINUITY_STATE_PATH independently of calling process
  delete process.env.CONTINUITY_STATE_PATH;

  const ws1 = resolve(".");
  const ws2 = resolve("..", "test-multi-inst-workspace-sample");
  mkdirSync(join(ws2, ".continuity"), { recursive: true });
  mkdirSync(join(ws2, "reports"), { recursive: true });
  writeFileSync(
    join(ws2, ".continuity", "state.json"),
    JSON.stringify({
      projectId: "ws2-multi-instance",
      stage: "SPEC_READY",
      tasks: [],
      blockers: [],
    }),
    "utf8",
  );
  writeFileSync(
    join(ws2, "reports", "test-report.json"),
    JSON.stringify({ report: "ws2-custom-data" }),
    "utf8",
  );

  const dash1 = createDashboardServer({ workspaceRoot: ws1, port: 0 });
  const dash2 = createDashboardServer({ workspaceRoot: ws2, port: 0 });

  const port1 = await dash1.start();
  const port2 = await dash2.start();

  try {
    // Both serve bundle.js from fixed install path (200)
    const b1 = await fetch(`http://127.0.0.1:${port1}/bundle.js`);
    assert.equal(b1.status, 200);
    const b2 = await fetch(`http://127.0.0.1:${port2}/bundle.js`);
    assert.equal(b2.status, 200);

    // Instance 1 serves ws1 state
    const s1 = await (
      await fetch(`http://127.0.0.1:${port1}/api/state`)
    ).json();
    assert.equal(s1.projectId, "harness-agent");

    // Instance 2 serves ws2 state
    const s2 = await (
      await fetch(`http://127.0.0.1:${port2}/api/state`)
    ).json();
    assert.equal(s2.projectId, "ws2-multi-instance");

    // Instance 2 serves its own allowlisted artifact
    const a2 = await (
      await fetch(
        `http://127.0.0.1:${port2}/api/artifacts?path=reports/test-report.json`,
      )
    ).text();
    assert.ok(a2.includes("ws2-custom-data"));

    // Instance 2 rejects traversal or accessing outside files
    const bad2 = await fetch(
      `http://127.0.0.1:${port2}/api/artifacts?path=../package.json`,
    );
    assert.equal(bad2.status, 403);
  } finally {
    await Promise.all([dash1.stop(), dash2.stop()]);
    if (originalEnv !== undefined) {
      process.env.CONTINUITY_STATE_PATH = originalEnv;
    } else {
      delete process.env.CONTINUITY_STATE_PATH;
    }
    try {
      rmSync(ws2, { recursive: true, force: true });
    } catch {}
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
  const targetWorkspace = resolve(".");
  const outsideStateDir = resolve("..", "outside-state-dir-test");
  const outsideStatePath = join(outsideStateDir, "state.json");
  mkdirSync(outsideStateDir, { recursive: true });
  writeFileSync(
    outsideStatePath,
    JSON.stringify({ projectId: "outside-state" }),
    "utf8",
  );

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
    try {
      rmSync(outsideStateDir, { recursive: true, force: true });
    } catch {}
  }
});

test("loadWorkspaceRegistry loads valid registry or falls back to default safely", () => {
  const defaultRoot = resolve(".");
  // Nonexistent file -> default single-workspace entry
  const fallback = loadWorkspaceRegistry(
    "./nonexistent-reg-file.json",
    defaultRoot,
    3456,
  );
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].id, "default");
  assert.equal(fallback[0].path, defaultRoot);

  // Valid registry file
  const tempRegPath = resolve(".", "test-temp-reg.json");
  try {
    writeFileSync(
      tempRegPath,
      JSON.stringify({
        workspaces: [
          { id: "ws-a", name: "Workspace Alpha", path: "./", port: 3457 },
          {
            id: "ws-b",
            name: "Workspace Beta",
            path: "../nonexistent-dir",
            port: 3458,
          },
        ],
      }),
      "utf8",
    );
    const loaded = loadWorkspaceRegistry(tempRegPath, defaultRoot, 3456);
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].id, "ws-a");
    assert.equal(loaded[0].port, 3457);
    assert.equal(loaded[1].id, "ws-b");
    assert.equal(loaded[1].port, 3458);
  } finally {
    try {
      rmSync(tempRegPath, { force: true });
    } catch {}
  }
});

test("CLI parser parses and validates --registry and -r flags", () => {
  assert.deepEqual(
    parseDashboardCliArgs(["--registry", "./custom-registry.json"]),
    {
      registryPath: "./custom-registry.json",
    },
  );
  assert.deepEqual(parseDashboardCliArgs(["-r", "./custom-registry2.json"]), {
    registryPath: "./custom-registry2.json",
  });
  assert.deepEqual(
    parseDashboardCliArgs(["--registry=./custom-registry3.json"]),
    {
      registryPath: "./custom-registry3.json",
    },
  );
  assert.deepEqual(parseDashboardCliArgs(["-r=./custom-registry4.json"]), {
    registryPath: "./custom-registry4.json",
  });

  // Rejections
  assert.throws(
    () => parseDashboardCliArgs(["--registry"]),
    /Missing value for flag --registry/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["-r"]),
    /Missing value for flag -r/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["--registry="]),
    /Value for flag --registry cannot be empty/,
  );
  assert.throws(
    () => parseDashboardCliArgs(["-r="]),
    /Value for flag -r cannot be empty/,
  );
});

test("GET /api/workspaces returns read-only summary for active and unavailable workspaces without crashing", async () => {
  const tempRegDir = resolve("..", "test-phase-c-registry-temp");
  const wsValid = join(tempRegDir, "valid-ws");
  const wsMissing = join(tempRegDir, "missing-ws");
  const regPath = join(tempRegDir, "workspaces.json");

  mkdirSync(join(wsValid, ".continuity"), { recursive: true });
  mkdirSync(join(wsValid, "reports"), { recursive: true });
  writeFileSync(
    join(wsValid, ".continuity", "state.json"),
    JSON.stringify({
      projectId: "alpha-proj",
      stage: "SPEC_READY",
      tasks: [{ id: "t1", status: "done" }],
      blockers: [],
    }),
    "utf8",
  );
  writeFileSync(
    join(wsValid, "reports", "status.txt"),
    "alpha-report-content",
    "utf8",
  );
  writeFileSync(
    regPath,
    JSON.stringify({
      workspaces: [
        { id: "alpha", name: "Alpha Workspace", path: wsValid, port: 4001 },
        {
          id: "beta",
          name: "Beta Missing Workspace",
          path: wsMissing,
          port: 4002,
        },
      ],
    }),
    "utf8",
  );

  const dash = createDashboardServer({
    workspaceRoot: wsValid,
    registryPath: regPath,
    port: 0,
  });
  const port = await dash.start();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. GET /api/workspaces
    const res = await fetch(`${baseUrl}/api/workspaces`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
    const data = await res.json();
    assert.ok(Array.isArray(data.workspaces));
    assert.equal(data.workspaces.length, 2);

    // Alpha is ACTIVE
    const alphaWs = data.workspaces.find((w: any) => w.id === "alpha");
    assert.ok(alphaWs);
    assert.equal(alphaWs.status, "ACTIVE");
    assert.equal(alphaWs.stage, "SPEC_READY");
    assert.equal(alphaWs.tasksCount, 1);

    // Beta is UNAVAILABLE
    const betaWs = data.workspaces.find((w: any) => w.id === "beta");
    assert.ok(betaWs);
    assert.equal(betaWs.status, "UNAVAILABLE");
    assert.ok(betaWs.error.includes("does not exist"));

    // 2. Querying alpha workspace via ?workspace=alpha
    const stateAlpha = await (
      await fetch(`${baseUrl}/api/state?workspace=alpha`)
    ).json();
    assert.equal(stateAlpha.projectId, "alpha-proj");

    const artAlpha = await (
      await fetch(`${baseUrl}/api/artifacts?workspace=alpha`)
    ).json();
    assert.ok(artAlpha.artifacts.includes("reports/status.txt"));

    const artContent = await (
      await fetch(
        `${baseUrl}/api/artifacts?path=reports/status.txt&workspace=alpha`,
      )
    ).text();
    assert.equal(artContent, "alpha-report-content");

    // 3. Containment rejection on registered workspace
    const trapRes = await fetch(
      `${baseUrl}/api/artifacts?path=../workspaces.json&workspace=alpha`,
    );
    assert.equal(trapRes.status, 403);

    // 4. Querying unregistered workspace returns 403
    const unregRes = await fetch(
      `${baseUrl}/api/state?workspace=unregistered-unknown`,
    );
    assert.equal(unregRes.status, 403);

    // 5. Querying unavailable workspace returns 404
    const unavailRes = await fetch(`${baseUrl}/api/state?workspace=beta`);
    assert.equal(unavailRes.status, 404);

    // 6. Non-GET/HEAD mutation returns 405 Method Not Allowed
    const postRes = await fetch(`${baseUrl}/api/workspaces`, {
      method: "POST",
      body: "{}",
    });
    assert.equal(postRes.status, 405);
  } finally {
    await dash.stop();
    try {
      rmSync(tempRegDir, { recursive: true, force: true });
    } catch {}
  }
});

test("getGitSummary suppresses stderr when inspecting a non-git directory and returns safe fallback", () => {
  const nonGitDir = resolve("..", "test-non-git-dir-sample");
  mkdirSync(nonGitDir, { recursive: true });

  const capturedStderr: string[] = [];
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  (process.stderr.write as any) = (chunk: any) => {
    capturedStderr.push(String(chunk));
    return true;
  };

  try {
    const summary = getGitSummary(nonGitDir);
    assert.deepEqual(summary, {
      branch: "unknown",
      clean: true,
      modifiedFiles: [],
    });
    assert.equal(
      capturedStderr.some((s) =>
        s.toLowerCase().includes("fatal: not a git repository"),
      ),
      false,
      "Must not emit fatal git error to process stderr",
    );
  } finally {
    process.stderr.write = origStderrWrite;
    try {
      rmSync(nonGitDir, { recursive: true, force: true });
    } catch {}
  }
});

test("GET /api/git returns safe summary without stderr for registered non-git workspace", async () => {
  const tempRegDir = resolve("..", "test-non-git-registry-sample");
  const wsNonGit = join(tempRegDir, "plain-folder");
  const regPath = join(tempRegDir, "workspaces.json");

  mkdirSync(wsNonGit, { recursive: true });
  writeFileSync(
    regPath,
    JSON.stringify({
      workspaces: [
        {
          id: "non-git-ws",
          name: "Non-Git Project",
          path: wsNonGit,
          port: 4003,
        },
      ],
    }),
    "utf8",
  );

  const dash = createDashboardServer({
    workspaceRoot: wsNonGit,
    registryPath: regPath,
    port: 0,
  });
  const port = await dash.start();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const res = await fetch(`${baseUrl}/api/git?workspace=non-git-ws`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data, {
      branch: "unknown",
      clean: true,
      modifiedFiles: [],
    });

    // Verify valid git workspace in current repo returns real git summary
    const realSummary = getGitSummary(resolve("."));
    assert.ok(typeof realSummary.branch === "string");
    assert.notEqual(realSummary.branch, "unknown");
    assert.ok(typeof realSummary.clean === "boolean");
  } finally {
    await dash.stop();
    try {
      rmSync(tempRegDir, { recursive: true, force: true });
    } catch {}
  }
});
