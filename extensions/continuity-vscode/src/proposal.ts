export interface StructuredProposal {
  path: string;
  original: string;
  replacement: string;
}

export interface ParsedAssistantResponse {
  chatText: string;
  proposal?: StructuredProposal;
}

export function parseStructuredProposal(value: string): StructuredProposal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("The model response is not a structured JSON proposal.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("The proposal must be a JSON object.");
  }
  const proposal = parsed as Partial<StructuredProposal>;
  if (
    typeof proposal.path !== "string" ||
    typeof proposal.original !== "string" ||
    typeof proposal.replacement !== "string" ||
    !proposal.path.trim() ||
    !proposal.original
  ) {
    throw new Error("Proposal must contain non-empty path and original strings plus replacement.");
  }
  if (
    Buffer.byteLength(proposal.original, "utf8") > 8 * 1024 ||
    Buffer.byteLength(proposal.replacement, "utf8") > 8 * 1024
  ) {
    throw new Error("Proposal snippets exceed the 8 KB safety limit.");
  }
  return proposal as StructuredProposal;
}

/**
 * Parses raw assistant output to separate conversational explanations from optional structured proposals.
 */
export function extractAssistantResponse(raw: string, expectedPath?: string): ParsedAssistantResponse {
  if (!raw || !raw.trim()) {
    return { chatText: "" };
  }

  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = raw.match(jsonBlockRegex);

  if (!match) {
    return { chatText: raw.trim() };
  }

  const blockFull = match[0];
  const blockContent = match[1].trim();

  let proposal: StructuredProposal | undefined;
  try {
    const candidate = parseStructuredProposal(blockContent);
    if (!expectedPath || candidate.path === expectedPath) {
      proposal = candidate;
    }
  } catch {
    proposal = undefined;
  }

  let chatText = raw;
  if (proposal) {
    chatText = raw.replace(blockFull, "").trim();
  } else if (blockContent.startsWith("{") && blockContent.includes('"path"')) {
    // If it looked like an attempted proposal block that failed validation, strip it from display text
    chatText = raw.replace(blockFull, "").trim();
  } else {
    chatText = raw.trim();
  }

  if (!chatText && proposal) {
    chatText = `Proposed edit for ${proposal.path}:`;
  } else if (!chatText) {
    chatText = raw.trim();
  }

  return { chatText, proposal };
}