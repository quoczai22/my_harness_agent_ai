/**
 * The main chat with Claude Code: `claude -p --output-format stream-json`,
 * one Claude session per Harness session (resumed by id), in plan mode so the
 * chat reads and plans but never edits. Also turns a reply into task proposals.
 */
import type { AgentConfig } from "./agentRunner.js";
import { runProcess } from "./agentRunner.js";

export type ChatEvent =
  | { type: "session"; sessionId: string }
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "result"; text: string; sessionId?: string; isError: boolean; costUsd?: number }
  | { type: "error"; message: string };

/** Builds the chat command from the configured read-only Claude command. */
export function chatCommand(config: AgentConfig, message: string, resumeId?: string): string[] {
  const entry = config.agents.claude;
  const template = entry?.review_cmd ?? ["claude", "-p", "{prompt}", "--permission-mode", "plan"];
  const argv = template.map((part) => (part === "{prompt}" ? message : part));
  if (!template.includes("{prompt}")) argv.push(message);
  // The chat must stay read-only even if the configured command says otherwise.
  const modeIndex = argv.indexOf("--permission-mode");
  if (modeIndex >= 0) argv.splice(modeIndex, 2);
  argv.push("--permission-mode", "plan", "--output-format", "stream-json", "--verbose");
  if (resumeId) {
    if (!/^[A-Za-z0-9-]{8,80}$/.test(resumeId)) throw new Error("INVALID_CLAUDE_SESSION");
    argv.push("--resume", resumeId);
  }
  return argv;
}

/** Turns one stream-json line into chat events. Unknown lines are ignored. */
export function parseStreamLine(line: string): ChatEvent[] {
  let data: any;
  try { data = JSON.parse(line); } catch { return []; }
  if (!data || typeof data !== "object") return [];
  if (data.type === "system" && data.subtype === "init" && typeof data.session_id === "string") {
    return [{ type: "session", sessionId: data.session_id }];
  }
  if (data.type === "assistant" && Array.isArray(data.message?.content)) {
    const events: ChatEvent[] = [];
    for (const block of data.message.content) {
      if (block?.type === "text" && typeof block.text === "string" && block.text) events.push({ type: "text", text: block.text });
      if (block?.type === "tool_use" && typeof block.name === "string") events.push({ type: "tool", name: block.name });
    }
    return events;
  }
  if (data.type === "result") {
    return [{
      type: "result",
      text: typeof data.result === "string" ? data.result : "",
      sessionId: typeof data.session_id === "string" ? data.session_id : undefined,
      isError: Boolean(data.is_error) || data.subtype !== "success",
      costUsd: typeof data.total_cost_usd === "number" ? data.total_cost_usd : undefined,
    }];
  }
  return [];
}

export async function runClaudeChat(
  config: AgentConfig,
  input: { cwd: string; message: string; resumeId?: string; signal?: AbortSignal; timeoutMs?: number },
  onEvent: (event: ChatEvent) => void,
): Promise<{ text: string; sessionId?: string; error?: string }> {
  let buffer = "";
  let text = "";
  let sessionId = input.resumeId;
  let finalText: string | undefined;
  let error: string | undefined;
  const handle = (event: ChatEvent) => {
    if (event.type === "session") sessionId = event.sessionId;
    if (event.type === "text") text += (text ? "\n\n" : "") + event.text;
    if (event.type === "result") {
      if (event.sessionId) sessionId = event.sessionId;
      finalText = event.text;
      if (event.isError) error = event.text || "Claude Code reported an error.";
    }
    onEvent(event);
  };
  const result = await runProcess(chatCommand(config, input.message, input.resumeId), {
    cwd: input.cwd,
    timeoutMs: input.timeoutMs ?? 15 * 60_000,
    signal: input.signal,
    onOutput: (chunk) => {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) parseStreamLine(line).forEach(handle);
      }
    },
  });
  if (buffer.trim()) parseStreamLine(buffer.trim()).forEach(handle);
  if (result.error) error = result.error;
  else if (result.timedOut) error = "Claude Code timed out.";
  else if (result.canceled) error = "Canceled.";
  else if (result.exitCode !== 0 && !error) error = `Claude Code exited with code ${result.exitCode}: ${result.output.slice(-500)}`;
  if (error) onEvent({ type: "error", message: error });
  return { text: finalText || text, sessionId, ...(error ? { error } : {}) };
}

export const TASK_PROPOSAL_INSTRUCTIONS = `Split what we discussed into implementation tasks for the agent loop (Antigravity implements, Codex tests, Claude reviews).
Reply with a short sentence, then exactly one fenced json block of this shape and nothing after it:
\`\`\`json
{"tasks": [{"title": "...", "description": "what to build and how to check it", "allowedFiles": ["src/ui/**"], "acceptance": ["measurable check"]}]}
\`\`\`
Keep each task small enough for one implementer pass. allowedFiles are glob patterns relative to the repository root.`;

export interface ProposedTask { title: string; description: string; allowedFiles: string[]; acceptance: string[] }

/** Reads the last ```json block (or bare JSON object) with a "tasks" list. */
export function extractTaskProposals(text: string): ProposedTask[] {
  const candidates = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const bare = text.lastIndexOf('{"tasks"');
  if (bare >= 0) candidates.push(text.slice(bare));
  for (const candidate of candidates.reverse()) {
    try {
      const parsed = JSON.parse(candidate.trim());
      if (!Array.isArray(parsed?.tasks)) continue;
      return parsed.tasks
        .filter((t: any) => t && typeof t.title === "string" && t.title.trim())
        .slice(0, 20)
        .map((t: any) => ({
          title: String(t.title).trim().slice(0, 200),
          description: typeof t.description === "string" ? t.description : "",
          allowedFiles: Array.isArray(t.allowedFiles) ? t.allowedFiles.filter((p: unknown) => typeof p === "string") : [],
          acceptance: Array.isArray(t.acceptance) ? t.acceptance.filter((a: unknown) => typeof a === "string") : [],
        }));
    } catch { /* try the next candidate */ }
  }
  return [];
}
