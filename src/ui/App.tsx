import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileRelationship,
  HarnessFlowStep,
  HarnessSession,
  OrchestrationMode,
  ProjectFile,
  ProjectFileEntry,
  ProjectFlow,
  ProjectIndex,
  ProviderState,
  TimelineEvent,
  WorkflowState,
  WorkspaceSummary,
} from "./types.js";
import {
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  ThemePreference,
} from "./theme.js";
import { LoopWorkspace } from "./LoopWorkspace.js";

const MODE_LABELS: Record<OrchestrationMode, string> = {
  auto: "Auto route",
  codex: "Codex",
  antigravity: "Antigravity",
  ollama: "Ollama local",
  parallel: "Compare in parallel",
  codex_writes_antigravity_reviews: "Codex writes · Antigravity reviews",
  antigravity_writes_codex_reviews: "Antigravity writes · Codex reviews",
};

type Page = "loop" | "atlas";
type View = "project-flow" | "harness-flow" | "code" | "relationships" | "changes";

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const statusTone = (status: ProviderState["status"]) => {
  if (status === "available") return "green";
  if (status === "authentication_required") return "amber";
  if (status === "offline") return "rose";
  return "muted";
};

const fileGlyph = (file: ProjectFileEntry) => {
  if ([".ts", ".tsx", ".js", ".jsx"].includes(file.extension)) return "JS";
  if ([".cs", ".cshtml"].includes(file.extension)) return "C#";
  if (file.extension === ".py") return "PY";
  if (file.extension === ".md") return "MD";
  if ([".json", ".yaml", ".yml", ".toml", ".xml"].includes(file.extension)) return "{}";
  return "<>";
};

const short = (value: string, maximum = 20) => value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value;

export const App: React.FC = () => {
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    readThemePreference(typeof window === "undefined" ? undefined : window.localStorage),
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches,
  );
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [index, setIndex] = useState<ProjectIndex | null>(null);
  const [projectFlow, setProjectFlow] = useState<ProjectFlow | null>(null);
  const [harnessFlow, setHarnessFlow] = useState<HarnessFlowStep[]>([]);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [relationships, setRelationships] = useState<FileRelationship[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [providers, setProviders] = useState<ProviderState[]>([]);
  const [sessions, setSessions] = useState<HarnessSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [search, setSearch] = useState("");
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<OrchestrationMode>("auto");
  const [contextSummary, setContextSummary] = useState("");
  const [activeView, setActiveView] = useState<View>("project-flow");
  const [loading, setLoading] = useState(true);
  const [fileLoading, setFileLoading] = useState(false);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [activeRunId, setActiveRunId] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("");
  const [showPathEntry, setShowPathEntry] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState<Page>("loop");

  const workspaceQuery = workspaceId ? `?workspace=${encodeURIComponent(workspaceId)}` : "";
  const activeSession = sessions.find((session) => session.id === activeSessionId);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (event: MediaQueryListEvent | MediaQueryList) => setSystemPrefersDark(event.matches);
    update(query);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const resolved = resolveTheme(themePreference, systemPrefersDark);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = themePreference;
    try { window.localStorage.setItem(THEME_STORAGE_KEY, themePreference); } catch {}
  }, [themePreference, systemPrefersDark]);

  const loadWorkspaces = useCallback(async (preferredId?: string) => {
    const response = await fetch("/api/workspaces");
    if (!response.ok) throw new Error("Không thể đọc danh sách project");
    const data = await response.json();
    const items: WorkspaceSummary[] = data.workspaces ?? [];
    setWorkspaces(items);
    setWorkspaceId((current) => {
      if (preferredId && items.some((item) => item.id === preferredId)) return preferredId;
      if (current && items.some((item) => item.id === current)) return current;
      return items.find((item) => item.status === "ACTIVE")?.id ?? "";
    });
  }, []);

  const loadWorkspace = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const q = `?workspace=${encodeURIComponent(id)}`;
      const responses = await Promise.all([
        fetch(`/api/project-index${q}`),
        fetch("/api/providers"),
        fetch(`/api/sessions${q}`),
        fetch(`/api/state${q}`),
        fetch(`/api/timeline${q}`),
        fetch(`/api/project-flow${q}`),
        fetch(`/api/harness-flow${q}`),
      ]);
      if (!responses[0].ok) throw new Error("Không thể lập chỉ mục project");
      const [indexData, providerData, sessionData, stateData, timelineData, projectFlowData, harnessFlowData] =
        await Promise.all(responses.map((response) => response.json()));
      setIndex(indexData);
      setProviders(providerData.providers ?? []);
      setSessions(sessionData.sessions ?? []);
      setActiveSessionId(sessionData.sessions?.[0]?.id ?? "");
      setWorkflow(stateData);
      setTimeline(timelineData.events ?? []);
      setProjectFlow(projectFlowData.flow ?? null);
      setHarnessFlow(harnessFlowData.steps ?? []);
      setSelectedFile(null);
      setRelationships([]);
      setSelectedPaths([]);
      setContextSummary("");
      setConnectionStatus("");
      setActiveView("project-flow");
    } catch (reason: any) {
      setError(reason?.message || "Không thể tải project");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspaces().catch((reason) => setError(reason.message));
  }, [loadWorkspaces]);

  useEffect(() => {
    if (workspaceId) loadWorkspace(workspaceId);
  }, [workspaceId, loadWorkspace]);

  const openFile = async (path: string) => {
    setFileLoading(true);
    setError("");
    try {
      const query = `workspace=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(path)}`;
      const [fileResponse, relationResponse] = await Promise.all([
        fetch(`/api/project-file?${query}`),
        fetch(`/api/relationships?${query}`),
      ]);
      if (!fileResponse.ok) throw new Error("File bị chặn hoặc không thể đọc");
      const [fileData, relationData] = await Promise.all([fileResponse.json(), relationResponse.json()]);
      setSelectedFile(fileData);
      setRelationships(relationData.relationships ?? []);
      setActiveView("code");
    } catch (reason: any) {
      setError(reason?.message || "Không thể mở file");
    } finally {
      setFileLoading(false);
    }
  };

  const toggleContextFile = (path: string) => {
    setSelectedPaths((current) => current.includes(path)
      ? current.filter((item) => item !== path)
      : [...current, path].slice(-20));
  };

  const createSession = async (fallbackTitle?: string): Promise<HarnessSession | undefined> => {
    const title = fallbackTitle ?? window.prompt("Tên session mới", "Khám phá project");
    if (title === null) return undefined;
    const response = await fetch(`/api/sessions${workspaceQuery}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, mode: mode === "auto" ? "antigravity" : mode }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Không thể tạo session");
      return undefined;
    }
    setSessions((current) => [data.session, ...current]);
    setActiveSessionId(data.session.id);
    return data.session;
  };

  const chooseWorkspace = async () => {
    setWorkspaceBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workspaces/pick", { method: "POST" });
      const data = await response.json();
      if (data.canceled) return;
      if (!response.ok) {
        if (data.fallback === "path") setShowPathEntry(true);
        throw new Error(data.error || "Không thể chọn workspace");
      }
      setShowPathEntry(false);
      await loadWorkspaces(data.workspace.id);
    } catch (reason: any) {
      setError(reason?.message || "Không thể chọn workspace");
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const registerPath = async () => {
    if (!pathInput.trim()) return setError("Hãy nhập đường dẫn tuyệt đối tới thư mục project");
    setWorkspaceBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workspaces/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathInput }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể đăng ký workspace");
      setPathInput("");
      setShowPathEntry(false);
      await loadWorkspaces(data.workspace.id);
    } catch (reason: any) {
      setError(reason?.message || "Không thể đăng ký workspace");
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const prepareContext = async () => {
    if (!prompt.trim()) return setError("Hãy nhập yêu cầu trước khi chuẩn bị context");
    setContextSummary("Đang đóng gói context an toàn…");
    setError("");
    try {
      const response = await fetch(`/api/context-packet${workspaceQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, selectedPaths, mode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể tạo context");
      const packet = data.packet;
      setContextSummary(`${packet.files.length} file đã chọn · ${packet.instructions.length} file hướng dẫn · ${packet.budget.usedCharacters.toLocaleString()} / ${packet.budget.maximumCharacters.toLocaleString()} ký tự. Chưa gửi dữ liệu tới model.`);
    } catch (reason: any) {
      setContextSummary("");
      setError(reason?.message || "Không thể tạo context");
    }
  };

  const testAntigravity = async () => {
    setConnectionStatus("Đang kiểm tra bằng một yêu cầu Antigravity có dùng quota…");
    setError("");
    try {
      const response = await fetch(`/api/antigravity/test${workspaceQuery}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể kết nối Antigravity");
      const usage = data.result?.usage?.total_tokens;
      setConnectionStatus(`Đã kết nối · ${data.result?.status}${usage ? ` · ${usage.toLocaleString()} tokens` : ""}`);
    } catch (reason: any) {
      setConnectionStatus("");
      setError(reason?.message || "Không thể kết nối Antigravity");
    }
  };

  const sendToAntigravity = async () => {
    if (!prompt.trim()) return setError("Hãy nhập yêu cầu cho Antigravity");
    if (!providers.some((provider) => provider.id === "antigravity" && provider.status === "available")) {
      return setError("Antigravity CLI chưa khả dụng");
    }
    let session = activeSession;
    if (!session) session = await createSession(short(prompt.trim(), 48));
    if (!session) return;
    const runId = globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}`;
    setActiveRunId(runId);
    setAgentBusy(true);
    setError("");
    setContextSummary("Đang gửi bounded context tới Antigravity sandbox…");
    try {
      const response = await fetch(`/api/antigravity/run${workspaceQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, sessionId: session.id, prompt, selectedPaths }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Antigravity không trả lời được");
      setSessions((current) => current.map((item) => item.id === data.session.id ? data.session : item));
      setActiveSessionId(data.session.id);
      setPrompt("");
      const usage = data.result?.usage?.total_tokens;
      setContextSummary(`Antigravity ${data.result.status}${usage ? ` · ${usage.toLocaleString()} tokens` : ""} · không ghi trực tiếp vào project.`);
      if (data.session.proposals?.length) setActiveView("changes");
    } catch (reason: any) {
      setError(reason?.message || "Antigravity run failed");
      const sessionsResponse = await fetch(`/api/sessions${workspaceQuery}`);
      if (sessionsResponse.ok) setSessions((await sessionsResponse.json()).sessions ?? []);
    } finally {
      setAgentBusy(false);
      setActiveRunId("");
    }
  };

  const cancelAntigravity = async () => {
    if (!activeRunId) return;
    await fetch("/api/antigravity/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: activeRunId }),
    });
  };

  const filteredFiles = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return index?.files ?? [];
    return (index?.files ?? []).filter((file) => file.path.toLowerCase().includes(term) || file.language.toLowerCase().includes(term));
  }, [index, search]);

  const providerAvailable = (id: ProviderState["id"]) => providers.find((provider) => provider.id === id)?.status === "available";
  const modeDisabled = (value: OrchestrationMode) => {
    if (value === "auto") return false;
    if (value === "antigravity") return !providerAvailable("antigravity");
    if (value === "codex" || value === "ollama") return true;
    return true;
  };
  const selectedWorkspace = workspaces.find((item) => item.id === workspaceId);
  const proposals = activeSession?.proposals ?? [];

  const graphLayout = useMemo(() => {
    const nodes = projectFlow?.nodes ?? [];
    const groups = [...new Set(nodes.map((node) => node.group))].slice(0, 5);
    const positions = new Map<string, { x: number; y: number }>();
    groups.forEach((group, column) => {
      nodes.filter((node) => node.group === group).forEach((node, row) => {
        positions.set(node.id, { x: 95 + column * 160, y: 65 + row * 58 });
      });
    });
    const rows = Math.max(1, ...groups.map((group) => nodes.filter((node) => node.group === group).length));
    return { groups, positions, width: Math.max(760, groups.length * 165), height: Math.max(360, rows * 58 + 90) };
  }, [projectFlow]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block"><div className="brand-mark" aria-hidden="true">H</div><div><h1>Harness Atlas</h1><p>Local project intelligence</p></div></div>
        <div className="project-switcher">
          <span className="eyebrow">ACTIVE PROJECT</span>
          <div className="project-switcher-row">
            <select aria-label="Chọn project" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id} disabled={workspace.status !== "ACTIVE"}>{workspace.name}{workspace.status !== "ACTIVE" ? " · unavailable" : ""}</option>)}
            </select>
            <button className="choose-workspace" onClick={chooseWorkspace} disabled={workspaceBusy}>{workspaceBusy ? "…" : "+ Choose workspace"}</button>
          </div>
          {showPathEntry && <div className="path-entry"><input aria-label="Đường dẫn workspace" value={pathInput} onChange={(event) => setPathInput(event.target.value)} placeholder="D:\\Projects\\my-project" /><button onClick={registerPath}>Add</button></div>}
        </div>
        <div className="topbar-meta">
          <nav className="page-switch" aria-label="Trang">
            <button className={page === "loop" ? "active" : ""} onClick={() => setPage("loop")} aria-pressed={page === "loop"}>Vòng lặp agent</button>
            <button className={page === "atlas" ? "active" : ""} onClick={() => setPage("atlas")} aria-pressed={page === "atlas"}>Code atlas</button>
          </nav>
          <span className="live-dot" /><span>Loopback only</span>
          <div className="theme-switcher" role="group" aria-label="Giao diện sáng tối">
            {(["light", "dark", "system"] as ThemePreference[]).map((theme) => (
              <button key={theme} type="button" className={themePreference === theme ? "active" : ""} onClick={() => setThemePreference(theme)} aria-pressed={themePreference === theme} title={theme === "light" ? "Giao diện sáng" : theme === "dark" ? "Giao diện tối" : "Theo hệ thống"}>
                <span aria-hidden="true">{theme === "light" ? "☀" : theme === "dark" ? "☾" : "◐"}</span><span className="theme-label">{theme === "light" ? "Sáng" : theme === "dark" ? "Tối" : "Hệ thống"}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Đóng lỗi">×</button></div>}

      {page === "loop" && workspaceId && (
        <LoopWorkspace
          workspaces={workspaces}
          workspaceId={workspaceId}
          onSelectWorkspace={setWorkspaceId}
          onWorkspacesChanged={loadWorkspaces}
          onError={setError}
        />
      )}
      {page === "loop" && !workspaceId && <div className="empty-state">Chưa có repo nào. Thêm repo bằng ô chọn project phía trên.</div>}

      {page === "atlas" && <section className="workspace-grid">
        <aside className="panel explorer-panel">
          <div className="panel-heading"><div><span className="eyebrow">PROJECT MAP</span><h2>{index?.rootName ?? selectedWorkspace?.name ?? "Workspace"}</h2></div><span className="count-pill">{index?.totalFiles ?? 0}</span></div>
          <label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search files or language" /></label>
          <div className="technology-row">{(index?.technologies ?? []).slice(0, 6).map((technology) => <span key={technology} className="tech-chip">{technology}</span>)}{!loading && index?.technologies.length === 0 && <span className="empty-inline">No stack assumptions</span>}</div>
          <div className="file-list" aria-busy={loading}>
            {loading ? Array.from({ length: 8 }).map((_, item) => <div className="skeleton file-skeleton" key={item} />) : filteredFiles.length ? filteredFiles.map((file) => (
              <div key={file.path} className={`file-row ${selectedFile?.path === file.path ? "active" : ""}`}>
                <button className="file-open" onClick={() => openFile(file.path)} title={file.path}><span className="file-glyph">{fileGlyph(file)}</span><span className="file-copy"><strong>{file.name}</strong><small>{file.path} · {formatBytes(file.size)}</small></span></button>
                <button className={`context-toggle ${selectedPaths.includes(file.path) ? "selected" : ""}`} onClick={() => toggleContextFile(file.path)} aria-label="Thêm hoặc bỏ file khỏi context" title="Thêm vào context">{selectedPaths.includes(file.path) ? "✓" : "+"}</button>
              </div>
            )) : <div className="empty-state compact">Không có file phù hợp.</div>}
          </div>
          <footer className="panel-footer"><span>{index?.ignoredCount ?? 0} mục được lọc an toàn</span>{index?.truncated && <span className="warn-text">Index đã giới hạn</span>}</footer>
        </aside>

        <section className="panel canvas-panel">
          <nav className="canvas-tabs" aria-label="Project views">
            <button className={activeView === "project-flow" ? "active" : ""} onClick={() => setActiveView("project-flow")}>Project Flow</button>
            <button className={activeView === "harness-flow" ? "active" : ""} onClick={() => setActiveView("harness-flow")}>Harness Flow</button>
            <button className={activeView === "code" ? "active" : ""} onClick={() => setActiveView("code")}>Code</button>
            <button className={activeView === "relationships" ? "active" : ""} onClick={() => setActiveView("relationships")}>Relations <span>{relationships.length}</span></button>
            <button className={activeView === "changes" ? "active" : ""} onClick={() => setActiveView("changes")}>Changes <span>{proposals.length}</span></button>
            <div className="safe-state">Safe context</div>
          </nav>

          {activeView === "project-flow" ? (
            <div className="flow-view">
              <div className="hero-copy compact-hero"><span className="eyebrow">EVIDENCE-DERIVED PROJECT FLOW</span><h2>{index?.rootName ?? "Project"}</h2><p>Chỉ vẽ import/reference cục bộ đã tìm thấy. Node rời nghĩa là Harness chưa có bằng chứng về liên kết, không phải file không quan trọng.</p></div>
              {projectFlow?.nodes.length ? <>
                <div className="project-flow-scroll" role="region" aria-label="Sơ đồ quan hệ project">
                  <svg className="project-flow-svg" viewBox={`0 0 ${graphLayout.width} ${graphLayout.height}`}>
                    {projectFlow.edges.map((edge) => {
                      const from = graphLayout.positions.get(edge.source); const to = graphLayout.positions.get(edge.target);
                      return from && to ? <line key={`${edge.source}-${edge.target}`} x1={from.x + 58} y1={from.y} x2={to.x - 58} y2={to.y} className="flow-edge" /> : null;
                    })}
                    {projectFlow.nodes.map((node) => { const point = graphLayout.positions.get(node.id); return point ? <g key={node.id} className="flow-node" role="button" tabIndex={0} aria-label={`Mở ${node.path}`} onClick={() => openFile(node.path)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openFile(node.path); }}><rect x={point.x - 60} y={point.y - 20} width="120" height="40" rx="8" /><text x={point.x} y={point.y - 2} textAnchor="middle">{short(node.label, 17)}</text><text x={point.x} y={point.y + 13} textAnchor="middle" className="flow-node-meta">{node.language}</text></g> : null; })}
                  </svg>
                </div>
                <div className="flow-disclosure">{projectFlow.nodes.length}/{projectFlow.totalFiles} files shown · {projectFlow.edges.length} proven edges{(projectFlow.truncatedNodes || projectFlow.truncatedEdges) ? " · graph truncated for performance" : ""}</div>
                <details className="flow-list"><summary>Danh sách truy cập bằng bàn phím</summary>{projectFlow.nodes.map((node) => <button key={node.id} onClick={() => openFile(node.path)}>{node.path}</button>)}</details>
              </> : <div className="empty-state relationship-empty">Không có node an toàn để vẽ.</div>}
            </div>
          ) : activeView === "harness-flow" ? (
            <div className="flow-view"><div className="hero-copy compact-hero"><span className="eyebrow">HARNESS EXECUTION FLOW</span><h2>From project to reviewed change.</h2><p>Trạng thái phản ánh khả năng thật; bước chưa hỗ trợ không được giả vờ đã chạy.</p></div><div className="harness-flow">{harnessFlow.map((step, indexValue) => <React.Fragment key={step.id}><article className={`harness-step step-${step.status}`} tabIndex={0}><span>{indexValue + 1}</span><strong>{step.label}</strong><small>{step.id === "context" && selectedPaths.length ? `${selectedPaths.length} selected files` : step.detail}</small></article>{indexValue < harnessFlow.length - 1 && <div className="harness-arrow">→</div>}</React.Fragment>)}</div></div>
          ) : activeView === "changes" ? (
            proposals.length ? <div className="proposal-list"><div className="hero-copy compact-hero"><span className="eyebrow">READ-ONLY PROPOSALS</span><h2>{proposals.length} suggested file changes</h2><p>Chưa có file nào được ghi. Hãy đọc nội dung trước khi tạo capability áp dụng ở change sau.</p></div>{proposals.map((proposal) => <article className="proposal-card" key={proposal.id}><div><strong>{proposal.path}</strong><span>{proposal.provider}</span></div><p>{proposal.summary}</p>{proposal.replacement && <pre><code>{proposal.replacement}</code></pre>}</article>)}</div> : <div className="empty-canvas"><div className="empty-orbit">Δ</div><span className="eyebrow">PROPOSAL REVIEW</span><h2>No pending file proposals</h2><p>Antigravity suggestions will appear here first. Harness does not overwrite project files.</p><div className="review-steps"><span>1 · Generate</span><span>2 · Inspect diff</span><span>3 · Checkpoint</span><span>4 · Apply later</span></div></div>
          ) : activeView === "relationships" ? (
            <div className="relationship-view"><div className="hero-copy"><span className="eyebrow">LOCAL CODE GRAPH</span><h2>{selectedFile ? selectedFile.path : "Select a file to inspect relationships"}</h2><p>Only explicit local imports and references are shown.</p></div>{selectedFile && relationships.length ? <div className="relationship-graph"><button className="graph-node current" onClick={() => setActiveView("code")}>{selectedFile.path.split("/").pop()}</button><div className="graph-edges">{relationships.map((relationship) => <span key={relationship.target}>→</span>)}</div><div className="graph-targets">{relationships.map((relationship) => <button className="graph-node" key={relationship.target} onClick={() => openFile(relationship.target)}>{relationship.target}</button>)}</div></div> : <div className="empty-state relationship-empty">No safe local relationships detected yet.</div>}</div>
          ) : !selectedFile ? (
            <div className="project-overview"><div className="hero-copy"><span className="eyebrow">UNIVERSAL CONTEXT ENGINE</span><h2>Choose a node or file to inspect its code.</h2><p>The project and Harness flows are the initial context; file previews remain read-only.</p></div><div className="metric-grid"><article><span>Indexed</span><strong>{index?.totalFiles ?? "—"}</strong><small>safe text files</small></article><article><span>Context</span><strong>{selectedPaths.length}</strong><small>explicit selections</small></article><article><span>Workflow</span><strong>{workflow?.stage ?? "IDLE"}</strong><small>{workflow?.currentChangeId ?? "no active change"}</small></article></div><div className="activity-strip"><div><span className="eyebrow">RECENT WORKFLOW</span><strong>{timeline[0]?.title ?? "No recorded activity"}</strong></div><span>{timeline[0] ? new Date(timeline[0].timestamp).toLocaleString() : "—"}</span></div></div>
          ) : (
            <div className="code-view"><div className="code-header"><div><span className="eyebrow">{selectedFile.language}</span><h2>{selectedFile.path}</h2></div><button className={`secondary-button ${selectedPaths.includes(selectedFile.path) ? "selected" : ""}`} onClick={() => toggleContextFile(selectedFile.path)}>{selectedPaths.includes(selectedFile.path) ? "✓ In context" : "+ Add to context"}</button></div>{fileLoading ? <div className="code-loading">Loading safe preview…</div> : <pre className="code-block"><code>{selectedFile.content}</code></pre>}<div className="relationship-dock"><span className="eyebrow">LOCAL RELATIONSHIPS</span>{relationships.length ? relationships.map((relationship) => <button key={relationship.target} onClick={() => openFile(relationship.target)}>↗ {relationship.target}</button>) : <span className="empty-inline">No safe local references detected</span>}</div></div>
          )}
        </section>

        <aside className="panel agent-panel">
          <div className="panel-heading"><div><span className="eyebrow">AGENT ROUTER</span><h2>Providers</h2></div><span className="count-pill">{providers.filter((provider) => provider.status === "available").length}/3</span></div>
          <div className="provider-list">{providers.map((provider) => <article className="provider-card" key={provider.id}><div className={`provider-icon provider-${provider.id}`}>{provider.id === "codex" ? "C" : provider.id === "antigravity" ? "A" : "O"}</div><div><strong>{provider.name}</strong><small>{provider.detail}</small>{provider.id === "antigravity" && provider.status === "available" && <button className="provider-test" onClick={testAntigravity} disabled={agentBusy}>Test connection</button>}</div><span className={`status-dot tone-${statusTone(provider.status)}`} title={provider.status} /></article>)}</div>
          {connectionStatus && <p className="connection-status">✓ {connectionStatus}</p>}
          <label className="mode-select"><span className="eyebrow">ORCHESTRATION</span><select value={mode} onChange={(event) => setMode(event.target.value as OrchestrationMode)}>{(Object.keys(MODE_LABELS) as OrchestrationMode[]).map((value) => <option key={value} value={value} disabled={modeDisabled(value)}>{MODE_LABELS[value]}{modeDisabled(value) ? " · future" : ""}</option>)}</select></label>
          <div className="sessions-heading"><div><span className="eyebrow">PROJECT SESSIONS</span><strong>{sessions.length} saved</strong></div><button onClick={() => createSession()} aria-label="Tạo session mới">＋</button></div>
          <div className="session-list">{sessions.length ? sessions.map((session) => <button key={session.id} className={activeSessionId === session.id ? "active" : ""} onClick={() => setActiveSessionId(session.id)}><span className="session-icon">#</span><span><strong>{session.title}</strong><small>{MODE_LABELS[session.mode]} · {session.messageCount} messages</small></span></button>) : <div className="empty-state compact">Tạo session đầu tiên cho project này.</div>}</div>
          <div className="chat-history" aria-live="polite">{activeSession?.messages?.length ? activeSession.messages.map((message) => <article key={message.id} className={`chat-message message-${message.role}`}><div><strong>{message.role === "user" ? "You" : message.provider === "antigravity" ? "Antigravity" : "Harness"}</strong><time>{new Date(message.createdAt).toLocaleTimeString()}</time></div><p>{message.content}</p>{message.usage?.total_tokens && <small>{message.usage.total_tokens.toLocaleString()} tokens</small>}</article>) : <div className="empty-state compact">Session chưa có tin nhắn.</div>}</div>
          <div className="composer"><div className="context-badges"><span>{selectedPaths.length} files</span><span>{index?.technologies.length ?? 0} signals</span></div><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask Antigravity about this project…" rows={4} disabled={agentBusy} /><div className="composer-actions"><button className="secondary-button" onClick={prepareContext} disabled={agentBusy}>Preview context</button>{agentBusy ? <button className="danger-button" onClick={cancelAntigravity}>Cancel</button> : <button className="primary-button" onClick={sendToAntigravity}>Send to Antigravity <span>→</span></button>}</div>{contextSummary && <p className="context-summary">✓ {contextSummary}</p>}<small className="composer-note">Explicit send only · sandboxed plan mode · proposals are read-only.</small></div>
        </aside>
      </section>}
    </main>
  );
};
