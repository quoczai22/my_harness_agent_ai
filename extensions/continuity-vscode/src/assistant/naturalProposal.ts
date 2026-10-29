import { MAX_FILE_BYTES } from "./guards";

export interface TrustedAgentProposal { path: string; operation: "create" | "replace"; content: string; }
export interface ProposalGateway { execute(request: TrustedAgentProposal): Promise<{ success: boolean; message: string }>; }

export function extractTrustedAgentProposal(raw: string, expectedPath: string): TrustedAgentProposal | undefined {
  const block = raw.match(/```json\s*([\s\S]*?)```/i);
  if (!block) return undefined;
  try {
    const candidate = JSON.parse(block[1]) as Partial<TrustedAgentProposal>;
    const path = candidate.path?.replace(/\\/g, "/").replace(/^\.\//, "");
    const expected = expectedPath.replace(/\\/g, "/").replace(/^\.\//, "");
    if (path !== expected || (candidate.operation !== "create" && candidate.operation !== "replace") || typeof candidate.content !== "string" || !candidate.content || Buffer.byteLength(candidate.content, "utf8") > MAX_FILE_BYTES || candidate.content.includes("\0")) return undefined;
    return { path, operation: candidate.operation, content: candidate.content };
  } catch { return undefined; }
}

export function buildTrustedAgentPrompt(task: string, relativePath: string, language: string, code: string, indexHint = ""): string {
  return `You are a local offline coding agent. Complete this task with one safe, bounded proposal for the active file only. First explain briefly in normal language. Then append exactly one JSON code block with {"path":"${relativePath}","operation":"replace","content":"the complete replacement file"}. Do not propose delete, rename, commands, or another path.\n\nTask: ${task}\n\nActive ${language} file:\n\`\`\`${language}\n${code}\n\`\`\`${indexHint}`;
}

export async function runTrustedAgentProposal(
  task: string,
  relativePath: string,
  language: string,
  code: string,
  queryLocal: (prompt: string) => Promise<string>,
  gateway: ProposalGateway,
  indexHint = ""
): Promise<{ raw: string; proposal?: TrustedAgentProposal; executed: boolean; message: string }> {
  let raw = await queryLocal(buildTrustedAgentPrompt(task, relativePath, language, code, indexHint));
  let proposal = extractTrustedAgentProposal(raw, relativePath);
  if (!proposal) {
    raw = await queryLocal(`${buildTrustedAgentPrompt(task, relativePath, language, code, indexHint)}\n\nYour previous response did not contain a valid bounded proposal. Retry once with exactly the required JSON block. Do not call tools or claim any write occurred.\n\nPrevious response:\n${raw.slice(0, 4_000)}`);
    proposal = extractTrustedAgentProposal(raw, relativePath);
  }
  if (!proposal) return { raw, executed: false, message: "Local model returned no valid proposal for the active file; nothing was written." };
  const result = await gateway.execute(proposal);
  return { raw, proposal, executed: result.success, message: result.message };
}
