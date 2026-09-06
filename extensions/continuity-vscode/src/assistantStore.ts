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
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
}

export interface AssistantPersistedState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  styleProfile: StyleProfile | null;
}

const STORAGE_KEY = "offline_code_assistant_state";

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
