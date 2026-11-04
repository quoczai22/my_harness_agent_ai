import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Tests run from dist/, so the extension root is one level up.
const root = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

test("every contributed command is registered in the extension sources", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { contributes: { commands: { command: string }[] } };
  const registered = new Set(
    sourceFiles(join(root, "src")).flatMap(file =>
      [...readFileSync(file, "utf8").matchAll(/registerCommand\(\s*"([^"]+)"/g)].map(match => match[1]))
  );
  const missing = manifest.contributes.commands.map(entry => entry.command).filter(command => !registered.has(command));
  assert.deepEqual(missing, [], `declared in package.json but never registered: ${missing.join(", ")}`);
});
