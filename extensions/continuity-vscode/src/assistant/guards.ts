import * as path from "node:path";

export const MAX_FILE_BYTES = 100 * 1024;
export const MAX_SELECTION_BYTES = 8 * 1024;
export const MAX_CONTEXT_BYTES = 24 * 1024;
const blockedSegment = new Set([".git", "node_modules", "dist"]);
const binaryExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".exe", ".dll", ".so", ".dylib", ".woff", ".woff2", ".ttf", ".mp3", ".mp4"]);
export function isIgnoredRelativePath(relativePath: string): boolean { const segments = relativePath.replace(/\\/g, "/").split("/"); const name = segments.at(-1)?.toLowerCase() ?? ""; return segments.some(segment => blockedSegment.has(segment)) || name.startsWith(".env") || binaryExtensions.has(path.extname(name)); }
export function isContained(root: string, candidate: string): boolean { const relative = path.relative(root, candidate); return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative) && !isIgnoredRelativePath(relative); }
export function limitUtf8(value: string, limit: number): string { const bytes = Buffer.from(value, "utf8"); return bytes.length <= limit ? value : bytes.subarray(0, limit).toString("utf8") + "\n/* context truncated */"; }