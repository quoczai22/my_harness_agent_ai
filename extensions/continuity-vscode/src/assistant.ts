/**
 * Offline Code Assistant - Core Safety, Context Guard, and Domain Logic
 */

export const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:7b";
export const MAX_FILE_SIZE_BYTES = 100 * 1024; // 100 KB
export const MAX_CONTEXT_BYTES = 256 * 1024; // 256 KB

const IGNORED_PATH_PATTERNS = [
  /(?:^|[\\/])\.git(?:[\\/]|$)/i,
  /(?:^|[\\/])node_modules(?:[\\/]|$)/i,
  /(?:^|[\\/])dist(?:[\\/]|$)/i,
  /(?:^|[\\/])build(?:[\\/]|$)/i,
  /(?:^|[\\/])\.env(?:\..+)?$/i
];

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
  ".pdf", ".zip", ".tar", ".gz", ".7z",
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".woff", ".woff2", ".ttf", ".eot",
  ".wasm", ".pyc", ".vsix"
]);

/**
 * Validates if a file path is ignored based on security and build rules.
 */
export function isIgnoredPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  
  if (IGNORED_PATH_PATTERNS.some(pattern => pattern.test(normalized))) {
    return true;
  }

  const dotIdx = normalized.lastIndexOf(".");
  if (dotIdx !== -1) {
    const ext = normalized.slice(dotIdx).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      return true;
    }
  }

  return false;
}

export interface WorkspaceFileEntry {
  path: string;
  content: string;
  sizeBytes: number;
}

/**
 * Sanitizes workspace context by filtering ignored files, applying size limits and truncating overflow.
 */
export function sanitizeWorkspaceContext(
  files: WorkspaceFileEntry[],
  maxFileSize: number = MAX_FILE_SIZE_BYTES,
  maxTotalContext: number = MAX_CONTEXT_BYTES
): { accepted: WorkspaceFileEntry[]; rejected: { path: string; reason: string }[]; totalBytes: number } {
  const accepted: WorkspaceFileEntry[] = [];
  const rejected: { path: string; reason: string }[] = [];
  let totalBytes = 0;

  for (const file of files) {
    if (isIgnoredPath(file.path)) {
      rejected.push({ path: file.path, reason: "Ignored path or binary file" });
      continue;
    }

    if (file.sizeBytes > maxFileSize) {
      rejected.push({ path: file.path, reason: `File size exceeds limit (${file.sizeBytes} > ${maxFileSize})` });
      continue;
    }

    if (totalBytes + file.sizeBytes > maxTotalContext) {
      rejected.push({ path: file.path, reason: "Context budget exceeded" });
      break;
    }

    accepted.push(file);
    totalBytes += file.sizeBytes;
  }

  return { accepted, rejected, totalBytes };
}

/**
 * Validates that an Ollama endpoint is strictly local loopback (127.0.0.1 or localhost).
 */
export function validateOllamaEndpoint(endpoint: string): { valid: boolean; normalizedUrl?: string; error?: string } {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port !== "11434" || url.username || url.password || url.pathname !== "/") {
      return { valid: false, error: "Security violation: Offline mode permits only http://127.0.0.1:11434." };
    }
    return { valid: true, normalizedUrl: DEFAULT_OLLAMA_HOST };
  } catch { return { valid: false, error: `Invalid URL format: '${endpoint}'` }; }
}
export interface StyleProfile {
  indentation: "spaces_2" | "spaces_4" | "tabs";
  quotes: "single" | "double";
  semicolons: boolean;
  docstringStyle: "jsdoc" | "google" | "standard";
  extractedFromFilesCount: number;
}

/**
 * Extracts a coding style profile from active code samples.
 */
export function extractStyleProfile(samples: { path: string; content: string }[]): StyleProfile {
  let space2Count = 0;
  let space4Count = 0;
  let tabCount = 0;
  let singleQuoteCount = 0;
  let doubleQuoteCount = 0;
  let semiCount = 0;
  let nonSemiCount = 0;

  for (const sample of samples) {
    if (isIgnoredPath(sample.path)) continue;
    const lines = sample.content.split("\n");

    for (const line of lines) {
      if (line.startsWith("\t")) tabCount++;
      else if (line.startsWith("    ")) space4Count++;
      else if (line.startsWith("  ")) space2Count++;

      const singles = (line.match(/'/g) || []).length;
      const doubles = (line.match(/"/g) || []).length;
      singleQuoteCount += singles;
      doubleQuoteCount += doubles;

      const trimmed = line.trim();
      if (trimmed.length > 0 && !trimmed.startsWith("//") && !trimmed.startsWith("/*") && !trimmed.startsWith("*")) {
        if (trimmed.endsWith(";")) semiCount++;
        else if (trimmed.endsWith("}") || trimmed.endsWith("{")) {
          // ignore braces
        } else {
          nonSemiCount++;
        }
      }
    }
  }

  let indentation: "spaces_2" | "spaces_4" | "tabs" = "spaces_2";
  if (tabCount > space2Count && tabCount > space4Count) {
    indentation = "tabs";
  } else if (space4Count > space2Count) {
    indentation = "spaces_4";
  }

  const quotes = singleQuoteCount >= doubleQuoteCount ? "single" : "double";
  const semicolons = semiCount >= nonSemiCount;

  return {
    indentation,
    quotes,
    semicolons,
    docstringStyle: "jsdoc",
    extractedFromFilesCount: samples.filter(s => !isIgnoredPath(s.path)).length
  };
}

export interface DiffPlan {
  targetFile: string;
  originalSnippet: string;
  proposedSnippet: string;
}

/**
 * Gatekeeper for applying proposed diffs. Strictly rejects automatic writes without user confirmation.
 */
export function applyProposedDiff(
  userConfirmed: boolean,
  plan: DiffPlan
): { applied: boolean; reason: string } {
  if (!userConfirmed) {
    return {
      applied: false,
      reason: "Safety restriction: Proposed diff rejected. Explicit user confirmation is required."
    };
  }

  if (!plan.targetFile || isIgnoredPath(plan.targetFile)) {
    return {
      applied: false,
      reason: "Safety restriction: Cannot apply diff to ignored or sensitive file."
    };
  }

  return {
    applied: true,
    reason: `Diff successfully verified and approved for application to ${plan.targetFile}.`
  };
}
