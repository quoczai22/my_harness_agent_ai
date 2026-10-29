import { limitUtf8 } from "./guards";
import type { IndexedFileRecord, WorkspaceIndexState } from "./workspaceIndex";

export const MAX_RETRIEVED_FILES = 3;
export const MAX_RETRIEVED_SNIPPET_BYTES = 4 * 1024;
export const MAX_RETRIEVED_TOTAL_BYTES = 10 * 1024;

export function isIndexForWorkspace(index: WorkspaceIndexState | null, rootFsPath: string): index is WorkspaceIndexState {
  return Boolean(index && index.workspaceRoot === rootFsPath);
}

export interface RetrievedCandidate {
  relativePath: string;
  score: number;
  match: "exact" | "similar";
}

function words(value: string): Set<string> {
  return new Set((value.toLowerCase().match(/[a-z0-9_]{2,}/g) ?? []).filter(word => !["the", "and", "for", "with", "this", "that", "file", "code", "please"].includes(word)));
}

/** Ranks opt-in index records without reading arbitrary workspace files. */
export function findRelevantFiles(query: string, files: IndexedFileRecord[]): RetrievedCandidate[] {
  const normalized = query.toLowerCase();
  const queryWords = words(query);
  return files.map(file => {
    const path = file.relativePath.toLowerCase();
    const name = path.split("/").at(-1) ?? path;
    const summary = file.summary.toLowerCase();
    const exact = normalized.includes(path) || normalized.includes(name);
    const overlap = [...queryWords].filter(word => path.includes(word) || summary.includes(word)).length;
    return { relativePath: file.relativePath, score: (exact ? 10_000 : 0) + overlap, match: exact ? "exact" as const : "similar" as const };
  }).filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath))
    .slice(0, MAX_RETRIEVED_FILES);
}

export function formatRetrievedContext(snippets: Array<{ relativePath: string; language: string; text: string }>): string {
  let remaining = MAX_RETRIEVED_TOTAL_BYTES;
  const parts: string[] = [];
  for (const snippet of snippets) {
    if (remaining <= 0) break;
    const bounded = limitUtf8(snippet.text, Math.min(MAX_RETRIEVED_SNIPPET_BYTES, remaining));
    remaining -= Buffer.byteLength(bounded, "utf8");
    parts.push(`Relevant local file: ${snippet.relativePath}\n\`\`\`${snippet.language}\n${bounded}\n\`\`\``);
  }
  return parts.length ? `\n\nRetrieved local workspace context (use it only when relevant):\n${parts.join("\n\n")}` : "";
}