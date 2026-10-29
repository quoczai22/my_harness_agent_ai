const fs = require("node:fs/promises");
const path = require("node:path");
const { runLocalReadLoop } = require("../extensions/continuity-vscode/dist/assistant/agentLoop.js");
const { queryLocalLmStudio } = require("../extensions/continuity-vscode/dist/lmStudioClient.js");

async function main() {
  const result = await runLocalReadLoop(
    "Read src/workspaceRegistry.ts and explain what stableWorkspaceId does. Do not guess without reading.",
    prompt => queryLocalLmStudio(prompt, { model: "harness-local-2b", timeoutMs: 120_000 }),
    async requested => {
      if (requested !== "src/workspaceRegistry.ts") throw new Error("Probe read was not allowlisted");
      return (await fs.readFile(path.join(__dirname, "../src/workspaceRegistry.ts"), "utf8")).slice(0, 16_000);
    },
    4,
  );
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (result.status !== "answered" || !result.filesRead.includes("src/workspaceRegistry.ts")) process.exitCode = 1;
}

main().catch(error => { process.stderr.write(String(error) + "\n"); process.exitCode = 1; });
