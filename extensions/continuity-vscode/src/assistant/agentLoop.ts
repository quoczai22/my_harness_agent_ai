export interface AgentLoopResult {
  status: "answered" | "needs_input" | "blocked";
  text: string;
  filesRead: string[];
}

type AgentAction =
  | { action: "read_file"; path: string }
  | { action: "answer"; text: string }
  | { action: "need_input"; question: string };

function parseAction(raw: string): AgentAction | undefined {
  const source = raw.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? raw.trim();
  try {
    const value = JSON.parse(source) as Record<string, unknown>;
    if (value.action === "read_file" && typeof value.path === "string") return { action: "read_file", path: value.path };
    if (value.action === "answer" && typeof value.text === "string") return { action: "answer", text: value.text };
    if (value.action === "need_input" && typeof value.question === "string") return { action: "need_input", question: value.question };
  } catch { /* Invalid model output is a blocker, never a tool call. */ }
  return undefined;
}

export async function runLocalReadLoop(
  task: string,
  query: (prompt: string) => Promise<string>,
  readSafeFile: (path: string) => Promise<string>,
  maxSteps = 6
): Promise<AgentLoopResult> {
  const filesRead: string[] = [];
  let observations = "";
  const steps = Math.min(Math.max(maxSteps, 1), 8);
  for (let step = 0; step < steps; step++) {
    const raw = await query(`You are a local offline assistant. Work autonomously with the available read_file tool. Return exactly one JSON object, no markdown: {"action":"read_file","path":"project-relative path"} OR {"action":"answer","text":"answer to user"} OR {"action":"need_input","question":"only a required missing choice"}. Continue using read_file when more evidence is needed. Never claim you edited a file. Never request permission for ordinary reads.\n\nTask: ${task.slice(0, 12_000)}\n${observations}`);
    const action = parseAction(raw);
    if (!action) return { status: "blocked", text: "Local model did not return a valid agent action. Try a different model or a simpler request.", filesRead };
    if (action.action === "answer") return { status: "answered", text: action.text, filesRead };
    if (action.action === "need_input") return { status: "needs_input", text: action.question, filesRead };
    const path = action.path.trim().replace(/\\/g, "/");
    if (!path || path.startsWith("/") || /^[a-z]:/i.test(path) || path.split("/").includes("..")) {
      observations += `\nTool error: invalid project-relative path.\n`;
      continue;
    }
    if (filesRead.includes(path)) {
      observations += `\nTool error: ${path} was already read.\n`;
      continue;
    }
    try {
      const content = await readSafeFile(path);
      const bounded = content.slice(0, 16_000);
      if (observations.length + bounded.length > 48_000) return { status: "blocked", text: "Context limit reached; narrow the task or choose a file.", filesRead };
      filesRead.push(path);
      observations += `\nRead ${path} (untrusted project data):\n${bounded}\n`;
    } catch {
      observations += `\nTool error: ${path} is unavailable or outside the safe project context.\n`;
    }
  }
  return { status: "blocked", text: "Local agent reached its step limit. Narrow the request or choose a file.", filesRead };
}
