import { lineLabel } from "./industry-context";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCheck,
  ChevronRight,
  Database,
  Download,
  FileText,
  GitBranch,
  Layers3,
  Pause,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Square,
  Workflow,
} from "lucide-react";
import { api, date } from "./api";
import type { AgentRun, AgentConfig, AgentTask } from "./agent-model";
import { FieldDialog } from "./field-ui";
import "./agents.css";
import { AgentModulesPage } from "./agent-modules-page";
const labels: Record<string, string> = {
  queued: "대기",
  running: "실행 중",
  completed: "완료",
  awaiting_approval: "검토 대기",
  pending: "승인 대기",
  paused: "일시중지",
  cancelled: "취소됨",
  failed: "실패",
};
const metricNames: Record<string, string> = {
  assets: "설비",
  events: "수집 이벤트",
  warnings: "임계값 초과",
  baseline_ea: "기준 생산량 (ea)",
  scenario_ea: "변경 가정 생산량 (ea)",
  cycle_time: "병목 주기 (s)",
  good: "설비 양품 (ea)",
  rejected: "설비 불량 (ea)",
  quality: "누적 양품률 (%)",
  idle_robots: "대기 AMR",
  unpublished_panels: "미게시 패널",
  cameras: "카메라 설정",
  requests: "현장 입력",
};
function RunStatus({ value }: { value: string }) {
  return (
    <span className={`agent-status ${value}`}>
      <i />
      {labels[value] || value}
    </span>
  );
}
export function AgentWorkspace({
  write,
  admin,
  revision,
  action,
  approvalContent,
}: {
  write: boolean;
  admin: boolean;
  revision: number;
  action: (path: string, body: unknown, message: string) => Promise<unknown>;
  approvalContent: ReactNode;
}) {
  const [tab, setTab] = useState<"runs" | "approvals" | "modules">("runs"),
    [runs, setRuns] = useState<AgentRun[]>([]),
    [run, setRun] = useState<AgentRun | null>(null),
    [selected, setSelected] = useState(""),
    [config, setConfig] = useState<AgentConfig | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [goal, setGoal] = useState(
      "선택한 라인의 생산·품질·설비 상태를 분석하고 필요한 점검 작업을 제안해주세요.",
    ),
    [line, setLine] = useState("A"),
    [mode, setMode] = useState("tools"),
    [node, setNode] = useState("equipment"),
    [view, setView] = useState<"execution" | "assets" | "traces">("execution"),
    [settingsOpen, setSettingsOpen] = useState(false),
    [concurrency, setConcurrency] = useState(3),
    [selectedModules, setSelectedModules] = useState<string[] | null>(null);
  const load = () =>
    Promise.all([
      api<AgentRun[]>("/agents/runs"),
      api<AgentConfig>("/agents/config"),
    ])
      .then(([runs, config]) => {
        setRuns(runs);
        setConfig(config);
        setConcurrency(config.concurrency);
        setSelected((id) => id || runs[0]?.id || "");
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, [revision]);
  useEffect(() => {
    if (!selected) {
      setRun(null);
      return;
    }
    let alive = true,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api<AgentRun>(`/agents/runs/${selected}`);
        if (!alive) return;
        setRun(result);
        setNode((id) =>
          result.tasks.some((t) => t.id === id)
            ? id
            : result.tasks.find((t) => t.id !== "planner")?.id || "planner",
        );
        setRuns((rows) => rows.map((r) => (r.id === result.id ? result : r)));
        if (["queued", "running", "awaiting_approval"].includes(result.status))
          timer = setTimeout(
            poll,
            result.status === "awaiting_approval" ? 4000 : 900,
          );
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [selected, revision]);
  async function create(agentIds?: string[]) {
    setBusy(true);
    setError("");
    try {
      const result = await api<AgentRun>("/agents/runs", {
        goal,
        line,
        mode,
        agent_ids: agentIds || selectedModules || undefined,
      });
      setRuns((rows) => [result, ...rows]);
      setSelected(result.id);
      setRun(result);
      setNode(
        agentIds?.[0] ||
          (result.modules?.some((m) => m.id === "equipment")
            ? "equipment"
            : result.modules?.[0]?.id || "data"),
      );
      setTab("runs");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function control(command: string) {
    if (!run) return;
    setBusy(true);
    try {
      const result = await api<AgentRun>(`/agents/runs/${run.id}/control`, {
        action: command,
      });
      setRun(result);
      setSelected("");
      queueMicrotask(() => setSelected(result.id));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function exportReport() {
    if (!run) return;
    const text =
      `# ${run.goal}\n\n실행 ${run.id} · ${run.line}라인 · ${run.mode === "tools" ? "제조 도구 모드" : run.model}\n\n${run.report?.summary || ""}\n\n` +
      Object.entries(run.blackboard || {})
        .map(
          ([id, fact]) =>
            `## ${run.tasks.find((t) => t.id === id)?.name || id}\n\n${fact.summary}\n\n${fact.findings.map((f) => "- " + f).join("\n")}\n\n근거: ${fact.evidence.join(", ")}\n`,
        )
        .join("\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/markdown;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = run.id + "-report.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const fact = run?.blackboard?.[node],
    activeTask = run?.tasks.find((t) => t.id === node);
  return (
    <>
      <div className="agent-workspace-tabs">
        <button
          className={tab === "runs" ? "selected" : ""}
          onClick={() => setTab("runs")}
        >
          <Workflow size={15} />
          멀티 에이전트 워크스페이스
        </button>
        <button
          className={tab === "approvals" ? "selected" : ""}
          onClick={() => setTab("approvals")}
        >
          <ShieldCheck size={15} />
          작업 제안 · 승인
        </button>
        <button
          className={tab === "modules" ? "selected" : ""}
          onClick={() => setTab("modules")}
        >
          <Bot size={15} />
          기능별 에이전트
        </button>
      </div>
      {tab === "approvals" ? (
        approvalContent
      ) : tab === "modules" ? (
        <AgentModulesPage
          admin={admin}
          write={write}
          onChanged={() => void load()}
          onRun={(id) => void create([id])}
        />
      ) : (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">MANUFACTURING AGENT CONTROL PLANE</div>
              <h1>전문 에이전트가 함께 읽는 공장.</h1>
              <p>
                Planner가 배치하고, 전문 워커가 분석하고, 담당자가 실행을
                결정합니다.
              </p>
            </div>
            <button
              className="btn"
              disabled={!admin}
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 size={15} />
              실행 설정
            </button>
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="agent-architecture-ribbon">
            <span>
              <GitBranch size={17} />
              <b>목표 · Planner</b>
            </span>
            <ArrowRight size={14} />
            <span>
              <Bot size={17} />
              <b>
                기능 에이전트 ×{" "}
                {config?.roles?.filter(
                  (m) => m.enabled && m.compatible !== false,
                ).length || 0}
              </b>
            </span>
            <ArrowRight size={14} />
            <span>
              <Database size={17} />
              <b>공유 사실 · 이중 그래프</b>
            </span>
            <ArrowRight size={14} />
            <span>
              <ShieldCheck size={17} />
              <b>Main · 승인 게이트</b>
            </span>
          </div>
          <section className="panel agent-create">
            <div>
              <span className="subtle-label">NEW MANUFACTURING MISSION</span>
              <h2>라인 진단 목표</h2>
              <p>필요한 기능을 선택하면 선행 에이전트를 포함해 실행합니다.</p>
            </div>
            <textarea
              aria-label="에이전트 진단 목표"
              maxLength={500}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={!write}
            />
            <div className="agent-create-options">
              <label>
                대상 라인
                <select value={line} onChange={(e) => setLine(e.target.value)}>
                  <option value="A">{lineLabel("A")}</option>
                  <option value="B">{lineLabel("B")}</option>
                </select>
              </label>
              <label>
                분석 엔진
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="tools">제조 도구 에이전트</option>
                  <option
                    value="ollama"
                    disabled={!admin || !config?.llm_configured}
                  >
                    로컬 LLM + 제조 도구
                    {!config?.llm_configured ? " · 미연결" : ""}
                  </option>
                </select>
              </label>
              <button
                className="btn primary"
                disabled={
                  !write ||
                  busy ||
                  goal.trim().length < 5 ||
                  selectedModules?.length === 0
                }
                onClick={() => void create()}
              >
                <Play size={15} />
                {busy ? "진단 요청 중…" : "에이전트 진단 실행"}
              </button>
            </div>
          </section>
          <details className="panel agent-module-picker">
            <summary>
              실행할 에이전트 선택{" "}
              <span>
                {selectedModules
                  ? selectedModules.length
                  : config?.roles?.filter(
                      (m) => m.enabled && m.compatible !== false,
                    ).length || 0}
                개 선택 · 선행 의존성 자동 포함
              </span>
            </summary>
            <div>
              {config?.roles?.map((m) => (
                <label className="check-row" key={m.id}>
                  <input
                    type="checkbox"
                    disabled={
                      !m.enabled || m.compatible === false || m.id === "data"
                    }
                    checked={
                      m.enabled &&
                      m.compatible !== false &&
                      (
                        selectedModules ||
                        config.roles
                          .filter((r) => r.enabled && r.compatible !== false)
                          .map((r) => r.id)
                      ).includes(m.id)
                    }
                    onChange={(e) =>
                      setSelectedModules((ids) =>
                        e.target.checked
                          ? [
                              ...(ids ||
                                config.roles
                                  .filter(
                                    (r) => r.enabled && r.compatible !== false,
                                  )
                                  .map((r) => r.id)),
                              m.id,
                            ]
                          : (
                              ids ||
                              config.roles
                                .filter(
                                  (r) => r.enabled && r.compatible !== false,
                                )
                                .map((r) => r.id)
                            ).filter((id) => id !== m.id),
                      )
                    }
                  />
                  {m.name}
                  {!m.enabled && <small>중지됨</small>}
                </label>
              ))}
            </div>
            <button
              className="btn small-btn"
              onClick={() => setSelectedModules(null)}
            >
              사용 중인 전체 에이전트 선택
            </button>
          </details>
          <div className="agent-run-layout">
            <aside className="agent-run-list">
              <div className="agent-list-title">
                <span>MISSION HISTORY</span>
                <button
                  className="icon-button"
                  aria-label="진단 이력 새로고침"
                  onClick={() => void load()}
                >
                  <RefreshCw size={13} />
                </button>
              </div>
              {runs.map((r) => (
                <button
                  key={r.id}
                  className={`agent-run-card ${selected === r.id ? "selected" : ""}`}
                  onClick={() => setSelected(r.id)}
                >
                  <div>
                    <span>{r.line} LINE</span>
                    <RunStatus value={r.status} />
                  </div>
                  <h3>{r.goal}</h3>
                  <p>{r.id}</p>
                  <footer>
                    <span>{r.mode === "tools" ? "도구 기반" : "LLM 연계"}</span>
                    <time>{date(r.created_at)}</time>
                  </footer>
                </button>
              ))}
              {!runs.length && (
                <div className="agent-no-runs">
                  <Bot size={30} />
                  <p>첫 진단을 시작하세요.</p>
                </div>
              )}
            </aside>
            <div className="agent-run-details">
              {run ? (
                <>
                  <section className="panel agent-execution">
                    <div className="panel-header">
                      <div>
                        <h2>
                          진단 실행
                          <RunStatus value={run.status} />
                        </h2>
                        <p>
                          {run.id} · {run.line}라인 · 동시 워커 최대{" "}
                          {run.concurrency}개
                        </p>
                      </div>
                      <div className="agent-run-actions">
                        {["queued", "running"].includes(run.status) && (
                          <button
                            className="btn small-btn"
                            disabled={!write || busy}
                            onClick={() => control("pause")}
                          >
                            <Pause size={13} />
                            일시중지
                          </button>
                        )}
                        {run.status === "paused" && (
                          <button
                            className="btn small-btn"
                            disabled={!write || busy}
                            onClick={() => control("resume")}
                          >
                            <Play size={13} />
                            재개
                          </button>
                        )}
                        {["queued", "running", "paused"].includes(
                          run.status,
                        ) && (
                          <button
                            className="btn small-btn"
                            disabled={!write || busy}
                            onClick={() => control("cancel")}
                          >
                            <Square size={12} />
                            취소
                          </button>
                        )}
                        <button
                          className="btn small-btn"
                          disabled={!run.report}
                          onClick={exportReport}
                        >
                          <Download size={13} />
                          보고서
                        </button>
                      </div>
                    </div>
                    <div className="agent-graph-tabs">
                      <button
                        className={view === "execution" ? "selected" : ""}
                        onClick={() => setView("execution")}
                      >
                        <Workflow size={13} />
                        실행 그래프
                      </button>
                      <button
                        className={view === "assets" ? "selected" : ""}
                        onClick={() => setView("assets")}
                      >
                        <Layers3 size={13} />
                        공유 자산
                      </button>
                      <button
                        className={view === "traces" ? "selected" : ""}
                        onClick={() => setView("traces")}
                      >
                        <Activity size={13} />
                        도구 기록
                      </button>
                    </div>
                    {view === "execution" ? (
                      <ExecutionGraph
                        tasks={run.tasks}
                        selected={node}
                        onSelect={setNode}
                      />
                    ) : view === "assets" ? (
                      <div className="agent-asset-graph">
                        <div className="asset-graph-root">
                          <FactoryIcon />
                          {run.line} LINE <small>진단 범위</small>
                        </div>
                        <div className="agent-asset-nodes">
                          {run.knowledge_graph?.nodes
                            .filter((n) => n.kind !== "line")
                            .map((n) => (
                              <div key={n.id}>
                                <span>{n.kind.toUpperCase()}</span>
                                <b>{n.id}</b>
                                <small>{n.label}</small>
                              </div>
                            ))}
                        </div>
                        <p>
                          라인 → 설비·작업·패널·카메라. 각 워커의 근거 ID가 이
                          자산 그래프에 연결됩니다.
                        </p>
                      </div>
                    ) : (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>워커 / 도구</th>
                              <th>소요 시간</th>
                              <th>실행 결과</th>
                            </tr>
                          </thead>
                          <tbody>
                            {run.traces?.map((trace, i) => (
                              <tr key={trace.id + i}>
                                <td>
                                  <b>{trace.tool}</b>
                                  <small className="block muted">
                                    {trace.agent}
                                  </small>
                                </td>
                                <td>{trace.elapsed_ms.toFixed(2)} ms</td>
                                <td className="agent-trace-summary">
                                  {trace.summary}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!run.traces?.length && (
                          <div className="agent-empty">
                            아직 실행된 도구가 없습니다.
                          </div>
                        )}
                      </div>
                    )}
                    <div className="agent-engine-label">
                      <Bot size={13} />
                      {run.mode === "tools"
                        ? "제조 도구 모드 · LLM 호출 없음"
                        : `Ollama · ${run.model} · 도구 사실과 모델 해석 구분`}
                      <span>
                        원시 사고 과정 대신 도구 결과와 근거를 기록합니다.
                      </span>
                    </div>
                  </section>
                  <section className="panel agent-blackboard">
                    <div className="panel-header">
                      <div>
                        <h2>공유 블랙보드</h2>
                        <p>
                          워커가 남긴 사실을 선택해 수치와 근거를 확인하세요.
                        </p>
                      </div>
                      <Database size={17} />
                    </div>
                    <div className="agent-fact-tabs">
                      {run.tasks
                        .filter((t) => t.id !== "approval")
                        .map((t) => (
                          <button
                            key={t.id}
                            className={node === t.id ? "selected" : ""}
                            onClick={() => setNode(t.id)}
                          >
                            <i className={t.status} />
                            {t.id === "planner"
                              ? "Planner"
                              : t.id === "main"
                                ? "Main"
                                : t.name.replace(" 에이전트", "")}
                          </button>
                        ))}
                    </div>
                    {fact ? (
                      <div className="agent-fact-body">
                        <div className="agent-fact-heading">
                          <span className="agent-avatar">
                            <Bot size={22} />
                          </span>
                          <div>
                            <h3>{activeTask?.name}</h3>
                            <small>
                              {activeTask?.tool}
                              {activeTask?.module_revision
                                ? ` · 구성 v${activeTask.module_revision}`
                                : ""}
                            </small>
                          </div>
                          <RunStatus
                            value={activeTask?.status || "completed"}
                          />
                        </div>
                        <p className="agent-fact-summary">{fact.summary}</p>
                        {fact.metrics && (
                          <div className="agent-fact-metrics">
                            {Object.entries(fact.metrics).map(
                              ([key, value]) => (
                                <div key={key}>
                                  <span>{metricNames[key] || key}</span>
                                  <b>
                                    {new Intl.NumberFormat("ko-KR", {
                                      maximumFractionDigits: 2,
                                    }).format(value)}
                                  </b>
                                </div>
                              ),
                            )}
                          </div>
                        )}
                        <ul>
                          {fact.findings.map((finding, i) => (
                            <li key={i}>{finding}</li>
                          ))}
                        </ul>
                        {fact.llm && (
                          <div className="agent-llm-note">
                            <span>로컬 LLM 해석 · {run.model}</span>
                            <p>{fact.llm.summary}</p>
                            <small>
                              입력 {fact.llm.input_tokens ?? "미보고"} / 출력{" "}
                              {fact.llm.output_tokens ?? "미보고"} 토큰
                            </small>
                          </div>
                        )}
                        <div className="agent-evidence">
                          <span>근거 자산</span>
                          {fact.evidence.map((id) => (
                            <span className="code-tag" key={id}>
                              {id}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="agent-empty">
                        이 워커의 실행 결과를 기다리고 있습니다.
                      </div>
                    )}
                  </section>
                  {run.report && (
                    <section className="panel agent-final-report">
                      <div className="panel-header">
                        <h2>
                          <FileText size={16} />
                          Main Agent 진단 보고서
                        </h2>
                        <span className="label neutral">근거 기반 요약</span>
                      </div>
                      <p>{run.report.summary}</p>
                      {run.approvals.length > 0 && (
                        <div className="agent-approval-cards">
                          {run.approvals.map((approval) => (
                            <article key={approval.id}>
                              <div>
                                <ShieldCheck size={19} />
                                <h3>{approval.name}</h3>
                                <RunStatus
                                  value={
                                    approval.status === "approved" ||
                                    approval.status === "rejected"
                                      ? "completed"
                                      : "pending"
                                  }
                                />
                              </div>
                              <p>{approval.reason}</p>
                              <span>{approval.impact}</span>
                              {approval.status === "pending" ? (
                                <footer>
                                  <small>
                                    {admin
                                      ? "승인 시 예방 점검 작업이 생성됩니다."
                                      : "관리자 승인이 필요합니다."}
                                  </small>
                                  <button
                                    className="btn small-btn"
                                    disabled={!admin || busy}
                                    onClick={async () => {
                                      setBusy(true);
                                      try {
                                        await action(
                                          `/recommendations/${approval.id}/decision`,
                                          { decision: "reject" },
                                          "제안을 반려했습니다.",
                                        );
                                      } finally {
                                        setBusy(false);
                                      }
                                    }}
                                  >
                                    반려
                                  </button>
                                  <button
                                    className="btn primary small-btn"
                                    disabled={!admin || busy}
                                    onClick={async () => {
                                      setBusy(true);
                                      try {
                                        await action(
                                          `/recommendations/${approval.id}/decision`,
                                          { decision: "approve" },
                                          "승인하고 점검 작업을 생성했습니다.",
                                        );
                                      } finally {
                                        setBusy(false);
                                      }
                                    }}
                                  >
                                    <CheckCheck size={13} />
                                    승인 및 작업 생성
                                  </button>
                                </footer>
                              ) : (
                                <footer>
                                  <small>
                                    {approval.status === "approved"
                                      ? "승인 완료"
                                      : "반려 완료"}
                                  </small>
                                </footer>
                              )}
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  )}
                  {run.error && <div className="form-error">{run.error}</div>}
                </>
              ) : (
                <div className="panel agent-welcome">
                  <Workflow size={45} />
                  <h2>하나의 목표, 연결된 전문성.</h2>
                  <p>
                    왼쪽에서 실행을 선택하거나 새로운 라인 진단을 시작하세요.
                  </p>
                  <div>
                    <span>Planner</span>
                    <ChevronRight size={14} />
                    <span>기능별 Agents</span>
                    <ChevronRight size={14} />
                    <span>Main & Approval</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {settingsOpen && (
        <FieldDialog
          title="멀티 에이전트 실행 설정"
          onClose={() => setSettingsOpen(false)}
        >
          <form
            className="form-body"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api("/agents/settings", { concurrency });
                await load();
                setSettingsOpen(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              동시 전문 워커
              <select
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}개
                  </option>
                ))}
              </select>
            </label>
            <div className="info-banner">
              <Bot size={20} />
              <div>
                <strong>
                  {config?.llm_configured
                    ? `로컬 LLM 설정됨 · ${config.model}`
                    : "로컬 LLM 미연결"}
                </strong>
                <p>
                  백엔드의 LLM_BASE_URL과 LLM_MODEL로 Ollama를 연결할 수
                  있습니다. 제공자가 없는 경우 제조 도구 모드를 사용합니다.
                </p>
              </div>
            </div>
            <p className="field-dialog-description">
              도구는 데이터 조회·통계·용량 계산으로 제한됩니다. 현장 작업 생성은
              관리자 승인 후 진행됩니다.
            </p>
            <button className="btn primary" disabled={busy}>
              <Settings2 size={15} />
              설정 저장
            </button>
          </form>
        </FieldDialog>
      )}
    </>
  );
}
function FactoryIcon() {
  return <Database size={21} />;
}
function ExecutionGraph({
  tasks,
  selected,
  onSelect,
}: {
  tasks: AgentTask[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const depths: Record<string, number> = {};
  const depth = (id: string, seen = new Set<string>()): number => {
    if (id in depths) return depths[id];
    if (seen.has(id)) return 0;
    const task = tasks.find((t) => t.id === id);
    if (!task) return 0;
    seen.add(id);
    return (depths[id] = task.depends.length
      ? 1 + Math.max(...task.depends.map((d) => depth(d, new Set(seen))))
      : 0);
  };
  tasks.forEach((t) => depth(t.id));
  const layers: Array<AgentTask[]> = [];
  tasks.forEach((t) => {
    (layers[depths[t.id]] ||= []).push(t);
  });
  const positions: Record<string, [number, number]> = {},
    height = Math.max(180, ...layers.map((l) => l.length * 82 + 30)),
    width = layers.length * 205 + 10;
  layers.forEach((layer, col) =>
    layer.forEach((task, row) => {
      positions[task.id] = [
        15 + col * 205,
        (height - layer.length * 82) / 2 + row * 82,
      ];
    }),
  );
  return (
    <div className="agent-execution-graph">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          minWidth: Math.max(760, width),
          height: Math.max(300, height),
        }}
        aria-label="Planner, 데이터 워커, 병렬 전문 워커, Main, 승인 게이트의 실행 그래프"
      >
        {tasks.flatMap((t) =>
          t.depends.map((dep) => {
            const from = positions[dep],
              to = positions[t.id];
            if (!from || !to) return null;
            return (
              <path
                key={dep + "-" + t.id}
                d={`M${from[0] + 154} ${from[1] + 29} C${(from[0] + 154 + to[0]) / 2} ${from[1] + 29}, ${(from[0] + 154 + to[0]) / 2} ${to[1] + 29}, ${to[0]} ${to[1] + 29}`}
                fill="none"
                stroke={t.status === "completed" ? "#bdded1" : "#dce5f2"}
                strokeWidth="2"
              />
            );
          }),
        )}
        {tasks.map((t) => {
          const [x, y] = positions[t.id] || [15, 10];
          return (
            <g
              key={t.id}
              className={`agent-graph-node ${t.status} ${selected === t.id ? "selected" : ""}`}
              transform={`translate(${x} ${y})`}
              role="button"
              tabIndex={0}
              aria-label={`${t.name} ${labels[t.status] || t.status}`}
              onClick={() => onSelect(t.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSelect(t.id);
                }
              }}
            >
              <rect width="154" height="60" rx="10" />
              <circle cx="17" cy="21" r="3" />
              <text x="29" y="25">
                {t.id === "planner"
                  ? "Planner"
                  : t.id === "main"
                    ? "Main Agent"
                    : t.id === "approval"
                      ? "승인 게이트"
                      : t.name.replace(" 에이전트", "").slice(0, 14)}
              </text>
              <text className="graph-node-status" x="17" y="45">
                {labels[t.status] || t.status}
              </text>
              <text
                className="graph-node-order"
                x="137"
                y="45"
                textAnchor="end"
              >
                {t.elapsed_ms !== undefined
                  ? `${t.elapsed_ms.toFixed(1)} ms`
                  : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
