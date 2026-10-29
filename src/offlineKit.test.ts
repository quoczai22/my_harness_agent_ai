import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createOfflineKit } from "./offlineKit.js";
test("offline kit exports nested Python only and creates installer files", () => {
  const root = mkdtempSync(join(tmpdir(), "continuity-kit-test-"));
  try { const source = join(root, "ontapkiemtra"); mkdirSync(join(source, "labpython", "buoi1"), { recursive: true }); mkdirSync(join(source, ".git"), { recursive: true }); mkdirSync(join(source, ".venv"), { recursive: true }); writeFileSync(join(source, "main.py"), "print('safe')"); writeFileSync(join(source, "labpython", "buoi1", "exercise.py"), "print('nested')"); writeFileSync(join(source, ".env"), "SECRET=no"); writeFileSync(join(source, ".git", "hidden.py"), "print('no')"); writeFileSync(join(source, ".venv", "dependency.py"), "print('no')"); const vsix = join(root, "continuity.vsix"); writeFileSync(vsix, "package"); const kit = join(root, "kit"); const manifest = createOfflineKit([source], kit, vsix); assert.equal(manifest.files.length, 2); assert.equal(existsSync(join(kit, "learning-library", "ontapkiemtra", "labpython", "buoi1", "exercise.py")), true); assert.equal(existsSync(join(kit, "learning-library", "ontapkiemtra", ".env")), false); assert.equal(existsSync(join(kit, "learning-library", "ontapkiemtra", ".venv", "dependency.py")), false); for (const file of ["learning-library-manifest.json", "continuity-workflow.vsix", "Install-Continuity.cmd", "Start-Continuity.cmd"]) assert.equal(existsSync(join(kit, file)), true); } finally { rmSync(root, { recursive: true, force: true }); }
});