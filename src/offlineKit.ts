import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";

const IGNORED = new Set([".git", "node_modules", "dist", "build", ".venv", "venv", "__pycache__"]);
export const MAX_LIBRARY_FILES = 2000;
export const MAX_LIBRARY_BYTES = 20 * 1024 * 1024;
export const MAX_PY_FILE_BYTES = 100 * 1024;
export interface LibraryManifestFile { sourceRoot: string; relativePath: string; bytes: number; sha256: string }
export interface OfflineKitManifest { version: 1; createdAt: string; files: LibraryManifestFile[]; skipped: number; totalBytes: number }

function safeFiles(root: string) {
  const files: Array<{ fullPath: string; relativePath: string }> = [];
  const visit = (dir: string) => readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    if (IGNORED.has(entry.name) || entry.name.startsWith(".env")) return;
    const fullPath = join(dir, entry.name);
    const rel = relative(root, fullPath);
    if (rel.startsWith("..") || rel.includes(`${sep}..${sep}`)) return;
    if (entry.isDirectory()) visit(fullPath);
    else if (entry.isFile() && extname(entry.name).toLowerCase() === ".py") files.push({ fullPath, relativePath: rel.replace(/\\/g, "/") });
  });
  visit(root); return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function createOfflineKit(sourceRoots: string[], outputDirectory: string, vsixPath: string): OfflineKitManifest {
  if (!existsSync(vsixPath)) throw new Error(`VSIX was not found: ${vsixPath}`);
  mkdirSync(outputDirectory, { recursive: true });
  const library = join(outputDirectory, "learning-library"); mkdirSync(library, { recursive: true });
  const files: LibraryManifestFile[] = []; let skipped = 0; let totalBytes = 0;
  for (const input of sourceRoots) {
    const root = resolve(input); if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`Source root is not a readable directory: ${input}`);
    const rootName = basename(root);
    for (const item of safeFiles(root)) {
      const bytes = statSync(item.fullPath).size;
      if (files.length >= MAX_LIBRARY_FILES || bytes > MAX_PY_FILE_BYTES || totalBytes + bytes > MAX_LIBRARY_BYTES) { skipped++; continue; }
      const target = join(library, rootName, ...item.relativePath.split("/")); mkdirSync(resolve(target, ".."), { recursive: true }); cpSync(item.fullPath, target, { force: false });
      files.push({ sourceRoot: rootName, relativePath: item.relativePath, bytes, sha256: createHash("sha256").update(readFileSync(item.fullPath)).digest("hex") }); totalBytes += bytes;
    }
  }
  const manifest: OfflineKitManifest = { version: 1, createdAt: new Date().toISOString(), files, skipped, totalBytes };
  writeFileSync(join(outputDirectory, "learning-library-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  cpSync(vsixPath, join(outputDirectory, "continuity-workflow.vsix"), { force: true });
  writeFileSync(join(outputDirectory, "continuity-offline-settings.json"), JSON.stringify({ "continuity.workspaceIndex.enabled": true, "continuity.offlineAssistantModel": "qwen2.5-coder:7b", "continuity.ollamaAutoStart": false }, null, 2) + "\n");
  writeFileSync(join(outputDirectory, "Configure-Continuity.ps1"), "$ErrorActionPreference = 'Stop'\n$path = Join-Path $env:APPDATA 'Code\\User\\settings.json'\nNew-Item -ItemType Directory -Force (Split-Path $path) | Out-Null\n$s = if (Test-Path $path) { Get-Content $path -Raw | ConvertFrom-Json -AsHashtable } else { @{} }\n$s['continuity.workspaceIndex.enabled'] = $true\n$s['continuity.offlineAssistantModel'] = 'qwen2.5-coder:7b'\n$s['continuity.ollamaAutoStart'] = $false\n$s | ConvertTo-Json -Depth 10 | Set-Content $path -Encoding utf8\n");
  writeFileSync(join(outputDirectory, "Install-Continuity.cmd"), "@echo off\r\nwhere code >nul 2>nul || (echo Install VS Code first, then rerun this file.& pause & exit /b 1)\r\ncode --install-extension \"%~dp0continuity-workflow.vsix\" --force || (pause & exit /b 1)\r\npowershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0Configure-Continuity.ps1\" || (pause & exit /b 1)\r\necho Installed. Open your learning folder, then run Continuity: Build Workspace Index.\r\npause\r\n");
  writeFileSync(join(outputDirectory, "Start-Continuity.cmd"), "@echo off\r\nstart \"\" code \"%~dp0learning-library\"\r\n");
  return manifest;
}
function values(args: string[], flag: string) { const found: string[] = []; for (let i = 0; i < args.length; i++) if (args[i] === flag && args[i + 1]) found.push(args[++i]); return found; }
if (process.argv[1]?.endsWith("offlineKit.js")) { const args = process.argv.slice(2), sources = values(args, "--source"), output = values(args, "--output")[0], vsix = values(args, "--vsix")[0] ?? resolve("extensions/continuity-vscode/continuity-workflow.vsix"); if (!sources.length || !output) throw new Error("Usage: node dist/offlineKit.js --source <folder> --output <kit-folder> [--source <folder>]"); const result = createOfflineKit(sources, resolve(output), vsix); console.log(`Offline Kit created: ${result.files.length} Python files, ${result.totalBytes} bytes.`); }