import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  canonicalWorkspaceDirectory,
  loadUserWorkspaceRegistry,
  mergeWorkspaceRegistries,
  registerUserWorkspace,
  stableWorkspaceId,
} from "./workspaceRegistry.js";

function fixtureRoot(): string {
  const root = resolve("tmp", `workspace-registry-${randomUUID()}`);
  mkdirSync(root, { recursive: true });
  return root;
}

test("workspace registration is canonical, persistent, and duplicate-safe", () => {
  const root = fixtureRoot();
  const project = join(root, "sample-project");
  const registry = join(root, ".continuity", "workspaces.local.json");
  mkdirSync(project, { recursive: true });
  try {
    const first = registerUserWorkspace(registry, project, "Sample");
    const second = registerUserWorkspace(registry, join(project, "."), "Ignored duplicate name");
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(first.workspace.id, stableWorkspaceId(canonicalWorkspaceDirectory(project)));
    assert.deepEqual(loadUserWorkspaceRegistry(registry), [first.workspace]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workspace registry rejects files, missing paths, and malformed persistence", () => {
  const root = fixtureRoot();
  const registry = join(root, "registry.json");
  const file = join(root, "not-a-folder.txt");
  writeFileSync(file, "x", "utf8");
  try {
    assert.throws(() => canonicalWorkspaceDirectory(file), /WORKSPACE_NOT_DIRECTORY/);
    assert.throws(() => canonicalWorkspaceDirectory("relative/project"), /WORKSPACE_PATH_NOT_ABSOLUTE/);
    assert.throws(() => canonicalWorkspaceDirectory(join(root, "missing")), /WORKSPACE_NOT_FOUND/);
    writeFileSync(registry, JSON.stringify({ nope: [] }), "utf8");
    assert.throws(() => loadUserWorkspaceRegistry(registry), /INVALID_LOCAL_REGISTRY/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("configured workspaces win path duplicates while colliding ids remain unique", () => {
  const root = fixtureRoot();
  const other = fixtureRoot();
  try {
    const merged = mergeWorkspaceRegistries(
      [{ id: "same", name: "Configured", path: root }],
      [
        { id: "local-duplicate", name: "Duplicate path", path: root },
        { id: "same", name: "Other", path: other },
      ],
    );
    assert.equal(merged.length, 2);
    assert.equal(merged[0].name, "Configured");
    assert.notEqual(merged[0].id, merged[1].id);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
  }
});
