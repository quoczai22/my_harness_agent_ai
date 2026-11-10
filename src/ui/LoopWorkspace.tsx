import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HarnessSession, WorkspaceSummary } from "./types.js";

type StageKind = "context" | "agent" | "command" | "gate" | "human" | "commit";
interface Stage { id: string; kind: StageKind; label?: string; agent?: string; role?: string; command?: string; sources?: string[]; onPass?: string; onFail?: string }
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
const AGENT_GLYPH: Record<string, string> = { claude: "CC", codex: "CX", antigravity: "AG", lmstudio: "LM", ollama: "OL" };
const KIND_GLYPH: Record<StageKind, string> = { context: "DOC", agent: "AI", command: ">_", gate: "?", human: "YOU", commit: "GIT" };
const ROLE_LABEL: Record<string, string> = { implement: "Làm", test: "Kiểm thử", review: "Duyệt", plan: "Lập kế hoạch" };
const KIND_LABEL: Record<StageKind, string> = { context: "Tài liệu", agent: "Agent", command: "Lệnh", gate: "Cổng kiểm thử", human: "Bạn duyệt", commit: "Commit" };
const TASK_STATUS: Record<string, string> = { proposal: "chờ duyệt", queued: "trong hàng đợi", running: "đang chạy", passed: "xong", blocked: "bị chặn", canceled: "đã bỏ" };
const RUN_STATUS: Record<string, string> = { running: "Đang chạy", paused: "Tạm dừng", "waiting-human": "Chờ bạn duyệt", blocked: "Bị chặn", completed: "Hoàn tất", canceled: "Đã hủy", interrupted: "Bị ngắt", failed: "Lỗi" };
const AVAILABILITY: Record<string, string> = { available: "sẵn sàng", authentication_required: "cần đăng nhập", offline: "offline", "not installed": "chưa cài", not_installed: "chưa cài" };
const STAGE_STATUS: Record<string, string> = { waiting: "Chờ", running: "Đang chạy", passed: "Đạt", failed: "Trượt", skipped: "Bỏ qua" };
const CHAT_SUGGESTIONS = ["Tóm tắt repo này giúp mình", "Bước tiếp theo nên làm gì?"];

async function postJson(url: string, body: unknown = {}): Promise<any> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Lỗi HTTP ${response.status}`);
  return data;
}

const stageWho = (stage: Stage) => stage.agent ?? (stage.kind === "command" || stage.kind === "gate" ? stage.command : stage.kind);
const stageTitle = (stage: Stage) => stage.label ?? `${AGENT_LABEL[stageWho(stage) ?? ""] ?? stage.id}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString();
const firstLine = (text?: string) => (text ?? "").split("\n").find((line) => line.trim())?.trim() ?? "";
const statusTone = (status?: string) => status === "completed" ? "pass" : status === "running" ? "run" : status === "blocked" || status === "failed" ? "fail" : status === "waiting-human" || status === "paused" || status === "interrupted" ? "warn" : "idle";

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
  const [openStage, setOpenStage] = useState("");
  const [importMode, setImportMode] = useState<"" | "path" | "url">("");
  const [importValue, setImportValue] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", files: "", acceptance: "" });
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [commands, setCommands] = useState({ build: "", test: "" });
  const [pipelineText, setPipelineText] = useState("");
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const [newSource, setNewSource] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [repoSessions, setRepoSessions] = useState<Record<string, HarnessSession[]>>({});
  const [closedRepos, setClosedRepos] = useState<string[]>([]);
  const pendingSession = useRef<string | null>(null);
  const chatAbort = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const session = sessions.find((s) => s.id === sessionId);

  const fetchSessions = useCallback(async (id: string): Promise<HarnessSession[]> => {
    const data = await (await fetch(`/api/sessions?workspace=${encodeURIComponent(id)}`)).json();
    return (data.sessions ?? []).slice().sort((a: HarnessSession, b: HarnessSession) => b.updatedAt.localeCompare(a.updatedAt));
  }, []);

  const loadSessions = useCallback(async (keep?: string) => {
    const list = await fetchSessions(workspaceId);
    setSessions(list);
    setRepoSessions((current) => ({ ...current, [workspaceId]: list }));
    const wanted = keep ?? pendingSession.current ?? undefined;
    pendingSession.current = null;
    setSessionId((current) => wanted && list.some((s) => s.id === wanted) ? wanted : list.some((s) => s.id === current) ? current : list[0]?.id ?? "");
  }, [workspaceId, fetchSessions]);

  // Every repository's conversations, for the grouped sidebar.
  useEffect(() => {
    let alive = true;
    Promise.all(workspaces.filter((w) => w.status === "ACTIVE").map(async (w) => [w.id, await fetchSessions(w.id).catch(() => [])] as const))
      .then((entries) => { if (alive) setRepoSessions((current) => ({ ...current, ...Object.fromEntries(entries) })); });
    return () => { alive = false; };
  }, [workspaces, fetchSessions]);

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
    setOpenStage("");
    Promise.all([loadSessions(), loadState()]).then(([, s]) => {
      setCommands({ build: s.commands.build ?? "", test: s.commands.test ?? "" });
      setPipelineText(JSON.stringify(s.pipeline, null, 2));
    }).catch((e) => onError(e.message));
    fetch(`/api/project-index${q}`).then((r) => r.json()).then((data) => setProjectFiles((data.files ?? []).map((f: { path: string }) => f.path).slice(0, 2000))).catch(() => setProjectFiles([]));
  }, [workspaceId, q, loadSessions, loadState, onError]);

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

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [events.length]);
  useEffect(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; }, [session?.messages?.length, liveReply]);

  const run = state?.runs.find((r) => r.id === selectedRunId);
  const pipeline = run?.pipeline ?? state?.pipeline;
  const editablePipeline = state?.pipeline;
  const currentTask = state?.tasks.find((t) => t.id === run?.currentTaskId);
  const activeRun = Boolean(state?.activeRunId);
  const queued = state?.tasks.filter((t) => t.status === "queued").length ?? 0;
  const proposals = state?.tasks.filter((t) => t.status === "proposal") ?? [];
  const workspace = workspaces.find((w) => w.id === workspaceId);
  const agentById = (id?: string) => agents.find((a) => a.id === id);

  // ---- actions ----

  const selectSession = (repoId: string, id: string) => {
    if (repoId === workspaceId) return setSessionId(id);
    pendingSession.current = id;
    onSelectWorkspace(repoId);
  };

  const createSession = async (repoId = workspaceId) => {
    const repo = workspaces.find((w) => w.id === repoId);
    const title = window.prompt(`Tên cuộc trò chuyện mới trong ${repo?.name ?? "repo"}`, "Cuộc trò chuyện mới");
    if (title === null) return;
    try {
      const data = await postJson(`/api/sessions?workspace=${encodeURIComponent(repoId)}`, { title, mode: "auto" });
      setClosedRepos((current) => current.filter((id) => id !== repoId));
      if (repoId === workspaceId) await loadSessions(data.session.id);
      else selectSession(repoId, data.session.id);
    } catch (e: any) { onError(e.message); }
  };

  const sendChat = async (options: { propose?: boolean; text?: string } = {}) => {
    if (!sessionId) return onError("Tạo hoặc chọn một session trước");
    const message = (options.text ?? chatInput).trim();
    if (!options.propose && !message) return;
    setChatBusy(true);
    setLiveReply("");
    setLiveTools([]);
    if (!options.propose && options.text === undefined) setChatInput("");
    const controller = new AbortController();
    chatAbort.current = controller;
    try {
      const response = await fetch(`/api/loop/chat${q}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options.propose ? { sessionId, propose: true } : { sessionId, message }), signal: controller.signal,
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
          if (event.type === "done" && options.propose && event.proposals === 0) onError("Claude chưa trả về task nào hợp lệ. Hãy trao đổi rõ hơn rồi thử lại.");
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
  const savePipelineValue = (value: unknown) => act(async () => {
    const data = await postJson(`/api/loop/pipeline${q}`, { pipeline: value });
    setPipelineText(JSON.stringify(data.pipeline, null, 2));
  });
  const savePipeline = () => {
    let parsed: unknown;
    try { parsed = JSON.parse(pipelineText); } catch { return onError("Pipeline không phải JSON hợp lệ"); }
    return savePipelineValue(parsed);
  };

  const contextStage = editablePipeline?.stages.find((s) => s.kind === "context");
  const updateSources = (sources: string[]) => {
    if (!editablePipeline || !contextStage) return;
    savePipelineValue({ ...editablePipeline, stages: editablePipeline.stages.map((s) => (s.id === contextStage.id ? { ...s, sources } : s)) });
  };
  const addSource = () => {
    const value = newSource.trim();
    if (!value || !contextStage) return;
    if ((contextStage.sources ?? []).includes(value)) return setNewSource("");
    updateSources([...(contextStage.sources ?? []), value]);
    setNewSource("");
  };

  // ---- derived view data ----

  // The stage whose failure sent the run back; cleared once that stage runs again.
  const loopBack = useMemo(() => {
    let failed: string | null = null;
    for (const e of events) {
      if (e.type === "round") failed = e.stageId ?? null;
      else if (e.type === "stage-started" && e.stageId === failed) failed = null;
      else if (e.type === "task-started" || e.type === "run-finished") failed = null;
    }
    return failed;
  }, [events]);

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
      const tone = event.type === "stage-finished" ? (d.passed ? "pass" : "fail") : event.type === "task-blocked" || event.type === "warning" || event.type === "round" ? "warn" : "info";
      lines.push({ key: `e${event.seq}`, at: event.at, who: event.agent ?? "", text: text[event.type] ?? event.type, tone });
    }
    return lines.slice(-300);
  }, [events, pipeline]);

  const nodeDetail = (stage: Stage, result?: StageResult): string => {
    if (stage.kind === "context") return `${stage.sources?.length ?? 0} nguồn tài liệu + AGENTS.md, README.md`;
    if (stage.kind === "commit") return currentTask?.commit ? `commit ${currentTask.commit.slice(0, 10)}` : run ? `vào ${run.branch}` : "Harness commit vào nhánh riêng của run";
    if (stage.kind === "human") return run?.status === "waiting-human" && run.currentStageId === stage.id ? "Đang chờ bạn bấm Duyệt hoặc Trả lại" : "Dừng lại để bạn duyệt";
    if (result?.status === "failed") return firstLine(result.issues) || "Trượt";
    if (result?.status === "passed") return result.verdict ? `VERDICT ${result.verdict}` : "Hoàn thành";
    if (stage.kind === "gate") return `Lệnh: ${state?.commands[stage.command as "build" | "test"] ?? "chưa đặt"} + kết luận của ${AGENT_LABEL[stage.agent ?? ""] ?? stage.agent}`;
    if (stage.kind === "command") return `Lệnh: ${state?.commands[stage.command as "build" | "test"] ?? "chưa đặt"}`;
    const agent = agentById(stage.agent);
    return agent ? `${agent.name} · ${AVAILABILITY[agent.status] ?? agent.status}` : "";
  };

  const gate = pipeline?.stages.find((s) => s.kind === "gate");
  const pipelineAgents = new Set(pipeline?.stages.map((s) => s.agent).filter(Boolean));
  const otherAgents = agents.filter((a) => !pipelineAgents.has(a.id));
  const roundText = currentTask && pipeline && run && ["running", "paused", "waiting-human"].includes(run.status)
    ? `Vòng ${Math.min(currentTask.failedRounds + 1, pipeline.maxRounds)}/${pipeline.maxRounds}` : null;

  return (
    <section className={`lp2-grid ${collapsed ? "collapsed" : ""}`}>
      {/* Left: sessions and repositories */}
      <aside className="lp2-side">
        <div className="lp2-side-top">
          <button className="lp2-ghost lp2-icon" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"} title={collapsed ? "Mở rộng" : "Thu gọn"}>{collapsed ? "»" : "«"}</button>
          {!collapsed && <button className="lp2-new" onClick={() => createSession()} title={`Trong ${workspace?.name ?? "repo đang chọn"}`}>＋ Cuộc trò chuyện mới</button>}
        </div>
        {!collapsed && <>
          <div className="lp2-label lp2-label-row"><span>Repo và cuộc trò chuyện</span><button className="lp2-ghost lp2-icon" onClick={() => setImportMode(importMode ? "" : "path")} aria-label="Thêm repo" title="Thêm repo">＋</button></div>
          {importMode && (
            <div className="lp2-import">
              <div className="lp2-seg" role="tablist">
                <button role="tab" aria-selected={importMode === "path"} className={importMode === "path" ? "active" : ""} onClick={() => setImportMode("path")}>Thư mục</button>
                <button role="tab" aria-selected={importMode === "url"} className={importMode === "url" ? "active" : ""} onClick={() => setImportMode("url")}>Git URL</button>
              </div>
              <input value={importValue} onChange={(e) => setImportValue(e.target.value)} placeholder={importMode === "url" ? "https://github.com/ten/repo.git" : "/home/kami/projects/my-app"} onKeyDown={(e) => { if (e.key === "Enter") importRepo(); }} aria-label={importMode === "url" ? "URL Git" : "Đường dẫn thư mục"} />
              <button className="lp2-primary" onClick={importRepo} disabled={importBusy}>{importBusy ? "Đang import…" : importMode === "url" ? "Clone và thêm" : "Thêm repo"}</button>
            </div>
          )}
          <div className="lp2-repos">
            {workspaces.map((w) => {
              const open = !closedRepos.includes(w.id);
              const list = w.id === workspaceId ? sessions : repoSessions[w.id] ?? [];
              const available = w.status === "ACTIVE";
              return (
                <div key={w.id} className={`lp2-repo ${w.id === workspaceId ? "current" : ""}`}>
                  <div className="lp2-repo-head">
                    <button className="lp2-repo-toggle" onClick={() => setClosedRepos((current) => open ? [...current, w.id] : current.filter((id) => id !== w.id))} aria-expanded={open} title={w.path}>
                      <span className="lp2-chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
                      <span className="lp2-repo-name">{w.name}</span>
                      {!available && <span className="lp2-repo-off">không truy cập được</span>}
                    </button>
                    {available && <button className="lp2-ghost lp2-icon" onClick={() => createSession(w.id)} aria-label={`Cuộc trò chuyện mới trong ${w.name}`} title="Cuộc trò chuyện mới">＋</button>}
                  </div>
                  {open && available && (
                    <div className="lp2-list">
                      {list.length ? list.map((s) => (
                        <button key={s.id} className={`lp2-item ${w.id === workspaceId && s.id === sessionId ? "active" : ""}`} onClick={() => selectSession(w.id, s.id)} title={s.title}>
                          <span className="lp2-item-title">{s.title}</span>
                        </button>
                      )) : <button className="lp2-item lp2-item-empty" onClick={() => createSession(w.id)}>＋ Bắt đầu cuộc trò chuyện</button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>}
      </aside>

      {/* Centre: the pipeline */}
      <section className="lp2-main">
        <header className="lp2-main-head">
          <div className="lp2-title">
            <h2>{workspace?.name ?? "Repo"}</h2>
            <span className={`lp2-badge t-${statusTone(run?.status)}`}>{run ? RUN_STATUS[run.status] ?? run.status : "Chưa chạy"}</span>
            {roundText && <span className="lp2-badge t-warn">{roundText}</span>}
          </div>
          <div className="lp2-actions">
            {run?.status === "waiting-human" && <><button className="lp2-primary" onClick={() => runAction("approve")}>Duyệt</button><button onClick={() => runAction("reject")}>Trả lại</button></>}
            {run?.status === "running" && <button onClick={() => runAction("pause")}>Tạm dừng</button>}
            {run && ["paused", "blocked", "interrupted", "failed"].includes(run.status) && <button className="lp2-primary" onClick={() => runAction("resume")}>Tiếp tục</button>}
            {run && ["running", "paused", "waiting-human"].includes(run.status) && <button className="lp2-danger" onClick={() => runAction("cancel")}>Hủy</button>}
            {!activeRun && <button className="lp2-primary" onClick={startRun} disabled={!queued} title={queued ? "" : "Duyệt hoặc thêm task trước"}>▶ Chạy vòng lặp{queued ? ` (${queued} task)` : ""}</button>}
          </div>
        </header>

        {run?.error && <div className="lp2-alert">{run.error}</div>}
        {proposals.length > 0 && (
          <div className="lp2-callout">
            <span>Claude đề xuất {proposals.length} task. Xem bên dưới rồi duyệt để đưa vào hàng đợi.</span>
            <button className="lp2-primary" onClick={() => setTaskStatus(proposals.map((t) => t.id), "queued")}>Duyệt tất cả</button>
          </div>
        )}

        <section className="lp2-card">
          <div className="lp2-card-head">
            <h3>{pipeline?.name ?? "Pipeline"}</h3>
            {state && state.runs.length > 0 && (
              <select value={selectedRunId} onChange={(e) => setSelectedRunId(e.target.value)} aria-label="Chọn run">
                {state.runs.map((r) => <option key={r.id} value={r.id}>{new Date(r.createdAt).toLocaleString()} · {RUN_STATUS[r.status] ?? r.status}</option>)}
              </select>
            )}
          </div>
          {currentTask && <p className="lp2-current">Task đang làm: <strong>{currentTask.title}</strong></p>}
          {(() => {
            if (!pipeline) return null;
            const ctx = pipeline.stages.find((s) => s.kind === "context");
            const ctxResult = ctx ? run?.stageResults[ctx.id] : undefined;
            const cards = pipeline.stages.filter((s) => s.kind !== "context");
            const backEdges = pipeline.stages
              .map((stage, index) => ({ stage, index, back: stage.onFail ? pipeline.stages.find((s) => s.id === stage.onFail) : undefined }))
              .filter((e) => e.back && pipeline.stages.indexOf(e.back) < e.index);
            const open = pipeline.stages.find((s) => s.id === openStage);
            const openResult = open ? run?.stageResults[open.id] : undefined;
            const openAgent = agentById(open?.agent);
            const gateResult = gate ? run?.stageResults[gate.id] : undefined;
            const failActive = Boolean(loopBack) && run?.status === "running";
            const passActive = gateResult?.status === "passed" && ["running", "waiting-human", "paused"].includes(run?.status ?? "");
            return <>
              {ctx && (
                <button className={`lp2-ctx s-${ctxResult?.status ?? "waiting"}`} onClick={() => setOpenStage(openStage === ctx.id ? "" : ctx.id)} aria-expanded={openStage === ctx.id}>
                  <span className="lp2-glyph g-context">DOC</span>
                  <span>{stageTitle(ctx)}: {nodeDetail(ctx, ctxResult)}</span>
                  <span className={`lp2-pill p-${ctxResult?.status ?? "waiting"}`}>{STAGE_STATUS[ctxResult?.status ?? "waiting"]}</span>
                </button>
              )}
              <ol className="lp2-cards">
                {cards.map((stage, i) => {
                  const result = run?.stageResults[stage.id];
                  const status = result?.status ?? "waiting";
                  const agent = agentById(stage.agent);
                  const current = run?.currentStageId === stage.id && run.status !== "completed";
                  return (
                    <li key={stage.id} className="lp2-card-item">
                      <button className={`lp2-acard s-${status} ${current ? "current" : ""} ${openStage === stage.id ? "selected" : ""}`} onClick={() => setOpenStage(openStage === stage.id ? "" : stage.id)} aria-expanded={openStage === stage.id}>
                        <span className="lp2-acard-top">
                          <span className={`lp2-glyph g-${stage.agent ?? stage.kind}`}>{stage.agent ? AGENT_GLYPH[stage.agent] ?? stage.agent.slice(0, 2).toUpperCase() : KIND_GLYPH[stage.kind]}</span>
                          <strong className="lp2-acard-title">{stage.agent ? AGENT_LABEL[stage.agent] ?? stage.agent : stageTitle(stage)}</strong>
                        </span>
                        <span className="lp2-acard-meta">
                          <span className="lp2-role">{stage.role ? ROLE_LABEL[stage.role] ?? stage.role : KIND_LABEL[stage.kind]}</span>
                          <span className={`lp2-pill p-${status}`}>{STAGE_STATUS[status] ?? status}{result && result.round > 1 ? ` · v${result.round}` : ""}</span>
                        </span>
                        <span className="lp2-acard-label">{stageTitle(stage)}</span>
                        <span className="lp2-acard-box lp2-mono">{nodeDetail(stage, result)}</span>
                        {agent && agent.status !== "available" && <span className="lp2-warn-chip" title={agent.detail}>{agent.name} {AVAILABILITY[agent.status] ?? agent.status}</span>}
                      </button>
                      {i < cards.length - 1 && <span className={`lp2-arrow ${status === "passed" ? "done" : ""}`} aria-hidden="true">→</span>}
                    </li>
                  );
                })}
              </ol>
              {backEdges.length > 0 && (
                <div className="lp2-backs">
                  {backEdges.map(({ stage, back }) => (
                    <span key={stage.id} className={`lp2-loopback ${loopBack === stage.id && run?.status === "running" ? "active" : ""}`}>↺ {stageTitle(stage)} {stage.kind === "human" ? "bị trả lại" : "trượt"} → quay lại {stageTitle(back as Stage)}</span>
                  ))}
                </div>
              )}
              {open && (
                <div className="lp2-node-open">
                  <div className="lp2-mini"><strong>{stageTitle(open)}</strong>{openResult ? ` · vòng ${openResult.round}${openResult.verdict ? ` · VERDICT ${openResult.verdict}` : ""}${openResult.exitCode !== undefined && openResult.exitCode !== null ? ` · exit ${openResult.exitCode}` : ""} · ${time(openResult.at)}` : " · chưa chạy trong run đang xem"}</div>
                  {openResult?.issues && <pre className="lp2-pre fail">{openResult.issues}</pre>}
                  {openResult?.outputTail && <pre className="lp2-pre">{openResult.outputTail}</pre>}
                  {openAgent && <div className="lp2-mini">{openAgent.name}: {openAgent.detail}</div>}
                </div>
              )}
              {gate && (
                <div className="lp2-rules">
                  <div className={`lp2-rule fail ${failActive ? "active" : ""}`}>
                    <strong>Nếu {stageTitle(gate)} trượt <span className="lp2-count">đã trượt {currentTask?.failedRounds ?? 0}/{pipeline.maxRounds}</span></strong>
                    <span>Lỗi được gửi kèm cho {stageTitle(pipeline.stages.find((s) => s.id === gate.onFail) ?? gate)} sửa tiếp. Trượt {pipeline.maxRounds} vòng thì dừng chờ bạn.</span>
                  </div>
                  <div className={`lp2-rule pass ${passActive ? "active" : ""}`}>
                    <strong>Nếu đạt</strong>
                    <span>Chỉ đạt khi lệnh test thoát mã 0 và {AGENT_LABEL[gate.agent ?? ""] ?? gate.agent} kết luận PASS. Sau đó sang {stageTitle(pipeline.stages.find((s) => s.id === gate.onPass) ?? gate)}.</span>
                  </div>
                </div>
              )}
            </>;
          })()}
          {otherAgents.length > 0 && (
            <div className="lp2-others">
              <span>Agent khác:</span>
              {otherAgents.map((a) => <span key={a.id} className={`lp2-chip a-${a.status.replace(/\s/g, "_")}`} title={a.detail}>{a.name} · {AVAILABILITY[a.status] ?? a.status}</span>)}
              <button className="lp2-ghost" onClick={() => loadAgents()}>Kiểm tra lại</button>
            </div>
          )}
        </section>

        <section className="lp2-card">
          <div className="lp2-card-head">
            <h3>Task</h3>
            <button onClick={() => setShowTaskForm(!showTaskForm)}>{showTaskForm ? "Đóng" : "＋ Thêm task"}</button>
          </div>
          {showTaskForm && (
            <div className="lp2-form">
              <input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="Tiêu đề, ví dụ: Trang đăng nhập" aria-label="Tiêu đề task" />
              <input value={taskForm.files} onChange={(e) => setTaskForm({ ...taskForm, files: e.target.value })} placeholder="File được sửa, ví dụ: src/ui/**, src/styles.css (trống = không giới hạn)" aria-label="File được sửa" />
              <textarea value={taskForm.acceptance} onChange={(e) => setTaskForm({ ...taskForm, acceptance: e.target.value })} rows={2} placeholder="Tiêu chí nghiệm thu, mỗi dòng một tiêu chí" aria-label="Tiêu chí nghiệm thu" />
              <button className="lp2-primary" onClick={addTask}>Thêm vào hàng đợi</button>
            </div>
          )}
          <div className="lp2-tasks">
            {state?.tasks.length ? state.tasks.slice().reverse().map((task) => (
              <article key={task.id} className={`lp2-task t-${task.status}`}>
                <div className="lp2-task-top">
                  <strong>{task.title}</strong>
                  <span className={`lp2-chip s-${task.status}`}>{TASK_STATUS[task.status] ?? task.status}</span>
                  {task.source === "claude" && <span className="lp2-chip ghost">Claude đề xuất</span>}
                  <span className="lp2-task-actions">
                    {task.status === "proposal" && <><button className="lp2-primary" onClick={() => setTaskStatus([task.id], "queued")}>Duyệt</button><button onClick={() => setTaskStatus([task.id], "canceled")}>Bỏ</button></>}
                    {(task.status === "canceled" || task.status === "blocked") && !activeRun && <button onClick={() => setTaskStatus([task.id], "queued")}>Đưa lại hàng đợi</button>}
                    {task.status === "queued" && <button className="lp2-ghost" onClick={() => setTaskStatus([task.id], "canceled")}>Bỏ</button>}
                  </span>
                </div>
                {task.description && <p className="lp2-task-desc">{task.description}</p>}
                {task.acceptance.length > 0 && <ul className="lp2-accept">{task.acceptance.map((a) => <li key={a}>{a}</li>)}</ul>}
                <div className="lp2-task-meta">
                  {task.allowedFiles.length > 0 && <span className="lp2-mono">{task.allowedFiles.join(", ")}</span>}
                  {task.failedRounds > 0 && <span>đã trượt {task.failedRounds} vòng</span>}
                  {task.commit && <span className="lp2-mono">commit {task.commit.slice(0, 10)}</span>}
                </div>
                {task.status === "blocked" && task.lastIssues && <p className="lp2-alert small">{task.lastIssues}</p>}
              </article>
            )) : <p className="lp2-empty">Chưa có task. Trao đổi với Claude ở khung bên phải rồi bấm “Chia thành task”, hoặc thêm task bằng tay.</p>}
          </div>
        </section>

        <div className="lp2-two">
          <section className="lp2-card">
            <div className="lp2-card-head"><h3>Repo và nhánh</h3></div>
            <div className="lp2-field"><span>Thư mục</span><code className="lp2-mono">{workspace?.path}</code></div>
            <div className="lp2-field"><span>Nhánh của run</span><code className="lp2-mono">{run?.branch ?? "tạo khi bấm Chạy vòng lặp"}</code></div>
            <label className="lp2-field"><span>Lệnh test</span><input className="lp2-mono" value={commands.test} onChange={(e) => setCommands({ ...commands, test: e.target.value })} placeholder="npm test" /></label>
            <label className="lp2-field"><span>Lệnh build</span><input className="lp2-mono" value={commands.build} onChange={(e) => setCommands({ ...commands, build: e.target.value })} placeholder="npm run build" /></label>
            <div className="lp2-actions"><button onClick={saveCommands}>Lưu lệnh</button></div>
            <p className="lp2-hint">Agent chỉ ghi file trong nhánh riêng của run. Repo của bạn không bị sửa; bạn tự merge nhánh khi thấy ổn.</p>
          </section>
          <section className="lp2-card">
            <div className="lp2-card-head"><h3>Tài liệu context</h3><span className="lp2-hint">{(contextStage?.sources ?? []).length} nguồn</span></div>
            {contextStage ? <>
              <ul className="lp2-sources">
                {(contextStage.sources ?? []).map((source) => (
                  <li key={source}><span className="lp2-mono">{source}</span><button className="lp2-ghost lp2-icon" onClick={() => updateSources((contextStage.sources ?? []).filter((s) => s !== source))} aria-label={`Bỏ ${source}`}>×</button></li>
                ))}
              </ul>
              <div className="lp2-inline">
                <input list="lp2-files" value={newSource} onChange={(e) => setNewSource(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addSource(); }} placeholder="Thêm file hoặc thư mục, ví dụ docs/" aria-label="Thêm tài liệu context" />
                <datalist id="lp2-files">{projectFiles.map((f) => <option key={f} value={f} />)}</datalist>
                <button onClick={addSource}>Thêm</button>
              </div>
              <p className="lp2-hint">AGENTS.md và README.md luôn được gửi kèm. File bí mật như .env bị lọc.</p>
            </> : <p className="lp2-empty">Pipeline này không có bước tài liệu context.</p>}
          </section>
        </div>

        <details className="lp2-card lp2-advanced">
          <summary>Nâng cao: sửa pipeline (JSON)</summary>
          <textarea className="lp2-mono" rows={14} value={pipelineText} onChange={(e) => setPipelineText(e.target.value)} spellCheck={false} aria-label="Pipeline JSON" />
          <div className="lp2-actions"><span className="lp2-hint">Loại bước: context, agent, command, gate, human, commit. Agent: claude, codex, antigravity, lmstudio, ollama.</span><button onClick={savePipeline}>Lưu pipeline</button></div>
        </details>
      </section>

      {/* Right: chat with Claude Code and the run log */}
      <aside className="lp2-right">
        <section className="lp2-chat">
          <header className="lp2-chat-head">
            <span className="lp2-glyph g-claude">CC</span>
            <div><strong>Claude Code · {workspace?.name ?? ""}</strong><span className="lp2-hint">{session ? `${session.title} · ` : ""}chỉ đọc, không sửa file</span></div>
            <span className={`lp2-dot ${agentById("claude")?.status === "available" ? "ok" : "bad"}`} title={agentById("claude")?.detail} />
          </header>
          <div className="lp2-messages" ref={messagesRef} aria-live="polite">
            {!session && <p className="lp2-empty">Tạo một cuộc trò chuyện ở thanh bên trái để bắt đầu.</p>}
            {session && !session.messages?.length && !chatBusy && <p className="lp2-empty">Mô tả việc bạn muốn làm với repo này. Khi đã rõ, bấm “Chia thành task” để Claude đề xuất task cho vòng lặp.</p>}
            {(session?.messages ?? []).map((m) => (
              <article key={m.id} className={`lp2-msg ${m.role === "user" ? "me" : "ai"} ${m.error ? "err" : ""}`}>
                <div className="lp2-msg-meta">{m.role === "user" ? "Bạn" : m.provider === "claude" ? "Claude Code" : m.provider ?? "Harness"} · {time(m.createdAt)}</div>
                <p>{m.content.replace(/```json[\s\S]*?```/g, "[Danh sách task đã chuyển vào ô Task để bạn duyệt]")}</p>
              </article>
            ))}
            {chatBusy && (
              <article className="lp2-msg ai live">
                <div className="lp2-msg-meta">Claude Code · đang trả lời{liveTools.length ? ` · đã dùng ${[...new Set(liveTools)].join(", ")}` : ""}</div>
                <p>{liveReply || "…"}</p>
              </article>
            )}
          </div>
          <div className="lp2-suggest">
            <button className="lp2-chip-btn strong" onClick={() => sendChat({ propose: true })} disabled={chatBusy || !session}>Chia thành task</button>
            {CHAT_SUGGESTIONS.map((s) => <button key={s} className="lp2-chip-btn" onClick={() => sendChat({ text: s })} disabled={chatBusy || !session}>{s}</button>)}
          </div>
          <div className="lp2-composer">
            <textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} rows={2} placeholder={session ? "Nhắn cho Claude Code… (Ctrl+Enter để gửi)" : "Chọn một cuộc trò chuyện trước"} disabled={chatBusy || !session}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendChat(); }} aria-label="Tin nhắn cho Claude Code" />
            {chatBusy ? <button className="lp2-danger" onClick={() => chatAbort.current?.abort()}>Dừng</button>
              : <button className="lp2-primary" onClick={() => sendChat()} disabled={!session || !chatInput.trim()}>Gửi</button>}
          </div>
        </section>
        <section className="lp2-log">
          <header className="lp2-log-head"><span>&gt;_ Nhật ký run</span>{run && <span className="lp2-mono">{run.branch}</span>}</header>
          <div className="lp2-log-body" ref={logRef} aria-live="polite">
            {logLines.length ? logLines.map((line) => (
              <div key={line.key} className={`lp2-line l-${line.tone}`}>
                <time>{time(line.at)}</time>
                {line.who && <span className="lp2-who">{AGENT_LABEL[line.who] ?? line.who}</span>}
                <pre>{line.tone === "output" ? line.text.slice(-4000) : line.text}</pre>
              </div>
            )) : <p className="lp2-empty">Chưa có run nào. Duyệt task rồi bấm “Chạy vòng lặp”.</p>}
          </div>
        </section>
      </aside>
    </section>
  );
};
