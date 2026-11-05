import ramenAssetCatalog from "./supply/assets.json" with { type: "json" };
import type { ManufacturingSource } from "./panel-model.ts";
import type { BrowserDemoAuth } from "./demo-auth.ts";
import {
  assertConfigKeys,
  builtinModules,
  readModules,
  planModules,
  saveModule,
  createModule,
  validateModule,
} from "./agent-modules/registry.ts";
import { executeModule } from "./agent-modules/index.ts";
import { captureContext } from "./agent-modules/context.ts";
import type { AgentContext, AgentModule } from "./agent-modules/contracts.ts";
import type { AgentRun, AgentConfig } from "./agent-model.ts";
import { panelDemoInventory } from "./panel-demo.ts";
import type { Resource } from "./api.ts";
const KEY = "forge-ax-manufacturing-agents-v1";
type StoredRun = AgentRun & {
  context: AgentContext;
  recommendation_ids: string[];
};
function store(): { runs: StoredRun[]; concurrency: number } {
  const value = localStorage.getItem(KEY);
  return value ? JSON.parse(value) : { runs: [], concurrency: 3 };
}
const now = () => new Date().toISOString();
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
    tools: readModules()
      .filter((m) => m.enabled)
      .map((m) => m.tool),
    roles: readModules(),
    max_nodes: readModules().length + 3,
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
    if (
      !run.context.industry &&
      run.context.assets.some((a) =>
        ramenAssetCatalog.some((t) => t.legacy_id === a.id),
      )
    )
      throw new Error("업종 전환 이전 실행입니다. 새 진단을 시작하세요.");
    const began = performance.now();
    run.status = "running";
    run.blackboard = {
      planner: {
        summary: `${run.line}라인에서 데이터 확인 후 설비·생산·품질·현장 워커를 배치합니다.`,
        evidence: ["LINE-" + run.line],
        findings: ["고정된 제조 분석 DAG · 허용된 도구만 실행"],
      },
    };
    const frozen =
      run.modules ||
      planModules(
        builtinModules,
        run.tasks
          .filter((t) => builtinModules.some((m) => m.id === t.id))
          .map((t) => t.id),
      );
    const captured =
      "resources" in run.context
        ? captureContext(
            run.context as unknown as ManufacturingSource,
            run.line,
          )
        : run.context;
    for (const role of frozen) {
      const start = performance.now(),
        result = executeModule(role, captured, run.blackboard);
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
    for (const aid of new Set(
      Object.values(run.blackboard).flatMap((f) => f.maintenance_assets || []),
    )) {
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
      evidence: captured.assets
        .filter((a) => a.line === run.line)
        .map((a) => a.id),
      findings: frozen.map((r) => run.blackboard![r.id].summary),
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
  if (path === "/agents/modules" && body === undefined) result = readModules();
  else if (path === "/agents/modules") {
    auth.requireRole("admin");
    result = createModule(body);
    log("agent_module.create", body.id);
  } else if (path.startsWith("/agents/modules/")) {
    const parts = path.split("/"),
      mid = parts[3];
    if (parts[4] === "preview") {
      assertConfigKeys(body);
      const items = readModules(),
        base = items.find((m) => m.id === mid);
      if (!base) throw new Error("모듈을 찾을 수 없습니다.");
      if (base.compatible === false)
        throw new Error("현재 업종에서 사용할 수 없는 에이전트입니다.");
      const module = validateModule({ ...base, ...body }, items);
      result = {
        module_id: mid,
        preview: true,
        line_results: Object.fromEntries(
          ["A", "B"].map((line) => [
            line,
            executeModule(module, captureContext(source, line), {}),
          ]),
        ),
      };
    } else {
      auth.requireRole("admin");
      result = saveModule(mid, body.expected_revision, body.config);
      log("agent_module.update", mid);
    }
  } else if (path === "/agents/config") result = cfg;
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
    const frozen = planModules(readModules(), body.agent_ids) as AgentModule[];
    const captured = captureContext(source, body.line);
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
    const edges = nodes.slice(1).map((n) => ({
      source: "LINE-" + body.line,
      target: n.id,
      relation: "contains",
    }));
    if (captured.supply) {
      nodes.push({
        id: "SUPPLY-SHARED",
        label: "공장 공용 공급망",
        kind: "shared",
      });
      for (const category of ["skus", "locations", "lots", "boms"] as const) {
        for (const item of captured.supply[category]) {
          nodes.push({
            id: item.id,
            label: "name" in item ? item.name : item.code,
            kind: category,
          });
          edges.push({
            source: "SUPPLY-SHARED",
            target: item.id,
            relation: "references",
          });
        }
      }
    }
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
      context: captured,
      modules: structuredClone(frozen.map((m) => ({ ...m, history: [] }))),
      recommendation_ids: [],
      tasks: [
        {
          id: "planner",
          name: "제조 Planner",
          tool: "planner.plan",
          depends: [],
          status: "queued",
        },
        ...frozen.map((m) => ({
          id: m.id,
          name: m.name,
          tool: m.tool,
          depends: m.depends.length ? m.depends : ["planner"],
          module_revision: m.revision,
          tool_version: m.version,
          status: "queued",
        })),
        {
          id: "main",
          name: "검토·보고 Main Agent",
          tool: "report.compose",
          depends: frozen.map((r) => r.id),
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
        edges,
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
    } else if (run.status === "queued") {
      try {
        execute(run);
      } catch (e) {
        run.status = "failed";
        run.error = (e as Error).message;
        run.finished_at = now();
        run.tasks.forEach((t) => {
          if (t.status === "running") t.status = "failed";
        });
      }
    }
    result = publicRun(run);
  }
  localStorage.setItem(KEY, JSON.stringify(db));
  context.saveSource();
  return structuredClone(result) as T;
}
