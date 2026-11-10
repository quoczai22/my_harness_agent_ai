import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HarnessSession, WorkspaceSummary } from "./types.js";

type StageKind = "context" | "agent" | "command" | "gate" | "human" | "commit";
interface Stage { id: string; kind: StageKind; label?: string; agent?: string; role?: string; command?: string; onPass?: string; onFail?: string }
interface Pipeline { id: string; name: string; maxRounds: number; stages: Stage[] }
interface StageResult { status: "waiting" | "running" | "passed" | "failed" | "skipped"; round: number; verdict?: string | null; exitCode?: number | null; issues?: string; outputTail?: string; at: string }
interface LoopTask { id: string; title: string; description: string; allowedFiles: string[]; acceptance: string[]; status: string; failedRounds: number; commit?: string; lastIssues?: string; source: string }
interface LoopRun { id: string; branch: string; status: string; currentTaskId?: string; currentStageId?: string; stageResults: Record<string, StageResult>; pipeline: Pipeline; error?: string; createdAt: string; doneTaskIds: string[] }
interface LoopEvent { seq: number; at: string; runId: string; type: string; taskId?: string; stageId?: string; agent?: string; data?: Record<string, any> }
interface Agent { id: string; name: string; status: string; detail: string }
interface LoopState { tasks: LoopTask[]; runs: LoopRun[]; activeRunId: string | null; pipeline: Pipeline; commands: { build?: string; test?: string } }

interface Props {
  workspaces: WorkspaceSummary[];
  workspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onWorkspacesChanged: (preferredId?: string) => Promise<void>;
  onError: (message: string) => void;
}

const AGENT_LABEL: Record<string, string> = { claude: "Claude Code", codex: "Codex", antigravity: "Antigravity", lmstudio: "LM Studio", ollama: "Ollama", build: "Build", test: "Test" };
const AGENT_GLYPH: Record<string, string> = { claude: "Cl", codex: "Cx", antigravity: "Ag", lmstudio: "LM", ollama: "Ol", command: ">_" };
const TASK_STATUS: Record<string, string> = { proposal: "chờ duyệt", queued: "trong hàng đợi", running: "đang chạy", passed: "xong", blocked: "bị chặn", canceled: "đã bỏ" };
const RUN_STATUS: Record<string, string> = { running: "đang chạy", paused: "tạm dừng", "waiting-human": "chờ bạn duyệt", blocked: "bị chặn", completed: "hoàn tất", canceled: "đã hủy", interrupted: "bị ngắt", failed: "lỗi" };
const AVAILABILITY: Record<string, string> = { available: "sẵn sàng", authentication_required: "cần đăng nhập", offline: "offline", "not installed": "chưa cài", not_installed: "chưa cài" };

async function postJson(url: string, body: unknown = {}): Promise<any> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Lỗi HTTP ${response.status}`);
  return data;
}

const stageWho = (stage: Stage) => stage.agent ?? (stage.kind === "command" ? stage.command : stage.kind);
const stageTitle = (stage: Stage) => stage.label ?? `${AGENT_LABEL[stageWho(stage) ?? ""] ?? stage.id}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString();

export const LoopWorkspace: React.FC<Props> = ({ workspaces, workspaceId, onSelectWorkspace, onWorkspacesChanged, onError }) => {
  const q = `?workspace=${encodeURIComponent(workspaceId)}`;
  const [sessions, setSessions] = useState<HarnessSession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [liveReply, setLiveReply] = useState("");
  const [liveTools, setLiveTools] = useState<string[]>([]);
  const [state, setState] = useState<LoopState | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [events, setEvents] = useState<LoopEvent[]>([]);
  const [selectedStage, setSelectedStage] = useState("");
  const [importMode, setImportMode] = useState<"" | "path" | "url">("");
  const [importValue, setImportValue] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", files: "", acceptance: "" });
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [commands, setCommands] = useState({ build: "", test: "" });
  const [pipelineText, setPipelineText] = useState("");
  const chatAbort = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const session = sessions.find((s) => s.id === sessionId);

  const loadSessions = useCallback(async (keep?: string) => {
    const data = await (await fetch(`/api/sessions${q}`)).json();
    const list: HarnessSession[] = (data.sessions ?? []).slice().sort((a: HarnessSession, b: HarnessSession) => b.updatedAt.localeCompare(a.updatedAt));
    setSessions(list);
    setSessionId((current) => keep ?? (list.some((s) => s.id === current) ? current : list[0]?.id ?? ""));
  }, [q]);

  const loadState = useCallback(async () => {
    const response = await fetch(`/api/loop/state${q}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Không đọc được trạng thái vòng lặp");
    setState(data);
    setSelectedRunId((current) => data.activeRunId ?? (data.runs.some((r: LoopRun) => r.id === current) ? current : data.runs[0]?.id ?? ""));
    return data as LoopState;
  }, [q]);

  const loadAgents = useCallback(async () => {
    const data = await (await fetch("/api/loop/agents")).json();
    setAgents(data.agents ?? []);
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    setEvents([]);
    setSelectedStage("");
    Promise.all([loadSessions(), loadState()]).then(([, s]) => {
      setCommands({ build: s.commands.build ?? "", test: s.commands.test ?? "" });
      setPipelineText(JSON.stringify(s.pipeline, null, 2));
    }).catch((e) => onError(e.message));
  }, [workspaceId, loadSessions, loadState, onError]);

  useEffect(() => {
    loadAgents().catch(() => undefined);
    const timer = setInterval(() => loadAgents().catch(() => undefined), 30_000);
    return () => clearInterval(timer);
  }, [loadAgents]);

  // Live events for the selected run; the state is reloaded on every step change.
  useEffect(() => {
    if (!workspaceId || !selectedRunId) return;
    setEvents([]);
    const source = new EventSource(`/api/loop/events${q}&run=${encodeURIComponent(selectedRunId)}`);
    let pending: ReturnType<typeof setTimeout> | undefined;
    source.onmessage = (message) => {
      const event: LoopEvent = JSON.parse(message.data);
      setEvents((current) => [...current.slice(-1500), event]);
      if (event.type !== "output") {
        clearTimeout(pending);
        pending = setTimeout(() => loadState().catch(() => undefined), 150);
      }
    };
    return () => { clearTimeout(pending); source.close(); };
  }, [workspaceId, selectedRunId, q, loadState]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events.length]);

  const run = state?.runs.find((r) => r.id === selectedRunId);
  const pipeline = run?.pipeline ?? state?.pipeline;
  const currentTask = state?.tasks.find((t) => t.id === run?.currentTaskId);
  const activeRun = Boolean(state?.activeRunId);

  // ---- actions ----

  const createSession = async () => {
    const title = window.prompt("Tên session", "Session mới");
    if (title === null) return;
    try {
      const data = await postJson(`/api/sessions${q}`, { title, mode: "auto" });
      await loadSessions(data.session.id);
    } catch (e: any) { onError(e.message); }
  };

  const sendChat = async (propose = false) => {
    if (!sessionId) return onError("Tạo hoặc chọn một session trước");
    const message = chatInput.trim();
    if (!propose && !message) return;
    setChatBusy(true);
    setLiveReply("");
    setLiveTools([]);
    if (!propose) setChatInput("");
    const controller = new AbortController();
    chatAbort.current = controller;
    try {
      const response = await fetch(`/api/loop/chat${q}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(propose ? { sessionId, propose: true } : { sessionId, message }), signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error((await response.json().catch(() => ({}))).error || "Claude Code không trả lời");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "text") setLiveReply((current) => (current ? `${current}\n\n` : "") + event.text);
          if (event.type === "tool") setLiveTools((current) => [...current, event.name]);
          if (event.type === "error") onError(`Claude Code: ${event.message}`);
          if (event.type === "done" && propose && event.proposals === 0) onError("Claude chưa trả về task nào hợp lệ. Hãy trao đổi rõ hơn rồi thử lại.");
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") onError(e.message);
    } finally {
      setChatBusy(false);
      setLiveReply("");
      setLiveTools([]);
      chatAbort.current = null;
      await Promise.all([loadSessions(sessionId), loadState()]).catch(() => undefined);
    }
  };

  const importRepo = async () => {
    if (!importValue.trim()) return onError(importMode === "url" ? "Nhập URL https:// của repo" : "Nhập đường dẫn tuyệt đối tới thư mục");
    setImportBusy(true);
    try {
      const data = importMode === "url"
        ? await postJson("/api/loop/import", { url: importValue.trim() })
        : await postJson("/api/workspaces/register", { path: importValue.trim() });
      setImportValue("");
      setImportMode("");
      await onWorkspacesChanged(data.workspace?.id);
    } catch (e: any) { onError(e.message); } finally { setImportBusy(false); }
  };

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); await loadState(); } catch (e: any) { onError(e.message); }
  };

  const addTask = () => act(async () => {
    if (!taskForm.title.trim()) throw new Error("Task cần có tiêu đề");
    await postJson(`/api/loop/tasks${q}`, { tasks: [{
      title: taskForm.title,
      allowedFiles: taskForm.files.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
      acceptance: taskForm.acceptance.split("\n").map((s) => s.trim()).filter(Boolean),
    }] });
    setTaskForm({ title: "", files: "", acceptance: "" });
    setShowTaskForm(false);
  });

  const setTaskStatus = (ids: string[], status: "queued" | "canceled") => act(() => postJson(`/api/loop/tasks/status${q}`, { ids, status }));
  const startRun = () => act(async () => { const data = await postJson(`/api/loop/runs${q}`); setSelectedRunId(data.run.id); });
  const runAction = (action: string) => act(() => postJson(`/api/loop/runs/action${q}`, { runId: selectedRunId, action }));
  const saveCommands = () => act(() => postJson(`/api/loop/commands${q}`, commands));
  const savePipeline = () => act(async () => {
    let parsed: unknown;
    try { parsed = JSON.parse(pipelineText); } catch { throw new Error("Pipeline không phải JSON hợp lệ"); }
    await postJson(`/api/loop/pipeline${q}`, { pipeline: parsed });
  });

  // ---- derived view data ----

  const agentActivity = useMemo(() => {
    const activity: Record<string, { doing?: string; last?: string; tone?: string }> = {};
    if (!run || !pipeline) return activity;
    for (const stage of pipeline.stages) {
      const who = stage.agent ?? (stage.kind === "gate" || stage.kind === "command" ? stage.command : undefined);
      if (!who) continue;
      const result = run.stageResults[stage.id];
      if (!result) continue;
      const entry = (activity[who] ??= {});
      if (result.status === "running" && (run.status === "running")) entry.doing = `${stageTitle(stage)} · vòng ${result.round}`;
      else if (result.status === "passed") { entry.last = `${stageTitle(stage)}: đạt${result.verdict ? ` (${result.verdict})` : ""}`; entry.tone = "pass"; }
      else if (result.status === "failed") { entry.last = `${stageTitle(stage)}: trượt vòng ${result.round}`; entry.tone = "fail"; }
      if (stage.kind === "gate" && stage.agent && result.status === "running" && run.status === "running") (activity[stage.agent] ??= {}).doing = `${stageTitle(stage)} · vòng ${result.round}`;
    }
    return activity;
  }, [run, pipeline]);

  const logLines = useMemo(() => {
    const lines: Array<{ key: string; at: string; who: string; text: string; tone: string }> = [];
    let buffer: { key: string; at: string; who: string; text: string; tone: string } | null = null;
    for (const event of events) {
      if (event.type === "output") {
        const who = event.agent ?? event.stageId ?? "";
        if (buffer && buffer.who === who) buffer.text += String(event.data?.text ?? "");
        else { buffer = { key: `o${event.seq}`, at: event.at, who, text: String(event.data?.text ?? ""), tone: "output" }; lines.push(buffer); }
        continue;
      }
      buffer = null;
      const d = event.data ?? {};
      const stage = pipeline?.stages.find((s) => s.id === event.stageId);
      const name = stage ? stageTitle(stage) : event.stageId ?? "";
      const text: Record<string, string> = {
        "run-started": `Bắt đầu run trên nhánh ${d.branch}${d.repoDirty ? " (repo gốc có thay đổi chưa commit: run dùng commit HEAD)" : ""}`,
        "task-started": `Task: ${d.title}`,
        "stage-started": `▶ ${name} · vòng ${d.round}`,
        "stage-finished": `${d.passed ? "✓" : "✗"} ${name}${d.verdict ? ` · VERDICT ${d.verdict}` : ""}${d.exitCode !== null && d.exitCode !== undefined ? ` · exit ${d.exitCode}` : ""}${!d.passed && d.issues ? `\n${d.issues}` : ""}`,
        round: `↺ Quay lại · đã trượt ${d.failedRounds}/${d.maxRounds} vòng`,
        commit: d.sha ? `Commit ${String(d.sha).slice(0, 10)} vào ${d.branch}` : "Không có gì để commit",
        "task-passed": "Task hoàn tất",
        "task-blocked": `Task bị chặn: ${d.reason}`,
        "waiting-human": `Chờ bạn duyệt ở bước ${name}`,
        paused: "Đã tạm dừng", resumed: "Tiếp tục",
        warning: `⚠ ${d.message}`,
        "run-finished": `Run kết thúc: ${RUN_STATUS[d.status] ?? d.status}${d.reason ? ` · ${d.reason}` : ""}`,
      };
      const tone = event.type === "stage-finished" ? (d.passed ? "pass" : "fail") : event.type === "task-blocked" || event.type === "warning" ? "warn" : "info";
      lines.push({ key: `e${event.seq}`, at: event.at, who: event.agent ?? "", text: text[event.type] ?? event.type, tone });
    }
    return lines.slice(-300);
  }, [events, pipeline]);

  const stageDetail = run && selectedStage ? run.stageResults[selectedStage] : undefined;
  const queued = state?.tasks.filter((t) => t.status === "queued").length ?? 0;
  const workspace = workspaces.find((w) => w.id === workspaceId);

  return (
    <section className="loop-grid">
      <aside className="lp-panel lp-left">
        <div className="lp-head"><span className="lp-eyebrow">Session</span><button className="lp-icon" onClick={createSession} aria-label="Tạo session">＋</button></div>
        <div className="lp-list">
          {sessions.length ? sessions.map((s) => (
            <button key={s.id} className={`lp-row ${s.id === sessionId ? "active" : ""}`} onClick={() => setSessionId(s.id)}>
              <strong>{s.title}</strong><small>{s.messageCount} tin nhắn · {new Date(s.updatedAt).toLocaleDateString()}</small>
            </button>
          )) : <p className="lp-empty">Tạo session đầu tiên để trò chuyện với Claude Code.</p>}
        </div>
        <div className="lp-head"><span className="lp-eyebrow">Repo</span><button className="lp-icon" onClick={() => setImportMode(importMode ? "" : "path")} aria-label="Import repo">＋</button></div>
        {importMode && (
          <div className="lp-import">
            <div className="lp-seg">
              <button className={importMode === "path" ? "active" : ""} onClick={() => setImportMode("path")}>Thư mục</button>
              <button className={importMode === "url" ? "active" : ""} onClick={() => setImportMode("url")}>Git URL</button>
            </div>
            <input value={importValue} onChange={(e) => setImportValue(e.target.value)} placeholder={importMode === "url" ? "https://github.com/ten/repo.git" : "/home/kami/projects/my-app"} onKeyDown={(e) => { if (e.key === "Enter") importRepo(); }} />
            <button className="lp-primary" onClick={importRepo} disabled={importBusy}>{importBusy ? "Đang import…" : importMode === "url" ? "Clone và thêm" : "Thêm repo"}</button>
          </div>
        )}
        <div className="lp-list">
          {workspaces.map((w) => (
            <button key={w.id} className={`lp-row ${w.id === workspaceId ? "active" : ""}`} onClick={() => onSelectWorkspace(w.id)} disabled={w.status !== "ACTIVE"} title={w.path}>
              <strong>{w.name}</strong><small>{w.status === "ACTIVE" ? w.path : "không truy cập được"}</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="lp-panel lp-chat">
        <div className="lp-head"><span className="lp-eyebrow">Chat với Claude Code · {workspace?.name ?? ""}</span><span className="lp-note">chỉ đọc, không sửa file</span></div>
        <div className="lp-messages" aria-live="polite">
          {session?.messages?.length || chatBusy ? (
            <>
              {(session?.messages ?? []).map((m) => (
                <article key={m.id} className={`lp-msg ${m.role === "user" ? "me" : "ai"} ${m.error ? "err" : ""}`}>
                  <div className="lp-msg-meta">{m.role === "user" ? "Bạn" : m.provider === "claude" ? "Claude Code" : m.provider ?? "Harness"} · {time(m.createdAt)}</div>
                  <p>{m.content.replace(/```json[\s\S]*?```/g, "[Danh sách task đã chuyển xuống ô Task để bạn duyệt]")}</p>
                </article>
              ))}
              {chatBusy && (
                <article className="lp-msg ai live">
                  <div className="lp-msg-meta">Claude Code · đang trả lời{liveTools.length ? ` · đã dùng ${[...new Set(liveTools)].join(", ")}` : ""}</div>
                  <p>{liveReply || "…"}</p>
                </article>
              )}
            </>
          ) : <p className="lp-empty">{session ? "Mô tả việc bạn muốn làm. Khi đã rõ, bấm “Chia thành task” để Claude đề xuất task cho vòng lặp." : "Chọn hoặc tạo một session."}</p>}
        </div>
        <div className="lp-composer">
          <textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} rows={3} placeholder="Nhắn cho Claude Code…" disabled={chatBusy || !session}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendChat(); }} />
          <div className="lp-actions">
            <button onClick={() => sendChat(true)} disabled={chatBusy || !session}>Chia thành task</button>
            {chatBusy ? <button className="lp-danger" onClick={() => chatAbort.current?.abort()}>Dừng</button>
              : <button className="lp-primary" onClick={() => sendChat()} disabled={!session || !chatInput.trim()}>Gửi</button>}
          </div>
        </div>
      </section>

      <aside className="lp-panel lp-agents">
        <div className="lp-head"><span className="lp-eyebrow">Các ô agent</span><button className="lp-icon" onClick={() => loadAgents()} aria-label="Kiểm tra lại">↻</button></div>
        {agents.map((agent) => {
          const activity = agentActivity[agent.id] ?? {};
          return (
            <article key={agent.id} className={`lp-agent ${activity.doing ? "busy" : ""}`}>
              <div className={`lp-glyph g-${agent.id}`}>{AGENT_GLYPH[agent.id] ?? agent.id.slice(0, 2)}</div>
              <div className="lp-agent-body">
                <strong>{agent.name}</strong>
                <small className={`lp-avail a-${agent.status.replace(/\s/g, "_")}`}>{AVAILABILITY[agent.status] ?? agent.status}</small>
                <small>{activity.doing ? `Đang làm: ${activity.doing}` : activity.last ?? agent.detail}</small>
              </div>
              {activity.doing ? <span className="lp-pulse" aria-label="đang chạy" /> : activity.tone ? <span className={`lp-dot ${activity.tone}`} /> : null}
            </article>
          );
        })}
        {(["build", "test"] as const).map((key) => {
          const activity = agentActivity[key] ?? {};
          return (
            <article key={key} className={`lp-agent ${activity.doing ? "busy" : ""}`}>
              <div className="lp-glyph g-command">&gt;_</div>
              <div className="lp-agent-body"><strong>{key === "build" ? "Lệnh build" : "Lệnh test"}</strong>
                <small className="lp-mono">{state?.commands[key] ?? "chưa đặt"}</small>
                {(activity.doing || activity.last) && <small>{activity.doing ? `Đang chạy: ${activity.doing}` : activity.last}</small>}</div>
              {activity.doing ? <span className="lp-pulse" /> : activity.tone ? <span className={`lp-dot ${activity.tone}`} /> : null}
            </article>
          );
        })}
      </aside>

      <section className="lp-panel lp-pipeline">
        <div className="lp-head">
          <span className="lp-eyebrow">
            Pipeline · {pipeline?.name ?? ""}
            {run && <> · run {RUN_STATUS[run.status] ?? run.status}</>}
            {currentTask && pipeline && <> · vòng {Math.min(currentTask.failedRounds + 1, pipeline.maxRounds)} / tối đa {pipeline.maxRounds}</>}
          </span>
          <div className="lp-actions">
            {state && state.runs.length > 0 && (
              <select value={selectedRunId} onChange={(e) => setSelectedRunId(e.target.value)} aria-label="Chọn run">
                {state.runs.map((r) => <option key={r.id} value={r.id}>{new Date(r.createdAt).toLocaleString()} · {RUN_STATUS[r.status] ?? r.status}</option>)}
              </select>
            )}
            {run?.status === "running" && <button onClick={() => runAction("pause")}>Tạm dừng</button>}
            {run && ["paused", "blocked", "interrupted", "failed"].includes(run.status) && <button onClick={() => runAction("resume")}>Tiếp tục</button>}
            {run?.status === "waiting-human" && <><button className="lp-primary" onClick={() => runAction("approve")}>Duyệt</button><button onClick={() => runAction("reject")}>Trả lại</button></>}
            {run && ["running", "paused", "waiting-human"].includes(run.status) && <button className="lp-danger" onClick={() => runAction("cancel")}>Hủy</button>}
            {!activeRun && <button className="lp-primary" onClick={startRun} disabled={!queued}>Chạy vòng lặp ({queued})</button>}
          </div>
        </div>

        {pipeline && (
          <div className="lp-stages" role="list">
            {pipeline.stages.map((stage, i) => {
              const result = run?.stageResults[stage.id];
              const status = result?.status ?? "waiting";
              const back = stage.onFail ? pipeline.stages.find((s) => s.id === stage.onFail) : undefined;
              return (
                <React.Fragment key={stage.id}>
                  <button role="listitem" className={`lp-stage s-${status} ${selectedStage === stage.id ? "selected" : ""} ${run?.currentStageId === stage.id && run.status !== "completed" ? "current" : ""}`} onClick={() => setSelectedStage(selectedStage === stage.id ? "" : stage.id)}>
                    <span className="lp-stage-who">{AGENT_LABEL[stageWho(stage) ?? ""] ?? stage.kind}</span>
                    <strong>{stageTitle(stage)}</strong>
                    <small>{status === "waiting" ? "chờ" : status === "running" ? `đang chạy · vòng ${result?.round}` : status === "passed" ? "đạt" : status === "failed" ? `trượt vòng ${result?.round}` : status}</small>
                    {back && <small className="lp-back">trượt → {stageTitle(back)}</small>}
                  </button>
                  {i < pipeline.stages.length - 1 && <span className="lp-arrow" aria-hidden="true">→</span>}
                </React.Fragment>
              );
            })}
          </div>
        )}
        {run?.error && <p className="lp-warn">{run.error}</p>}
        {stageDetail && (
          <div className="lp-detail">
            <strong>{pipeline?.stages.find((s) => s.id === selectedStage)?.label ?? selectedStage}</strong> · vòng {stageDetail.round}
            {stageDetail.verdict && <> · VERDICT {stageDetail.verdict}</>}
            {stageDetail.exitCode !== undefined && stageDetail.exitCode !== null && <> · exit {stageDetail.exitCode}</>}
            {stageDetail.issues && <pre className="lp-pre fail">{stageDetail.issues}</pre>}
            {stageDetail.outputTail && <pre className="lp-pre">{stageDetail.outputTail}</pre>}
          </div>
        )}

        <div className="lp-split">
          <div className="lp-tasks">
            <div className="lp-subhead"><span>Task</span><button onClick={() => setShowTaskForm(!showTaskForm)}>{showTaskForm ? "Đóng" : "＋ Thêm task"}</button></div>
            {showTaskForm && (
              <div className="lp-taskform">
                <input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="Tiêu đề task, ví dụ: Trang đăng nhập" />
                <input value={taskForm.files} onChange={(e) => setTaskForm({ ...taskForm, files: e.target.value })} placeholder="File được sửa, ví dụ: src/ui/**, src/styles.css (bỏ trống = không giới hạn)" />
                <textarea value={taskForm.acceptance} onChange={(e) => setTaskForm({ ...taskForm, acceptance: e.target.value })} rows={2} placeholder="Tiêu chí nghiệm thu, mỗi dòng một tiêu chí" />
                <button className="lp-primary" onClick={addTask}>Thêm vào hàng đợi</button>
              </div>
            )}
            {state?.tasks.length ? state.tasks.slice().reverse().map((task) => (
              <article key={task.id} className={`lp-task t-${task.status}`}>
                <div><strong>{task.title}</strong><span className="lp-chip">{TASK_STATUS[task.status] ?? task.status}</span>{task.source === "claude" && <span className="lp-chip ghost">Claude đề xuất</span>}</div>
                {task.allowedFiles.length > 0 && <small className="lp-mono">{task.allowedFiles.join(", ")}</small>}
                {task.acceptance.length > 0 && <small>{task.acceptance.join(" · ")}</small>}
                {task.status === "blocked" && task.lastIssues && <small className="lp-warn">{task.lastIssues}</small>}
                {task.commit && <small className="lp-mono">commit {task.commit.slice(0, 10)}</small>}
                <div className="lp-task-actions">
                  {task.status === "proposal" && <><button className="lp-primary" onClick={() => setTaskStatus([task.id], "queued")}>Duyệt</button><button onClick={() => setTaskStatus([task.id], "canceled")}>Bỏ</button></>}
                  {(task.status === "canceled" || task.status === "blocked") && !activeRun && <button onClick={() => setTaskStatus([task.id], "queued")}>Đưa lại hàng đợi</button>}
                  {task.status === "queued" && <button onClick={() => setTaskStatus([task.id], "canceled")}>Bỏ</button>}
                </div>
              </article>
            )) : <p className="lp-empty">Chưa có task. Trao đổi với Claude rồi bấm “Chia thành task”, hoặc thêm task bằng tay.</p>}
            {state?.tasks.some((t) => t.status === "proposal") && (
              <button className="lp-primary lp-wide" onClick={() => setTaskStatus(state.tasks.filter((t) => t.status === "proposal").map((t) => t.id), "queued")}>Duyệt tất cả đề xuất</button>
            )}
          </div>

          <div className="lp-log" ref={logRef} aria-live="polite">
            <div className="lp-subhead"><span>Nhật ký run</span>{run && <span className="lp-mono">{run.branch}</span>}</div>
            {logLines.length ? logLines.map((line) => (
              <div key={line.key} className={`lp-line l-${line.tone}`}>
                <time>{time(line.at)}</time>
                {line.who && <span className="lp-who">{AGENT_LABEL[line.who] ?? line.who}</span>}
                <pre>{line.tone === "output" ? line.text.slice(-4000) : line.text}</pre>
              </div>
            )) : <p className="lp-empty">Chưa có run nào. Duyệt task rồi bấm “Chạy vòng lặp”.</p>}
          </div>
        </div>

        <details className="lp-settings">
          <summary>Cài đặt pipeline và lệnh</summary>
          <div className="lp-settings-grid">
            <label>Lệnh build<input className="lp-mono" value={commands.build} onChange={(e) => setCommands({ ...commands, build: e.target.value })} placeholder="npm run build" /></label>
            <label>Lệnh test<input className="lp-mono" value={commands.test} onChange={(e) => setCommands({ ...commands, test: e.target.value })} placeholder="npm test" /></label>
            <button onClick={saveCommands}>Lưu lệnh</button>
          </div>
          <label className="lp-pipeline-edit">Pipeline (JSON)
            <textarea className="lp-mono" rows={12} value={pipelineText} onChange={(e) => setPipelineText(e.target.value)} spellCheck={false} />
          </label>
          <div className="lp-actions"><button onClick={savePipeline}>Lưu pipeline</button><span className="lp-note">Loại bước: context, agent, command, gate, human, commit. Agent: claude, codex, antigravity, lmstudio, ollama.</span></div>
        </details>
      </section>
    </section>
  );
};
