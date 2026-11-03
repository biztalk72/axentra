import type { ManufacturingSource } from "./panel-model";
import type { BrowserDemoAuth } from "./demo-auth";
import { AGENT_ROLES } from "./agent-model.ts";
import type { AgentFact, AgentRun, AgentConfig } from "./agent-model";
import { panelDemoInventory } from "./panel-demo.ts";
import type { Resource } from "./api";
const KEY = "forge-ax-manufacturing-agents-v1";
type StoredRun = AgentRun & {
  context: ManufacturingSource;
  recommendation_ids: string[];
};
function store(): { runs: StoredRun[]; concurrency: number } {
  const value = localStorage.getItem(KEY);
  return value ? JSON.parse(value) : { runs: [], concurrency: 3 };
}
const now = () => new Date().toISOString();
function facts(
  id: string,
  source: ManufacturingSource,
  line: string,
): AgentFact {
  const assets = source.assets.filter((a) => a.line === line),
    ids = assets.map((a) => a.id),
    orders = (source.resources.order || []).filter((o) => o.line === line),
    inventory = panelDemoInventory();
  if (id === "data")
    return {
      summary: `${line}라인 설비 ${assets.length}대, 최근 이벤트 ${source.events.filter((e) => ids.includes(e.asset_id)).slice(-200).length}건의 공통 스냅샷을 확인했습니다.`,
      evidence: ids,
      findings: ["모든 워커가 같은 시점의 데이터 스냅샷을 사용합니다."],
      metrics: {
        assets: assets.length,
        events: source.events
          .filter((e) => ids.includes(e.asset_id))
          .slice(-200).length,
      },
    };
  if (id === "equipment") {
    const warnings = assets.filter(
      (a) => a.temperature > 75 || a.vibration > 3.5,
    );
    return {
      summary: `운영 임계값을 초과한 설비가 ${warnings.length}대입니다.`,
      evidence: warnings.length ? warnings.map((a) => a.id) : ids,
      findings: assets.map(
        (a) =>
          `${a.id}: ${a.temperature.toFixed(1)}°C / ${a.vibration.toFixed(2)} mm/s`,
      ),
      metrics: { warnings: warnings.length },
      maintenance_assets: warnings.map((a) => a.id),
    };
  }
  if (id === "production") {
    const b = [...assets].sort((a, b) => b.cycle_time - a.cycle_time)[0],
      active = orders.filter((o) => o.status === "running");
    return {
      summary: `병목 주기 설비는 ${b.id}입니다. 진행 중 작업은 ${active.length}건입니다.`,
      evidence: [b.id, ...active.map((o) => o.id)],
      metrics: {
        baseline_ea: Math.floor(((8 * 3600) / b.cycle_time) * 0.9 * 0.98),
        scenario_ea: Math.floor(
          ((8 * 3600) / (b.cycle_time * 0.85)) * 0.95 * 0.985,
        ),
        cycle_time: b.cycle_time,
      },
      findings: [
        "8시간·직렬 공정 용량 모델. 기준 비가동 10%/불량 2%, 변경 주기 15% 단축/비가동 5%/불량 1.5%. 실제 성능 보장 아님.",
      ],
    };
  }
  if (id === "quality") {
    const good = assets.reduce((s, a) => s + a.produced, 0),
      rejected = assets.reduce((s, a) => s + a.rejected, 0),
      quality = Number(
        ((good / Math.max(good + rejected, 1)) * 100).toFixed(2),
      );
    return {
      summary: `설비 누적 양품률은 ${quality}%입니다.`,
      evidence: ids,
      findings: [
        "전체 설비 처리 수량 기준. 고장 예측 정확도나 완제품 합산 실적이 아닙니다.",
      ],
      metrics: { good, rejected, quality },
    };
  }
  const panels = inventory.panels.filter((p) => p.draft.line === line),
    cameras = inventory.cameras.filter((c) => c.line === line),
    idle = (source.resources.robot || []).filter(
      (r) => r.status === "idle",
    ).length;
  return {
    summary: `공용 AMR ${idle}대 대기, 미게시 패널 ${panels.filter((p) => !p.published).length}개를 확인했습니다.`,
    evidence: [...panels.map((p) => p.id), ...cameras.map((c) => c.id)],
    metrics: {
      idle_robots: idle,
      unpublished_panels: panels.filter((p) => !p.published).length,
      cameras: cameras.length,
      requests: (source.resources.panel_event || []).filter(
        (e) => e.line === line,
      ).length,
    },
    findings: [
      "카메라 설정과 재생 상태는 별개입니다. 모의 영상은 실제 관측 근거가 아닙니다.",
    ],
  };
}
export async function agentDemoRequest<T>(
  path: string,
  body: any,
  context: {
    auth: BrowserDemoAuth;
    source: ManufacturingSource;
    record: (action: string, target: string, actor: string) => void;
    saveSource: () => void;
  },
): Promise<T> {
  const { auth, source } = context,
    user = auth.current(),
    db = store();
  const log = (action: string, id: string) => {
    context.record(action, id, user.email);
    context.saveSource();
  };
  const cfg: AgentConfig = {
    concurrency: db.concurrency,
    provider: "ollama",
    llm_configured: false,
    model: "",
    tools: AGENT_ROLES.map((r) => r.tool),
    max_nodes: 8,
    default_mode: "tools",
  };
  const publicRun = (run: StoredRun) => {
    const { context: _, recommendation_ids, ...rest } = run;
    rest.approvals = (source.resources.recommendation || [])
      .filter((r) => recommendation_ids.includes(r.id))
      .map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        reason: String(r.reason || ""),
        asset_id: String(r.asset_id || ""),
        impact: String(r.impact || ""),
      }));
    if (
      rest.status === "awaiting_approval" &&
      rest.approvals.length &&
      rest.approvals.every((r) => r.status !== "pending")
    ) {
      rest.status = "completed";
      rest.tasks = rest.tasks.map((n) =>
        n.id === "approval" ? { ...n, status: "completed" } : n,
      );
    }
    return structuredClone(rest);
  };
  const execute = (run: StoredRun) => {
    const began = performance.now();
    run.status = "running";
    run.blackboard = {
      planner: {
        summary: `${run.line}라인에서 데이터 확인 후 설비·생산·품질·현장 워커를 배치합니다.`,
        evidence: ["LINE-" + run.line],
        findings: ["고정된 제조 분석 DAG · 허용된 도구만 실행"],
      },
    };
    for (const role of AGENT_ROLES) {
      const start = performance.now(),
        result = facts(role.id, run.context, run.line);
      run.blackboard[role.id] = result;
      run.traces!.push({
        id: role.id,
        agent: role.id,
        tool: role.tool,
        status: "completed",
        timestamp: now(),
        elapsed_ms: Number((performance.now() - start).toFixed(2)),
        evidence: result.evidence,
        summary: result.summary,
      });
    }
    const recs: Resource[] = [];
    for (const aid of run.blackboard.equipment.maintenance_assets || []) {
      let rec = (source.resources.recommendation || []).find(
        (r) => r.asset_id === aid && r.status === "pending",
      );
      if (!rec) {
        rec = {
          id: "REC-" + crypto.randomUUID().slice(0, 8),
          name: `${aid} 예방 점검 작업 생성`,
          status: "pending",
          created_at: now(),
          asset_id: aid,
          reason: `${run.id} 설비 에이전트의 운영 임계값 초과 근거`,
          action: "maintenance",
          impact: "예방 점검 작업 생성 · 설비 자동 제어 없음",
          engine: "manufacturing-multi-agent-v1",
          run_id: run.id,
        };
        source.resources.recommendation.unshift(rec);
      }
      recs.push(rec);
    }
    run.recommendation_ids = recs.map((r) => r.id);
    run.report = {
      summary: `${run.line}라인 진단 완료. 운영 임계값 초과 ${recs.length}대, 관리자 검토 대상 ${recs.length}건입니다.`,
      evidence: run.context.assets
        .filter((a) => a.line === run.line)
        .map((a) => a.id),
      findings: AGENT_ROLES.map((r) => run.blackboard![r.id].summary),
    };
    run.blackboard.main = run.report;
    run.status = recs.length ? "awaiting_approval" : "completed";
    run.tasks.forEach((n) => {
      n.status = n.id === "approval" && recs.length ? "pending" : "completed";
      n.elapsed_ms =
        n.id === "main"
          ? Number((performance.now() - began).toFixed(2))
          : run.traces?.find((t) => t.id === n.id)?.elapsed_ms || 0;
    });
    run.finished_at = now();
    log("agent_run.finish", run.id);
  };
  let result: unknown;
  if (path === "/agents/config") result = cfg;
  else if (path === "/agents/settings") {
    auth.requireRole("admin");
    if (
      !Number.isInteger(body.concurrency) ||
      body.concurrency < 1 ||
      body.concurrency > 4
    )
      throw new Error("동시 워커는 1~4개입니다.");
    db.concurrency = body.concurrency;
    result = { ...cfg, concurrency: body.concurrency };
    log("agent.settings", "AGENT-SETTINGS");
  } else if (path === "/agents/runs" && body === undefined)
    result = db.runs.map(publicRun);
  else if (path === "/agents/runs") {
    auth.requireRole("admin", "operator");
    if (body.mode !== "tools")
      throw new Error("Pages에서는 제조 도구 모드만 실행할 수 있습니다.");
    if (
      !["A", "B"].includes(body.line) ||
      typeof body.goal !== "string" ||
      body.goal.trim().length < 5 ||
      body.goal.length > 500
    )
      throw new Error("라인과 진단 목표(5~500자)를 확인하세요.");
    const inventory = panelDemoInventory(),
      lineAssets = source.assets.filter((a) => a.line === body.line),
      nodes = [
        { id: "LINE-" + body.line, label: body.line + "라인", kind: "line" },
        ...lineAssets.map((a) => ({ id: a.id, label: a.name, kind: "asset" })),
        ...inventory.panels
          .filter((p) => p.draft.line === body.line)
          .map((p) => ({ id: p.id, label: p.draft.name, kind: "panel" })),
        ...inventory.cameras
          .filter((c) => c.line === body.line)
          .map((c) => ({ id: c.id, label: c.name, kind: "camera" })),
      ];
    const run: StoredRun = {
      id: "RUN-" + crypto.randomUUID().slice(0, 8),
      name: body.goal,
      goal: body.goal,
      line: body.line,
      mode: "tools",
      model: null,
      status: "queued",
      concurrency: db.concurrency,
      created_at: now(),
      created_by: user.email,
      context: structuredClone(source),
      recommendation_ids: [],
      tasks: [
        {
          id: "planner",
          name: "제조 Planner",
          tool: "planner.plan",
          depends: [],
          status: "queued",
        },
        ...AGENT_ROLES.map((r) => ({ ...r, status: "queued" })),
        {
          id: "main",
          name: "검토·보고 Main Agent",
          tool: "report.compose",
          depends: AGENT_ROLES.filter((r) => r.id !== "data").map((r) => r.id),
          status: "queued",
        },
        {
          id: "approval",
          name: "관리자 승인 게이트",
          tool: "maintenance.request",
          depends: ["main"],
          status: "queued",
        },
      ],
      blackboard: {},
      traces: [],
      approvals: [],
      knowledge_graph: {
        nodes,
        edges: nodes.slice(1).map((n) => ({
          source: "LINE-" + body.line,
          target: n.id,
          relation: "contains",
        })),
      },
    };
    db.runs.unshift(run);
    db.runs = db.runs.slice(0, 100);
    result = publicRun(run);
    log("agent_run.create", run.id);
  } else {
    const parts = path.split("/"),
      run = db.runs.find((r) => r.id === parts[3]);
    if (!run) throw new Error("진단 실행을 찾을 수 없습니다.");
    if (parts[4] === "control") {
      auth.requireRole("admin", "operator");
      const allowed: Record<string, string[]> = {
        pause: ["queued", "running"],
        resume: ["paused"],
        cancel: ["queued", "running", "paused"],
      };
      if (!allowed[body.action]?.includes(run.status))
        throw new Error("현재 상태에서 처리할 수 없습니다.");
      run.status = (
        { pause: "paused", resume: "queued", cancel: "cancelled" } as Record<
          string,
          string
        >
      )[String(body.action)]!;
      log("agent_run." + body.action, run.id);
    } else if (run.status === "queued") execute(run);
    result = publicRun(run);
  }
  localStorage.setItem(KEY, JSON.stringify(db));
  context.saveSource();
  return structuredClone(result) as T;
}
