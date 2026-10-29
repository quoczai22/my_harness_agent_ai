import { extractStyleProfile, StyleProfile } from "./assistant";

export interface MementoLike {
  get<T>(key: string): T | undefined;
  update(key: string, value: any): Promise<void> | void | any;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant" | "system";
  text: string;
  timestamp: string;
  diffSnippet?: string;
  targetFile?: string;
  retrievedFiles?: string[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
  pendingAgentTask?: string;
}

export interface AssistantPersistedState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  styleProfile: StyleProfile | null;
}

const STORAGE_KEY = "offline_code_assistant_state";
const MAX_PORTABLE_SESSION_BYTES = 1_000_000;

export function parsePortableSessions(bytes: Uint8Array): ChatSession[] {
  if (bytes.byteLength > MAX_PORTABLE_SESSION_BYTES) throw new Error("Session export exceeds 1 MB.");
  let document: unknown;
  try { document = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error("Invalid session JSON."); }
  const value = document as { schema?: unknown; sessions?: unknown };
  if (!value || value.schema !== 1 || !Array.isArray(value.sessions) || value.sessions.length > 100) throw new Error("Unsupported session export format.");
  for (const session of value.sessions) {
    if (!session || typeof session.id !== "string" || typeof session.title !== "string" || typeof session.createdAt !== "string" || !Array.isArray(session.messages) || session.messages.length > 500) throw new Error("Invalid session data.");
    if (session.pendingAgentTask !== undefined && (typeof session.pendingAgentTask !== "string" || session.pendingAgentTask.length > 12_000)) throw new Error("Invalid pending agent task.");
    for (const message of session.messages) {
      if (!message || typeof message.id !== "string" || !["user", "assistant", "system"].includes(message.sender) || typeof message.text !== "string" || typeof message.timestamp !== "string") throw new Error("Invalid session message.");
    }
  }
  return value.sessions as ChatSession[];
}

export class AssistantStore {
  constructor(private readonly memento: MementoLike) {}

  getState(): AssistantPersistedState {
    const raw = this.memento.get<AssistantPersistedState>(STORAGE_KEY);
    return raw ?? {
      sessions: [],
      activeSessionId: null,
      styleProfile: null
    };
  }

  private async saveState(state: AssistantPersistedState): Promise<void> {
    await this.memento.update(STORAGE_KEY, state);
  }

  exportSessions(): Uint8Array {
    const bytes = new TextEncoder().encode(JSON.stringify({ schema: 1, sessions: this.getState().sessions }));
    if (bytes.byteLength > MAX_PORTABLE_SESSION_BYTES) throw new Error("Sessions exceed the 1 MB portable export limit.");
    return bytes;
  }

  async importSessions(sessions: ChatSession[], mode: "merge" | "replace"): Promise<void> {
    const state = this.getState();
    const merged = mode === "replace" ? sessions : [...state.sessions, ...sessions.filter(item => !state.sessions.some(existing => existing.id === item.id))];
    if (merged.length > 100) throw new Error("Import would exceed 100 sessions.");
    state.sessions = merged;
    state.activeSessionId = merged[0]?.id ?? null;
    await this.saveState(state);
  }

  async createSession(title = "New Chat"): Promise<ChatSession> {
    const state = this.getState();
    const session: ChatSession = {
      id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      createdAt: new Date().toISOString(),
      messages: []
    };
    state.sessions.unshift(session);
    state.activeSessionId = session.id;
    await this.saveState(state);
    return session;
  }

  async selectSession(sessionId: string): Promise<void> {
    const state = this.getState();
    if (!state.sessions.some(session => session.id === sessionId)) throw new Error(`Session '${sessionId}' not found.`);
    state.activeSessionId = sessionId;
    await this.saveState(state);
  }

  async setPendingAgentTask(sessionId: string, task: string | undefined): Promise<void> {
    const state = this.getState();
    const session = state.sessions.find(item => item.id === sessionId);
    if (!session) throw new Error(`Session '${sessionId}' not found.`);
    if (task) session.pendingAgentTask = task.slice(0, 12_000);
    else delete session.pendingAgentTask;
    await this.saveState(state);
  }

  getBoundedConversation(sessionId: string, maxChars = 12_000): string {
    const session = this.getState().sessions.find(item => item.id === sessionId);
    if (!session) return "";
    const lines = session.messages.filter(message => message.sender === "user" || message.sender === "assistant").map(message => `${message.sender === "user" ? "User" : "Assistant"}: ${message.text}`);
    const text = lines.join("\n\n");
    return text.length <= maxChars ? text : `[Earlier messages omitted]\n${text.slice(-maxChars)}`;
  }
  async deleteSession(sessionId: string): Promise<void> {
    const state = this.getState();
    state.sessions = state.sessions.filter(s => s.id !== sessionId);
    if (state.activeSessionId === sessionId) {
      state.activeSessionId = state.sessions[0]?.id ?? null;
    }
    await this.saveState(state);
  }

  async clearAllSessions(): Promise<void> {
    const state = this.getState();
    state.sessions = [];
    state.activeSessionId = null;
    await this.saveState(state);
  }

  async addMessage(sessionId: string, message: Omit<ChatMessage, "id" | "timestamp">): Promise<ChatMessage> {
    const state = this.getState();
    const session = state.sessions.find(s => s.id === sessionId);
    if (!session) throw new Error(`Session '${sessionId}' not found.`);

    const fullMessage: ChatMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString()
    };

    session.messages.push(fullMessage);
    await this.saveState(state);
    return fullMessage;
  }

  async rebuildStyleProfile(files: { path: string; content: string }[]): Promise<StyleProfile> {
    const state = this.getState();
    const profile = extractStyleProfile(files);
    state.styleProfile = profile;
    await this.saveState(state);
    return profile;
  }

  async resetStyleProfile(): Promise<void> {
    const state = this.getState();
    state.styleProfile = null;
    await this.saveState(state);
  }
}
