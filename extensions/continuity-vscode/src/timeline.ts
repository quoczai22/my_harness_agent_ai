export interface ContinuityCheckpoint {
  id?: string;
  type?: string;
  status?: string;
  payload?: string;
  reasoning?: string;
  createdAt?: string;
  decidedAt?: string;
}

export interface ContinuityDecision {
  timestamp?: string;
  actor?: string;
  decision?: string;
  reasoning?: string;
}

export interface ContinuityState {
  stage?: string;
  currentChangeId?: string | null;
  tasks?: Array<{ id?: string; description?: string; status?: string }>;
  blockers?: string[];
  checkpoints?: ContinuityCheckpoint[];
  decisions?: ContinuityDecision[];
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  title: string;
  description: string;
}

export function extractTimeline(state: ContinuityState | undefined, limit = 20): TimelineEvent[] {
  if (!state) return [];
  const events: TimelineEvent[] = [];
  for (const checkpoint of state.checkpoints ?? []) {
    if (checkpoint.createdAt) events.push({ id: `${checkpoint.id ?? "checkpoint"}-requested`, timestamp: checkpoint.createdAt, title: `Requested: ${checkpoint.type ?? "checkpoint"}`, description: String(checkpoint.payload ?? "") });
    if (checkpoint.decidedAt) events.push({ id: `${checkpoint.id ?? "checkpoint"}-decided`, timestamp: checkpoint.decidedAt, title: `Decision: ${checkpoint.status ?? "unknown"}`, description: String(checkpoint.reasoning ?? "") });
  }
  (state.decisions ?? []).forEach((decision, index) => {
    if (decision.timestamp) events.push({ id: `decision-${decision.timestamp}-${index}`, timestamp: decision.timestamp, title: String(decision.decision ?? "Decision"), description: String(decision.reasoning ?? "") });
  });
  return events.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.id.localeCompare(b.id)).slice(0, Math.min(Math.max(limit, 1), 50));
}

export function createOllamaSummaryPayload(state: ContinuityState | undefined): string {
  const timeline = extractTimeline(state, 5).map(({ timestamp, title }) => ({ timestamp, title }));
  return JSON.stringify({ stage: state?.stage ?? "IDLE", currentChangeId: state?.currentChangeId ?? null, taskCount: state?.tasks?.length ?? 0, blockers: (state?.blockers ?? []).slice(0, 10), recentEvents: timeline });
}