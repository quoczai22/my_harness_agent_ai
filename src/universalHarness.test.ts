import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createDashboardServer } from "./dashboard.js";
import {
  buildContextPacket,
  buildProjectFlow,
  buildProjectIndex,
  createHarnessSession,
  extractFileRelationships,
  loadHarnessSessions,
  readSafeProjectFile,
  shouldIgnoreProjectPath,
  updateHarnessSession,
} from "./universalHarness.js";

function createFixture() {
  const root = resolve("tmp", `universal-harness-${randomUUID()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "node_modules", "ignored"), { recursive: true });
  mkdirSync(join(root, ".continuity"), { recursive: true });
  writeFileSync(join(root, "AGENTS.md"), "Keep changes focused and tested.\n", "utf8");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", dependencies: { react: "1.0.0" } }),
    "utf8",
  );
  writeFileSync(
    join(root, "src", "main.ts"),
    'import { value } from "./value";\nexport const result = value + 1;\n',
    "utf8",
  );
  writeFileSync(
    join(root, "src", "value.ts"),
    "export const value = 41;\n",
    "utf8",
  );
  writeFileSync(join(root, ".env"), "SECRET=do-not-index\n", "utf8");
  writeFileSync(
    join(root, "node_modules", "ignored", "index.js"),
    "throw new Error('must not index');",
    "utf8",
  );
  return root;
}

test("safe project index is deterministic, neutral, and excludes secrets and vendors", () => {
  const root = createFixture();
  try {
    const first = buildProjectIndex(root);
    const second = buildProjectIndex(root);
    assert.deepEqual(
      first.files.map((file) => file.path),
      second.files.map((file) => file.path),
    );
    assert.ok(first.files.some((file) => file.path === "src/main.ts"));
    assert.ok(first.files.some((file) => file.path === "AGENTS.md"));
    assert.equal(first.files.some((file) => file.path === ".env"), false);
    assert.equal(
      first.files.some((file) => file.path.includes("node_modules")),
      false,
    );
    assert.ok(first.technologies.includes("Node.js"));
    assert.ok(first.technologies.includes("TypeScript"));
    assert.equal(first.technologies.includes("ASP.NET"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("safe file reads reject traversal, secrets, symlinks, and unsupported files", () => {
  const root = createFixture();
  try {
    assert.match(readSafeProjectFile(root, "src/main.ts").content, /value/);
    assert.throws(() => readSafeProjectFile(root, "../outside.ts"), /UNSAFE_PATH/);
    assert.throws(() => readSafeProjectFile(root, ".env"), /UNSAFE_PATH/);
    assert.throws(
      () => readSafeProjectFile(root, "node_modules/ignored/index.js"),
      /UNSAFE_PATH/,
    );
    assert.equal(shouldIgnoreProjectPath("obj/Debug/app.dll"), true);
    assert.equal(shouldIgnoreProjectPath("src/app.ts"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("relationships and bounded context packets use only selected safe project files", () => {
  const root = createFixture();
  try {
    const relationships = extractFileRelationships(root, "src/main.ts");
    assert.deepEqual(relationships, [
      { source: "src/main.ts", target: "src/value.ts", kind: "import" },
    ]);
    const packet = buildContextPacket(root, "fixture-a", {
      prompt: "Explain this project",
      selectedPaths: ["src/main.ts", "src/value.ts"],
      maxCharacters: 4_000,
    });
    assert.equal(packet.workspaceId, "fixture-a");
    assert.ok(packet.instructions.some((item) => item.path === "AGENTS.md"));
    assert.deepEqual(
      packet.files.map((file) => file.path),
      ["src/main.ts", "src/value.ts"],
    );
    assert.ok(packet.budget.usedCharacters <= packet.budget.maximumCharacters);
    assert.equal(JSON.stringify(packet).includes("do-not-index"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("session persistence remains isolated by workspace root", () => {
  const rootA = createFixture();
  const rootB = createFixture();
  try {
    createHarnessSession(rootA, "workspace-a", "Session A", "codex");
    createHarnessSession(rootB, "workspace-b", "Session B", "antigravity");
    const sessionsA = loadHarnessSessions(rootA, "workspace-a");
    const sessionsB = loadHarnessSessions(rootB, "workspace-b");
    assert.equal(sessionsA.length, 1);
    assert.equal(sessionsB.length, 1);
    assert.equal(sessionsA[0].title, "Session A");
    assert.equal(sessionsB[0].title, "Session B");
    assert.equal(loadHarnessSessions(rootA, "workspace-b").length, 0);
  } finally {
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
  }
});

test("project flow is evidence-derived and session updates persist provider context", () => {
  const root = createFixture();
  try {
    const flow = buildProjectFlow(root, { maxNodes: 24, maxEdges: 24 });
    assert.ok(flow.nodes.some((node) => node.path === "src/main.ts"));
    assert.ok(flow.edges.some((edge) => edge.source === "src/main.ts" && edge.target === "src/value.ts"));
    assert.equal(flow.nodes.some((node) => node.path === ".env"), false);

    const session = createHarnessSession(root, "workspace-flow", "Flow session", "antigravity");
    const updated = updateHarnessSession(root, "workspace-flow", session.id, (value) => ({
      ...value,
      providerConversations: { antigravity: "conversation-1" },
      messages: [{ id: "m1", role: "user", content: "Review", createdAt: new Date().toISOString() }],
    }));
    assert.equal(updated.providerConversations?.antigravity, "conversation-1");
    assert.equal(loadHarnessSessions(root, "workspace-flow")[0].messages?.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Universal Harness APIs index, preview, persist sessions, and reject traversal", async () => {
  const root = createFixture();
  const registryPath = join(root, ".continuity", "workspaces.json");
  writeFileSync(
    registryPath,
    JSON.stringify({
      workspaces: [{ id: "fixture", name: "Fixture", path: root, port: 0 }],
    }),
    "utf8",
  );
  const dashboard = createDashboardServer({
    workspaceRoot: root,
    registryPath,
    port: 0,
  });
  const port = await dashboard.start();
  const base = `http://127.0.0.1:${port}`;
  try {
    const indexResponse = await fetch(`${base}/api/project-index?workspace=fixture`);
    assert.equal(indexResponse.status, 200);
    const index = await indexResponse.json();
    assert.ok(index.files.some((file: any) => file.path === "src/main.ts"));

    const previewResponse = await fetch(
      `${base}/api/project-file?workspace=fixture&path=${encodeURIComponent("src/main.ts")}`,
    );
    assert.equal(previewResponse.status, 200);

    const traversalResponse = await fetch(
      `${base}/api/project-file?workspace=fixture&path=${encodeURIComponent("../outside.ts")}`,
    );
    assert.equal(traversalResponse.status, 403);

    const sessionResponse = await fetch(`${base}/api/sessions?workspace=fixture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "API session", mode: "auto" }),
    });
    assert.equal(sessionResponse.status, 201);
    const sessions = await (
      await fetch(`${base}/api/sessions?workspace=fixture`)
    ).json();
    assert.equal(sessions.sessions.length, 1);

    const packetResponse = await fetch(
      `${base}/api/context-packet?workspace=fixture`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Review selected code",
          selectedPaths: ["src/main.ts"],
          mode: "auto",
        }),
      },
    );
    assert.equal(packetResponse.status, 200);
    const packet = await packetResponse.json();
    assert.equal(packet.packet.workspaceId, "fixture");
    assert.equal(packet.packet.files.length, 1);

    const flowResponse = await fetch(`${base}/api/project-flow?workspace=fixture`);
    assert.equal(flowResponse.status, 200);
    const flow = await flowResponse.json();
    assert.ok(flow.flow.nodes.some((node: any) => node.path === "src/main.ts"));

    const harnessFlowResponse = await fetch(`${base}/api/harness-flow?workspace=fixture`);
    assert.equal(harnessFlowResponse.status, 200);
    const harnessFlow = await harnessFlowResponse.json();
    assert.ok(harnessFlow.steps.some((step: any) => step.id === "provider"));
    assert.ok(harnessFlow.steps.some((step: any) => step.id === "apply" && step.status === "disabled"));

    const additionalWorkspace = join(root, "additional-project");
    mkdirSync(additionalWorkspace, { recursive: true });
    const registrationResponse = await fetch(`${base}/api/workspaces/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: additionalWorkspace, name: "Additional" }),
    });
    assert.equal(registrationResponse.status, 201);
    const registered = await registrationResponse.json();
    assert.equal(registered.created, true);
    const duplicateRegistration = await fetch(`${base}/api/workspaces/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: additionalWorkspace }),
    });
    assert.equal(duplicateRegistration.status, 200);
    assert.equal((await duplicateRegistration.json()).created, false);

    const forbiddenMutation = await fetch(`${base}/api/project-file`, {
      method: "POST",
      body: "{}",
    });
    assert.equal(forbiddenMutation.status, 405);
  } finally {
    await dashboard.stop();
    rmSync(root, { recursive: true, force: true });
  }
});
