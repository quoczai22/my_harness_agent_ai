import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
} from "node:path";
import { discoverAntigravityInstallation } from "./antigravityAdapter.js";

export type ProviderId = "codex" | "antigravity" | "ollama";
export type ProviderStatus =
  | "available"
  | "authentication_required"
  | "offline"
  | "not_installed";
export type OrchestrationMode =
  | "auto"
  | "codex"
  | "antigravity"
  | "ollama"
  | "parallel"
  | "codex_writes_antigravity_reviews"
  | "antigravity_writes_codex_reviews";

export interface ProjectFileEntry {
  path: string;
  name: string;
  extension: string;
  size: number;
  depth: number;
  language: string;
}

export interface ProjectIndex {
  rootName: string;
  files: ProjectFileEntry[];
  technologies: string[];
  totalFiles: number;
  truncated: boolean;
  ignoredCount: number;
  generatedAt: string;
}

export interface FileRelationship {
  source: string;
  target: string;
  kind: "import" | "reference";
}

export interface ProviderState {
  id: ProviderId;
  name: string;
  status: ProviderStatus;
  detail: string;
  executable?: string;
}

export interface HarnessSession {
  id: string;
  workspaceId: string;
  title: string;
  mode: OrchestrationMode;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  messages?: HarnessMessage[];
  providerConversations?: Partial<Record<ProviderId, string>>;
  proposals?: HarnessProposal[];
  /** Claude Code session id used by the main chat (resumed with --resume). */
  claudeSessionId?: string;
}

export interface HarnessMessage {
  id: string;
  role: "user" | "assistant" | "system";
  provider?: ProviderId | "claude";
  content: string;
  createdAt: string;
  usage?: Record<string, number>;
  error?: string;
}

export interface HarnessProposal {
  id: string;
  provider: ProviderId;
  path: string;
  summary: string;
  original?: string;
  replacement?: string;
  createdAt: string;
}

export interface ProjectFlowNode {
  id: string;
  label: string;
  path: string;
  language: string;
  group: string;
}

export interface ProjectFlow {
  nodes: ProjectFlowNode[];
  edges: FileRelationship[];
  totalFiles: number;
  truncatedNodes: boolean;
  truncatedEdges: boolean;
}

export interface ContextPacket {
  workspaceId: string;
  projectName: string;
  prompt: string;
  mode: OrchestrationMode;
  technologies: string[];
  instructions: Array<{ path: string; content: string }>;
  files: Array<{ path: string; content: string; truncated: boolean }>;
  budget: { usedCharacters: number; maximumCharacters: number };
}

const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".vs",
  ".idea",
  ".vscode-test",
  "node_modules",
  "vendor",
  "bin",
  "obj",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".cache",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".venv",
  "venv",
]);

const SECRET_FILE_PATTERNS = [
  /^\.env(?:\..+)?$/i,
  /^credentials?(?:\..+)?$/i,
  /^secrets?(?:\..+)?$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i,
  /\.p(?:em|fx|12)$/i,
  /\.key$/i,
  /service[-_.]?account.*\.json$/i,
  /appsettings\..*secret.*\.json$/i,
];

const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".cshtml",
  ".css",
  ".dart",
  ".fs",
  ".fsx",
  ".go",
  ".h",
  ".hpp",
  ".htm",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".kts",
  ".lua",
  ".md",
  ".php",
  ".props",
  ".ps1",
  ".py",
  ".rb",
  ".rs",
  ".scss",
  ".sh",
  ".sln",
  ".sql",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vb",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
  ".csproj",
  ".fsproj",
  ".vbproj",
]);

const TEXT_FILENAMES = new Set([
  "agents.md",
  "claude.md",
  "gemini.md",
  "dockerfile",
  "makefile",
  "readme",
  "license",
  ".gitignore",
  ".editorconfig",
]);

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".cs": "C#",
  ".cshtml": "Razor",
  ".css": "CSS",
  ".go": "Go",
  ".html": "HTML",
  ".java": "Java",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".json": "JSON",
  ".kt": "Kotlin",
  ".md": "Markdown",
  ".php": "PHP",
  ".ps1": "PowerShell",
  ".py": "Python",
  ".rb": "Ruby",
  ".rs": "Rust",
  ".sql": "SQL",
  ".swift": "Swift",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".vue": "Vue",
  ".xml": "XML",
  ".yaml": "YAML",
  ".yml": "YAML",
};

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function isContained(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function shouldIgnoreProjectPath(
  relativePath: string,
  isDirectory = false,
): boolean {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some((segment) => IGNORED_DIRECTORY_NAMES.has(segment))) {
    return true;
  }
  const name = segments.at(-1) ?? "";
  if (!isDirectory && SECRET_FILE_PATTERNS.some((pattern) => pattern.test(name))) {
    return true;
  }
  return false;
}

function isSupportedTextFile(relativePath: string): boolean {
  const name = basename(relativePath).toLowerCase();
  const extension = extname(name).toLowerCase();
  return TEXT_EXTENSIONS.has(extension) || TEXT_FILENAMES.has(name);
}

function languageFor(relativePath: string): string {
  const name = basename(relativePath).toLowerCase();
  const extension = extname(name).toLowerCase();
  if (LANGUAGE_BY_EXTENSION[extension]) return LANGUAGE_BY_EXTENSION[extension];
  if (name === "dockerfile") return "Dockerfile";
  if (name.endsWith("makefile")) return "Makefile";
  return "Text";
}

export function detectProjectTechnologies(files: ProjectFileEntry[]): string[] {
  const paths = new Set(files.map((file) => file.path.toLowerCase()));
  const extensions = new Set(files.map((file) => file.extension));
  const detected = new Set<string>();

  if ([...paths].some((path) => path.endsWith(".csproj"))) detected.add(".NET");
  if (extensions.has(".cshtml")) detected.add("Razor");
  if (extensions.has(".cs")) detected.add("C#");
  if (extensions.has(".py")) detected.add("Python");
  if (extensions.has(".rs")) detected.add("Rust");
  if (extensions.has(".go")) detected.add("Go");
  if (extensions.has(".java")) detected.add("Java");
  if (paths.has("package.json")) detected.add("Node.js");
  if (extensions.has(".ts") || extensions.has(".tsx")) detected.add("TypeScript");
  if (extensions.has(".jsx") || extensions.has(".tsx")) detected.add("React");
  if (paths.has("dockerfile") || paths.has("docker-compose.yml")) detected.add("Docker");
  if (extensions.has(".sql")) detected.add("SQL");

  return [...detected].sort((a, b) => a.localeCompare(b));
}

export function buildProjectIndex(
  workspaceRoot: string,
  options: { maxFiles?: number; maxDepth?: number; maxFileBytes?: number } = {},
): ProjectIndex {
  const root = realpathSync(resolve(workspaceRoot));
  const maxFiles = Math.min(Math.max(options.maxFiles ?? 1500, 1), 5000);
  const maxDepth = Math.min(Math.max(options.maxDepth ?? 12, 1), 30);
  const maxFileBytes = Math.min(
    Math.max(options.maxFileBytes ?? 1_000_000, 1024),
    5_000_000,
  );
  const files: ProjectFileEntry[] = [];
  let ignoredCount = 0;
  let truncated = false;

  const visit = (directory: string, depth: number) => {
    if (depth > maxDepth || files.length >= maxFiles) {
      truncated = true;
      return;
    }
    const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      if (files.length >= maxFiles) {
        truncated = true;
        break;
      }
      const absolute = join(directory, entry.name);
      const rel = normalizeRelativePath(relative(root, absolute));
      if (entry.isSymbolicLink() || shouldIgnoreProjectPath(rel, entry.isDirectory())) {
        ignoredCount++;
        continue;
      }
      if (entry.isDirectory()) {
        visit(absolute, depth + 1);
        continue;
      }
      if (!entry.isFile() || !isSupportedTextFile(rel)) {
        ignoredCount++;
        continue;
      }
      const size = statSync(absolute).size;
      if (size > maxFileBytes) {
        ignoredCount++;
        continue;
      }
      const extension = extname(entry.name).toLowerCase();
      files.push({
        path: rel,
        name: entry.name,
        extension,
        size,
        depth: rel.split("/").length - 1,
        language: languageFor(rel),
      });
    }
  };

  visit(root, 0);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return {
    rootName: basename(root),
    files,
    technologies: detectProjectTechnologies(files),
    totalFiles: files.length,
    truncated,
    ignoredCount,
    generatedAt: new Date().toISOString(),
  };
}

export function readSafeProjectFile(
  workspaceRoot: string,
  relativePath: string,
  maxBytes = 500_000,
): { path: string; content: string; truncated: boolean; language: string } {
  const root = realpathSync(resolve(workspaceRoot));
  const normalized = normalizeRelativePath(relativePath);
  if (
    !normalized ||
    isAbsolute(relativePath) ||
    normalized.split("/").includes("..") ||
    shouldIgnoreProjectPath(normalized) ||
    !isSupportedTextFile(normalized)
  ) {
    throw new Error("UNSAFE_PATH");
  }
  const target = resolve(root, normalized);
  if (!isContained(root, target) || !existsSync(target)) {
    throw new Error("UNSAFE_PATH");
  }
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("UNSAFE_PATH");
  const realTarget = realpathSync(target);
  if (!isContained(root, realTarget)) throw new Error("UNSAFE_PATH");

  const limit = Math.min(Math.max(maxBytes, 1024), 1_000_000);
  const buffer = readFileSync(realTarget);
  const truncated = buffer.length > limit;
  return {
    path: normalized,
    content: buffer.subarray(0, limit).toString("utf8"),
    truncated,
    language: languageFor(normalized),
  };
}

export function extractFileRelationships(
  workspaceRoot: string,
  sourcePath: string,
  index?: ProjectIndex,
): FileRelationship[] {
  const projectIndex = index ?? buildProjectIndex(workspaceRoot);
  const source = readSafeProjectFile(workspaceRoot, sourcePath, 250_000);
  const sourceDir = dirname(source.path).replace(/\\/g, "/");
  const candidates = new Map<string, string>();
  for (const file of projectIndex.files) {
    candidates.set(file.path.toLowerCase(), file.path);
    candidates.set(basename(file.path).toLowerCase(), file.path);
    candidates.set(file.path.replace(/\.[^.]+$/, "").toLowerCase(), file.path);
  }

  const references = new Set<string>();
  const patterns = [
    /(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g,
    /(?:src|href)=["']([^"'#?]+)["']/g,
    /<ProjectReference\s+Include=["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.content.matchAll(pattern)) references.add(match[1]);
  }

  const relationships: FileRelationship[] = [];
  for (const reference of references) {
    if (!reference.startsWith(".") && !reference.includes("/")) continue;
    const joined = normalizeRelativePath(
      posix.normalize(posix.join(sourceDir === "." ? "" : sourceDir, reference)),
    );
    const keys = [
      joined.toLowerCase(),
      `${joined}.ts`.toLowerCase(),
      `${joined}.tsx`.toLowerCase(),
      `${joined}.js`.toLowerCase(),
      `${joined}.jsx`.toLowerCase(),
      `${joined}.cshtml`.toLowerCase(),
      basename(joined).toLowerCase(),
    ];
    const target = keys.map((key) => candidates.get(key)).find(Boolean);
    if (target && target !== source.path) {
      relationships.push({ source: source.path, target, kind: "import" });
    }
  }
  return relationships.sort((a, b) => a.target.localeCompare(b.target));
}

export function buildProjectFlow(
  workspaceRoot: string,
  options: { maxNodes?: number; maxEdges?: number } = {},
): ProjectFlow {
  const index = buildProjectIndex(workspaceRoot);
  const maxNodes = Math.min(Math.max(options.maxNodes ?? 48, 8), 120);
  const maxEdges = Math.min(Math.max(options.maxEdges ?? 96, 8), 300);
  const ranked = [...index.files].sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.path.localeCompare(b.path);
  });
  const selected = ranked.slice(0, maxNodes);
  const selectedPaths = new Set(selected.map((file) => file.path));
  const edges: FileRelationship[] = [];
  let truncatedEdges = false;
  for (const file of selected) {
    if (edges.length >= maxEdges) {
      truncatedEdges = true;
      break;
    }
    let relationships: FileRelationship[] = [];
    try {
      relationships = extractFileRelationships(workspaceRoot, file.path, index);
    } catch {}
    for (const relationship of relationships) {
      if (!selectedPaths.has(relationship.target)) continue;
      if (edges.length >= maxEdges) {
        truncatedEdges = true;
        break;
      }
      if (!edges.some((edge) => edge.source === relationship.source && edge.target === relationship.target)) {
        edges.push(relationship);
      }
    }
  }
  return {
    nodes: selected.map((file) => ({
      id: file.path,
      label: file.name,
      path: file.path,
      language: file.language,
      group: file.path.includes("/") ? file.path.split("/")[0] : "root",
    })),
    edges,
    totalFiles: index.totalFiles,
    truncatedNodes: index.totalFiles > selected.length || index.truncated,
    truncatedEdges,
  };
}

function sessionStorePath(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), ".continuity", "harness", "sessions.json");
}

export function loadHarnessSessions(
  workspaceRoot: string,
  workspaceId: string,
): HarnessSession[] {
  const path = sessionStorePath(workspaceRoot);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (item): item is HarnessSession =>
        item &&
        typeof item.id === "string" &&
        item.workspaceId === workspaceId &&
        typeof item.title === "string",
    );
  } catch {
    return [];
  }
}

export function createHarnessSession(
  workspaceRoot: string,
  workspaceId: string,
  title: string,
  mode: OrchestrationMode = "auto",
): HarnessSession {
  const safeTitle = title.trim().slice(0, 120) || "New session";
  const allowedModes = new Set<OrchestrationMode>([
    "auto",
    "codex",
    "antigravity",
    "ollama",
    "parallel",
    "codex_writes_antigravity_reviews",
    "antigravity_writes_codex_reviews",
  ]);
  if (!allowedModes.has(mode)) throw new Error("INVALID_MODE");
  const now = new Date().toISOString();
  const session: HarnessSession = {
    id: randomUUID(),
    workspaceId,
    title: safeTitle,
    mode,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    messages: [],
    providerConversations: {},
    proposals: [],
  };
  const storePath = sessionStorePath(workspaceRoot);
  mkdirSync(dirname(storePath), { recursive: true });
  const existing = loadHarnessSessions(workspaceRoot, workspaceId);
  writeFileSync(storePath, JSON.stringify([...existing, session], null, 2), "utf8");
  return session;
}

export function updateHarnessSession(
  workspaceRoot: string,
  workspaceId: string,
  sessionId: string,
  update: (session: HarnessSession) => HarnessSession,
): HarnessSession {
  const sessions = loadHarnessSessions(workspaceRoot, workspaceId);
  const index = sessions.findIndex((session) => session.id === sessionId);
  if (index < 0) throw new Error("SESSION_NOT_FOUND");
  const next = update({ ...sessions[index] });
  next.workspaceId = workspaceId;
  next.id = sessionId;
  next.updatedAt = new Date().toISOString();
  next.messages = Array.isArray(next.messages) ? next.messages.slice(-200) : [];
  next.proposals = Array.isArray(next.proposals) ? next.proposals.slice(-100) : [];
  next.messageCount = next.messages.length;
  sessions[index] = next;
  const storePath = sessionStorePath(workspaceRoot);
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, JSON.stringify(sessions, null, 2), "utf8");
  return next;
}

export function buildContextPacket(
  workspaceRoot: string,
  workspaceId: string,
  input: {
    prompt: string;
    selectedPaths?: string[];
    mode?: OrchestrationMode;
    maxCharacters?: number;
  },
): ContextPacket {
  const maxCharacters = Math.min(
    Math.max(input.maxCharacters ?? 60_000, 4_000),
    200_000,
  );
  const index = buildProjectIndex(workspaceRoot);
  const normalizedPrompt = input.prompt.slice(0, Math.min(20_000, maxCharacters));
  const instructions: Array<{ path: string; content: string }> = [];
  const files: Array<{ path: string; content: string; truncated: boolean }> = [];
  let usedCharacters = normalizedPrompt.length;

  const instructionCandidates = [
    "AGENTS.md",
    "README.md",
    "CLAUDE.md",
    "GEMINI.md",
    ".github/copilot-instructions.md",
  ];
  for (const path of instructionCandidates) {
    if (!index.files.some((file) => file.path.toLowerCase() === path.toLowerCase())) continue;
    const remaining = maxCharacters - usedCharacters;
    if (remaining <= 0) break;
    const file = readSafeProjectFile(workspaceRoot, path, remaining);
    instructions.push({ path: file.path, content: file.content });
    usedCharacters += file.content.length;
  }

  for (const path of [...new Set(input.selectedPaths ?? [])]) {
    const remaining = maxCharacters - usedCharacters;
    if (remaining <= 0) break;
    const file = readSafeProjectFile(workspaceRoot, path, remaining);
    files.push({ path: file.path, content: file.content, truncated: file.truncated });
    usedCharacters += file.content.length;
  }

  return {
    workspaceId,
    projectName: index.rootName,
    prompt: normalizedPrompt,
    mode: input.mode ?? "auto",
    technologies: index.technologies,
    instructions,
    files,
    budget: { usedCharacters, maximumCharacters: maxCharacters },
  };
}

function findExecutable(command: string): string | undefined {
  try {
    const locator = process.platform === "win32" ? "where.exe" : "which";
    return execFileSync(locator, [command], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1500,
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
  } catch {
    return undefined;
  }
}

function checkAuthenticated(executable: string, args: string[]): boolean {
  try {
    execFileSync(executable, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2500,
    });
    return true;
  } catch {
    return false;
  }
}

export async function discoverProviderStates(): Promise<ProviderState[]> {
  const codex = findExecutable("codex");
  const antigravity = discoverAntigravityInstallation();
  const ollama = findExecutable("ollama");

  let ollamaOnline = false;
  if (ollama) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 900);
    try {
      const response = await fetch("http://127.0.0.1:11434/api/tags", {
        signal: controller.signal,
      });
      ollamaOnline = response.ok;
    } catch {
      ollamaOnline = false;
    } finally {
      clearTimeout(timer);
    }
  }

  const codexAuthenticated = codex
    ? checkAuthenticated(codex, ["login", "status"])
    : false;
  return [
    {
      id: "codex",
      name: "Codex",
      status: !codex
        ? "not_installed"
        : codexAuthenticated
          ? "available"
          : "authentication_required",
      detail: !codex
        ? "Codex CLI was not found on PATH"
        : codexAuthenticated
          ? "Installed and authenticated"
          : "Installed; sign-in could not be verified",
      executable: codex,
    },
    {
      id: "antigravity",
      name: "Antigravity",
      status: antigravity ? "available" : "not_installed",
      detail: !antigravity
        ? "Official agy CLI was not found"
        : `agy ${antigravity.version} installed; authentication is verified only on explicit use`,
      executable: antigravity?.executable,
    },
    {
      id: "ollama",
      name: "Ollama",
      status: !ollama ? "not_installed" : ollamaOnline ? "available" : "offline",
      detail: !ollama
        ? "Ollama was not found on PATH"
        : ollamaOnline
          ? "Local service is responding"
          : "Installed, but the local service is not responding",
      executable: ollama,
    },
  ];
}
