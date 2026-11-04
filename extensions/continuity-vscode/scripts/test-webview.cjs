const { spawn, execFile } = require("node:child_process");
const { existsSync, mkdtempSync, mkdirSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const extensionRoot = resolve(__dirname, "..");
const installedCandidates = [
  process.env.CONTINUITY_TEST_CODE_EXE,
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "Microsoft VS Code", "Code.exe"),
  process.env.USERPROFILE && join(process.env.USERPROFILE, "AppData", "Local", "Programs", "Microsoft VS Code", "Code.exe")
].filter(Boolean);
const codeExe = installedCandidates.find(existsSync) || installedCandidates[0];
const runRoot = mkdtempSync(join(tmpdir(), "continuity-webview-"));
const workspace = join(runRoot, "workspace");
const userData = join(runRoot, "user-data");
const extensions = join(runRoot, "extensions");
mkdirSync(workspace);
mkdirSync(userData);
mkdirSync(extensions);
const args = [
  workspace,
  `--extensionDevelopmentPath=${extensionRoot}`,
  `--extensionTestsPath=${join(extensionRoot, "dist", "integration", "webview.integration.js")}`,
  `--user-data-dir=${userData}`,
  `--extensions-dir=${extensions}`,
  "--disable-workspace-trust",
  "--skip-welcome",
  "--disable-telemetry",
  "--new-window"
];
const commandLine = [codeExe, ...args].map(arg => `"${arg.replaceAll('"', '\\"')}"`).join(" ");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^VSCODE_|^ELECTRON_/i.test(key)));
env.CONTINUITY_EXTENSION_TEST = "1";
const timeoutMs = 120_000;

function killTree(child) {
  if (!child.pid) return Promise.resolve();
  if (process.platform !== "win32") { child.kill("SIGKILL"); return Promise.resolve(); }
  return new Promise(resolve => {
    execFile("taskkill.exe", ["/T", "/F", "/PID", String(child.pid)], { timeout: 10_000 }, () => resolve());
  });
}

async function main() {
  console.log(`VS Code command: ${commandLine}`);
  if (!existsSync(codeExe)) throw new Error(`Code.exe not found: ${codeExe}`);
  const child = spawn(codeExe, args, { cwd: workspace, env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void killTree(child); }, timeoutMs);
  try {
    const result = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
      child.stdout.on("data", chunk => process.stdout.write(chunk));
      child.stderr.on("data", chunk => process.stderr.write(chunk));
    });
    if (timedOut) throw new Error(`VS Code test timed out after ${timeoutMs} ms.`);
    if (result.code !== 0) throw new Error(`VS Code test exited with code ${result.code}, signal ${result.signal || "none"}.`);
  } finally { clearTimeout(timer); }
}

main().catch(error => { console.error(`VS Code command: ${commandLine}`); console.error(error); process.exitCode = 1; })
  .finally(() => {
    try { rmSync(runRoot, { recursive: true, force: true }); }
    catch (error) { console.error(`Could not remove temporary test directory ${runRoot}:`, error); process.exitCode = 1; }
  });

