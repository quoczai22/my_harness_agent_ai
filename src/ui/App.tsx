import React, { useState, useEffect, useCallback } from "react";
import { WorkflowState, GitSummary, Checkpoint, WorkflowTask, Decision, WorkspaceSummary } from "./types.js";

const STAGES = ["IDLE", "SPEC_READY", "CHECKPOINT_1", "IMPL_IN_PROGRESS", "IMPL_DONE", "CHECKPOINT_2", "DONE"] as const;

export const App: React.FC = () => {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [state, setState] = useState<WorkflowState | null>(null);
  const [git, setGit] = useState<GitSummary | null>(null);
  const [artifacts, setArtifacts] = useState<string[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null);
  const [artifactContent, setArtifactContent] = useState<string>("");
  const [loadingArtifact, setLoadingArtifact] = useState<boolean>(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await fetch("/api/workspaces");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const wsList: WorkspaceSummary[] = data.workspaces || [];
      setWorkspaces(wsList);
      setSelectedWorkspaceId(prev => {
        if (prev && wsList.some(w => w.id === prev)) return prev;
        return wsList.length > 0 ? wsList[0].id : null;
      });
    } catch (err: any) {
      setError(err?.message || "Failed to fetch workspaces registry");
    }
  }, []);

  const fetchWorkspaceData = useCallback(async (wsId: string | null) => {
    if (!wsId) return;
    try {
      const q = `?workspace=${encodeURIComponent(wsId)}`;
      const [resState, resGit, resArt] = await Promise.all([
        fetch(`/api/state${q}`).then(r => r.json()),
        fetch(`/api/git${q}`).then(r => r.json()),
        fetch(`/api/artifacts${q}`).then(r => r.json())
      ]);
      setState(resState);
      setGit(resGit);
      setArtifacts(resArt.artifacts || []);
      setLastSync(new Date());
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch dashboard data");
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
    const interval = setInterval(fetchWorkspaces, 5000);
    return () => clearInterval(interval);
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (selectedWorkspaceId) {
      fetchWorkspaceData(selectedWorkspaceId);
      const interval = setInterval(() => fetchWorkspaceData(selectedWorkspaceId), 2500);
      return () => clearInterval(interval);
    }
  }, [selectedWorkspaceId, fetchWorkspaceData]);

  const viewArtifact = async (path: string) => {
    setSelectedArtifact(path);
    setLoadingArtifact(true);
    try {
      const q = selectedWorkspaceId ? `&workspace=${encodeURIComponent(selectedWorkspaceId)}` : "";
      const res = await fetch(`/api/artifacts?path=${encodeURIComponent(path)}${q}`);
      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }
      const text = await res.text();
      setArtifactContent(text);
    } catch (err: any) {
      setArtifactContent(`Failed to load artifact: ${err?.message || err}`);
    } finally {
      setLoadingArtifact(false);
    }
  };

  const closeArtifact = () => {
    setSelectedArtifact(null);
    setArtifactContent("");
  };

  const selectedWorkspace = workspaces.find(w => w.id === selectedWorkspaceId);
  const currentStage = state?.stage || "IDLE";
  const currentStageIdx = STAGES.indexOf(currentStage as any);
  const progressPercent = currentStageIdx >= 0 ? (currentStageIdx / (STAGES.length - 1)) * 100 : 0;
  const pendingCp = state?.checkpoints ? state.checkpoints.find((c: Checkpoint) => c.status === "PENDING") : null;
  const activeTasks = state?.tasks || [];
  const blockers = state?.blockers || [];
  const decisions = state?.decisions ? [...state.decisions].slice(-5).reverse() : [];

  return (
    <div style={{ maxWidth: "1300px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <header className="glass-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="pulse-dot"></span>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 800, letterSpacing: "-0.02em" }}>Continuity Core Dashboard</h1>
            <span className="badge badge-purple">{selectedWorkspace?.name || selectedWorkspaceId || "default"}</span>
            <span className="badge badge-blue">Multi-Workspace Registry</span>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "4px" }}>
            Authoritative local workflow & lane monitor • Read-Only Multi-Workspace Registry
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          {error && <span className="badge badge-rose">{error}</span>}
          <div className="badge badge-blue mono">
            git: {git ? git.branch || "main" : "main"} {git ? (git.clean ? "✓ clean" : `● ${(git.modifiedFiles || []).length} modified`) : ""}
          </div>
          <div className="badge badge-green" title={`Last synced: ${lastSync.toLocaleTimeString()}`}>
            Live 2.5s poll
          </div>
        </div>
      </header>

      {/* Workspaces Registry Section */}
      <div className="glass-card" style={{ padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Allowed Workspaces Registry ({workspaces.length})
            </span>
            <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "2px" }}>
              Explicitly allowed local workspaces. No disk scanning. Click a workspace to view workflow lane.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
          {workspaces.map(ws => {
            const isSelected = ws.id === selectedWorkspaceId;
            const isUnavailable = ws.status === "UNAVAILABLE";
            return (
              <div
                key={ws.id}
                onClick={() => setSelectedWorkspaceId(ws.id)}
                style={{
                  background: isSelected ? "rgba(56, 189, 248, 0.12)" : "rgba(15, 23, 42, 0.6)",
                  border: isSelected ? "2px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "10px",
                  padding: "14px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.95rem", color: isSelected ? "#38bdf8" : "#f1f5f9" }}>
                    {ws.name}
                  </span>
                  <span className={`badge ${isUnavailable ? "badge-rose" : "badge-green"}`}>
                    {ws.status}
                  </span>
                </div>

                <div className="mono" style={{ fontSize: "0.75rem", color: "#94a3b8", wordBreak: "break-all" }}>
                  {ws.path}
                </div>

                {isUnavailable ? (
                  <div style={{ fontSize: "0.78rem", color: "#fb7185", background: "rgba(244, 63, 94, 0.1)", padding: "6px 8px", borderRadius: "6px" }}>
                    ⚠️ {ws.error || "Directory not available"}
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                    <span className="badge badge-blue mono" style={{ fontSize: "0.7rem" }}>
                      Stage: {ws.stage || "IDLE"}
                    </span>
                    {ws.currentChangeId && (
                      <span className="badge badge-purple mono" style={{ fontSize: "0.7rem" }}>
                        {ws.currentChangeId}
                      </span>
                    )}
                    <span className="badge badge-blue mono" style={{ fontSize: "0.7rem" }}>
                      Tasks: {ws.tasksCount ?? 0}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* If current workspace is UNAVAILABLE, show safe alert */}
      {selectedWorkspace?.status === "UNAVAILABLE" ? (
        <div className="glass-card" style={{ borderColor: "rgba(244, 63, 94, 0.4)", background: "rgba(244, 63, 94, 0.1)", textAlign: "center", padding: "30px" }}>
          <h3 style={{ color: "#fb7185", marginBottom: "8px" }}>Workspace Unavailable</h3>
          <p style={{ color: "#fecdd3", fontSize: "0.9rem" }}>
            The selected workspace path <code className="mono">{selectedWorkspace.path}</code> cannot be accessed ({selectedWorkspace.error || "Directory does not exist"}).
          </p>
        </div>
      ) : (
        <>
          {/* Stage Lane */}
          <div className="glass-card" style={{ padding: "28px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Workflow Stage Lane ({selectedWorkspace?.name || selectedWorkspaceId})
              </span>
              <span className="badge badge-blue">Active Stage: {currentStage}</span>
            </div>
            <div className="lane-container">
              <div className="lane-line">
                <div className="lane-line-progress" style={{ width: `${progressPercent}%` }}></div>
              </div>
              {STAGES.map((s, idx) => {
                const isActive = s === currentStage;
                const isPassed = idx < currentStageIdx;
                const stepClass = `lane-step${isActive ? " active" : ""}${isPassed ? " passed" : ""}`;
                return (
                  <div key={s} className={stepClass}>
                    <div className="lane-circle">{isPassed ? "✓" : idx + 1}</div>
                    <span
                      style={{
                        marginTop: "10px",
                        fontSize: "0.75rem",
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? "#38bdf8" : isPassed ? "#22c55e" : "var(--text-muted)"
                      }}
                    >
                      {s}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Blockers */}
          {blockers.length > 0 && (
            <div className="glass-card" style={{ borderColor: "rgba(244, 63, 94, 0.4)", background: "rgba(244, 63, 94, 0.1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className="badge badge-rose">Active Blockers ({blockers.length})</span>
                <span style={{ color: "#fecdd3", fontSize: "0.9rem", fontWeight: 600 }}>Workflow transitions and approvals are currently gated.</span>
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
                {blockers.map((b: string) => (
                  <span key={b} className="badge badge-rose mono">{b}</span>
                ))}
              </div>
            </div>
          )}

          {/* Grid: Tasks & Checkpoints */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: "24px" }}>
            {/* Tasks Card */}
            <div className="glass-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Active Tasks ({activeTasks.length})</h3>
                <span className="badge badge-purple mono">{state?.currentChangeId || "No active change"}</span>
              </div>
              <div>
                {activeTasks.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", padding: "20px 0", textAlign: "center" }}>
                    No registered tasks. Workflow is in idle stage.
                  </p>
                ) : (
                  activeTasks.map((t: WorkflowTask) => (
                    <div
                      key={t.id}
                      style={{
                        background: "rgba(15, 23, 42, 0.6)",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        borderRadius: "10px",
                        padding: "14px",
                        marginBottom: "12px"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <span className="mono" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#38bdf8" }}>{t.id}</span>
                        <span className={`badge ${t.status === "done" ? "badge-green" : "badge-amber"}`}>{t.status}</span>
                      </div>
                      <p style={{ fontSize: "0.85rem", color: "#e2e8f0", marginBottom: "8px" }}>{t.description}</p>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {(t.keywords || []).map((k: string) => (
                          <span key={k} className="badge badge-blue mono" style={{ fontSize: "0.68rem", padding: "2px 6px" }}>{k}</span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Checkpoint Card */}
            <div className="glass-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Review Checkpoints</h3>
                {pendingCp && <span className="badge badge-amber">Action Required</span>}
              </div>
              {pendingCp ? (
                <div style={{ background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "10px", padding: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span className="badge badge-amber mono">{pendingCp.type}</span>
                    <span className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{pendingCp.id}</span>
                  </div>
                  <p style={{ fontSize: "0.9rem", color: "#fef3c7", marginBottom: "10px" }}>{pendingCp.payload}</p>
                  <span style={{ fontSize: "0.75rem", color: "#d97706" }}>Created: {new Date(pendingCp.createdAt).toLocaleTimeString()}</span>
                </div>
              ) : (
                <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", padding: "20px 0", textAlign: "center" }}>
                  No pending checkpoints.
                </p>
              )}

              <div style={{ marginTop: "20px" }}>
                <h4 style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "10px" }}>
                  Audit Log & Decisions
                </h4>
                <div style={{ maxHeight: "220px", overflowY: "auto" }}>
                  {decisions.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>No decisions logged yet.</p>
                  ) : (
                    decisions.map((d: Decision, i: number) => (
                      <div
                        key={i}
                        style={{
                          fontSize: "0.8rem",
                          padding: "8px",
                          background: "rgba(15, 23, 42, 0.4)",
                          borderRadius: "6px",
                          borderLeft: "3px solid #38bdf8",
                          marginBottom: "8px"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: "0.7rem" }}>
                          <span>{d.actor} • {d.decision}</span>
                          <span>{new Date(d.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p style={{ marginTop: "4px", color: "#cbd5e1" }}>{d.reasoning}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Artifacts Browser */}
          <div className="glass-card">
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "14px" }}>
              Allowlisted Workspace Artifacts ({artifacts.length})
            </h3>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
              {artifacts.map((a: string) => {
                const isSelected = selectedArtifact === a;
                return (
                  <button
                    key={a}
                    onClick={() => viewArtifact(a)}
                    className="badge badge-blue mono"
                    style={{
                      cursor: "pointer",
                      background: isSelected ? "#0284c7" : "rgba(56, 189, 248, 0.1)",
                      color: isSelected ? "#ffffff" : "#38bdf8",
                      border: isSelected ? "1px solid #38bdf8" : "1px solid rgba(56, 189, 248, 0.3)"
                    }}
                  >
                    {a}
                  </button>
                );
              })}
            </div>

            {selectedArtifact && (
              <div style={{ marginTop: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span className="mono" style={{ fontSize: "0.8rem", color: "#38bdf8" }}>{selectedArtifact}</span>
                  <button
                    onClick={closeArtifact}
                    style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "0.8rem" }}
                  >
                    ✕ Close
                  </button>
                </div>
                {loadingArtifact ? (
                  <div style={{ padding: "14px", color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading artifact...</div>
                ) : (
                  <pre
                    className="mono"
                    style={{
                      background: "#020617",
                      padding: "14px",
                      borderRadius: "8px",
                      fontSize: "0.8rem",
                      overflowX: "auto",
                      maxHeight: "340px",
                      color: "#e2e8f0",
                      whiteSpace: "pre-wrap"
                    }}
                  >
                    {artifactContent}
                  </pre>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
