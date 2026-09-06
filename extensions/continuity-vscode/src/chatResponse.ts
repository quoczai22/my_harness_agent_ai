import { parseStructuredProposal, StructuredProposal } from "./proposal";

export interface ParsedAssistantResponse { answer: string; proposal?: StructuredProposal; }

export function splitAssistantResponse(response: string, expectedPath: string): ParsedAssistantResponse {
  const blocks = [...response.matchAll(/```json\s*([\s\S]*?)```/gi)];
  for (const block of blocks) {
    try {
      const proposal = parseStructuredProposal(block[1]);
      if (proposal.path.replace(/\\/g, "/").replace(/^\.\//, "") !== expectedPath.replace(/\\/g, "/").replace(/^\.\//, "")) continue;
      const answer = response.replace(block[0], "").trim();
      return { answer: answer || "I prepared one optional edit proposal for the active file. Review it in Composer before applying.", proposal };
    } catch { /* Invalid proposal is ordinary untrusted response text; retain it in chat. */ }
  }
  return { answer: response.trim() || "Local Ollama returned an empty response." };
}

function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character); }

/** Minimal Markdown renderer: all model text is escaped before only safe formatting tags are added. */
export function renderSafeMarkdown(value: string): string {
  let html = escapeHtml(value);
  html = html.replace(/```([a-z0-9_-]*)\n?([\s\S]*?)```/gi, (_all, language, code) => `<pre><code data-language="${escapeHtml(language)}">${code}</code></pre>`);
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  return html.replace(/\n/g, "<br>");
}
export function renderNonceProtectedHtml(bodyContent: string, nonce: string): string {
  if (!nonce) throw new Error("A non-empty CSP nonce is required.");
  const scripts = bodyContent.replace(/<script>/g, `<script nonce="${nonce}">`);
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"></head><body>${scripts}</body></html>`;
}