import { DemoAuthError } from "./demo-auth.ts";
import { integrationDemo } from "./integrations/demo.ts";
import { widgetDemo } from "./agent-widget-demo.ts";
import { industryDemo } from "./supply/industry-demo.ts";
import { supplyDemo } from "./supply/demo.ts";
import ramenAssets from "./supply/assets.json" with { type: "json" };
import { migrateRamenDemo } from "./supply/industry-demo.ts";
// GitHub Pages only: an explicit browser-local simulator, never a backend fallback.
import type { Asset, Resource } from "./api.ts";
import { agentDemoRequest } from "./agent-demo.ts";
import { panelDemoRequest } from "./panel-demo.ts";
import { demoAuth } from "./demo-auth.ts";
import type { BrowserDemoAuth } from "./demo-auth.ts";
type DemoEvent = {
  id: number;
  event_id: string;
  source: string;
  asset_id: string;
  temperature: number;
  vibration: number;
  good: number;
  rejected: number;
  timestamp: string;
};
type State = {
  assets: Asset[];
  events: DemoEvent[];
  resources: Record<string, Resource[]>;
  audit: Resource[];
  total: number;
  lastTick: number;
};
const KEY = "forge-ax-public-demo-v1";
const stamp = () => new Date().toISOString();
const id = (p: string) =>
  `${p}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
function seed(): State {
  const names = ramenAssets.map(
    (a) =>
      [a.id, a.name, a.kind, a.line, a.cycle_time] as [
        string,
        string,
        string,
        string,
        number,
      ],
  );
  const assets = names.map(([aid, name, kind, line, cycle], i) => ({
    id: aid,
    name,
    kind,
    line,
    cycle_time: cycle,
    status: aid === "NDL-STEAM" ? "warning" : "running",
    temperature: aid === "NDL-STEAM" ? 78.4 : 42 + i * 2.3,
    vibration: aid === "NDL-STEAM" ? 3.8 : 0.8 + i * 0.12,
    produced: 1450 + i * 83,
    rejected: 12 + i * 2,
    updated_at: stamp(),
  }));
  const events: DemoEvent[] = [];
  for (let i = 0; i < 96; i++)
    assets.forEach((a, j) =>
      events.push({
        id: events.length + 1,
        event_id: `seed-${i}-${j}`,
        source: "demo-seed",
        asset_id: a.id,
        temperature: 48 + j + Math.sin(i / 8) * 3,
        vibration: 1 + Math.abs(Math.sin(i / 9 + j)) * 0.7,
        good: 9,
        rejected: i % 19 === 0 ? 1 : 0,
        timestamp: new Date(Date.now() - (96 - i) * 5 * 60000).toISOString(),
      }),
    );
  const make = (
    rid: string,
    name: string,
    status: string,
    data: Record<string, unknown>,
  ) => ({ id: rid, name, status, created_at: stamp(), ...data });
  return {
    assets,
    events,
    total: events.length,
    lastTick: Date.now(),
    audit: [],
    resources: {
      connector: [
        make("CON-001", "Edge Gateway 01", "connected", {
          protocol: "REST",
          endpoint: "Browser-local simulator",
          driver: "demo-rest",
          last_seen: stamp(),
        }),
        make("CON-002", "ERP · 생산계획", "configured", {
          protocol: "REST",
          endpoint: "ERP 어댑터 설정 대기",
        }),
      ],
      order: [
        make("WO-2601", "순한맛 봉지라면 생산", "running", {
          product: "순한맛 봉지라면 120g",
          line: "A",
          quantity: 18000,
          completed: 12640,
        }),
        make("WO-2602", "분말스프 소포장 생산", "running", {
          product: "분말스프 10g 소포장",
          line: "B",
          quantity: 12000,
          completed: 8540,
        }),
        make("WO-2603", "건면 라면 생산 준비", "planned", {
          product: "건면 라면 100g",
          line: "A",
          quantity: 6000,
          completed: 0,
        }),
      ],
      robot: [
        make("ROB-001", "AMR-001", "idle", {
          battery: 86,
          location: "자재 창고",
          jobs: 24,
        }),
        make("ROB-002", "AMR-002", "idle", {
          battery: 72,
          location: "출하 구역",
          jobs: 18,
        }),
      ],
      alert: [
        make("ALERT-SEED", "NDL-STEAM 구동부 온도 상승", "open", {
          asset_id: "NDL-STEAM",
          severity: "warning",
          metric: "temperature",
          value: 78.4,
          threshold: 75,
          message:
            "구동부 온도가 운영 임계값 75°C를 초과했습니다. 냉각 상태 점검을 권장합니다.",
        }),
      ],
      recommendation: [
        make("REC-SEED", "NDL-STEAM 냉각 점검 작업 생성", "pending", {
          asset_id: "NDL-STEAM",
          alert_id: "ALERT-SEED",
          reason:
            "온도 78.4°C, 임계값 75°C 초과. 냉각 상태 및 구동부 점검이 필요합니다.",
          action: "maintenance",
          impact: "점검 작업 지시 생성 · 설비 자동 제어 없음",
          engine: "threshold-rule-v1",
        }),
      ],
      simulation: [],
      model: [],
      job: [],
      dataset: [],
      maintenance: [],
    },
  };
}
function load(): State {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return migrateRamenDemo(JSON.parse(stored));
  } catch {
    /* seed a fresh synthetic workspace */
  }
  return seed();
}
let state = load();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    throw new Error(
      "브라우저 저장 공간이 부족합니다. 사이트 데이터를 초기화한 뒤 다시 시도하세요.",
    );
  }
}
function add(
  category: string,
  name: string,
  status: string,
  data: Record<string, unknown>,
): Resource {
  const r = {
    id: id(category.slice(0, 3).toUpperCase()),
    name,
    status,
    created_at: stamp(),
    ...data,
  };
  state.resources[category].unshift(r);
  state.resources[category] = state.resources[category].slice(0, 200);
  return r;
}
function recordAudit(action: string, target: string, actor: string) {
  state.audit.unshift({
    id: id("LOG"),
    name: action,
    status: "recorded",
    created_at: stamp(),
    actor,
    action,
    target,
  });
  state.audit = state.audit.slice(0, 200);
}
function resource(category: string, rid: string) {
  const r = state.resources[category]?.find((r) => r.id === rid);
  if (!r) throw new Error("항목을 찾을 수 없습니다.");
  return r;
}
function tick() {
  state.assets.forEach((a, i) => {
    const t = Date.now() / 1000;
    const good = 4 + (i % 3);
    const rejected = a.id === "NDL-STEAM" ? 1 : 0;
    a.temperature = Number(
      (a.id === "NDL-STEAM"
        ? 78 + Math.sin(t / 30) * 2
        : 45 + i + Math.sin(t / 45) * 3
      ).toFixed(2),
    );
    a.vibration =
      a.id === "NDL-STEAM"
        ? 3.8
        : Number((1 + Math.abs(Math.sin(t / 25 + i)) * 0.6).toFixed(2));
    a.produced += good;
    a.rejected += rejected;
    a.updated_at = stamp();
    state.total++;
    state.events.push({
      id: state.total,
      event_id: id("EVT"),
      source: "browser-demo",
      asset_id: a.id,
      temperature: a.temperature,
      vibration: a.vibration,
      good,
      rejected,
      timestamp: stamp(),
    });
    if (a.kind === "QC" || a.kind === "Packaging") {
      const o = state.resources.order.find(
        (o) => o.line === a.line && o.status === "running",
      );
      if (o) {
        o.completed = Math.min(o.quantity, o.completed + good);
        if (o.completed >= o.quantity) o.status = "completed";
      }
    }
  });
  state.events = state.events.slice(-1000);
  state.lastTick = Date.now();
  state.resources.connector
    .filter((c) => c.driver === "demo-rest")
    .forEach((c) => (c.last_seen = stamp()));
}
export async function demoApi<T>(
  path: string,
  body?: any,
  auth: BrowserDemoAuth = demoAuth,
  deviceKey?: string,
): Promise<T> {
  if (deviceKey && !/^\/panels\/[^/]+\/(display|heartbeat|events)$/.test(path))
    throw new DemoAuthError(
      403,
      "패널 키는 게시된 현장 화면에만 사용할 수 있습니다.",
    );
  if (path.startsWith("/integrations/"))
    return integrationDemo(path, body, auth, state) as T;
  if (path.startsWith("/agent-widgets/"))
    return widgetDemo(path, body, auth, state) as T;
  if (path === "/industry") {
    const result = industryDemo(body, auth);
    if (body !== undefined) {
      recordAudit("industry.configure", result.config.id, auth.current().email);
      save();
    }
    return result as T;
  }
  if (path === "/supply" || path.startsWith("/supply/")) {
    const result = supplyDemo(path, body, auth);
    if (
      body !== undefined &&
      !path.endsWith("preview") &&
      !(result as any).duplicate
    ) {
      recordAudit(
        "supply." + path.split("/")[2],
        (result as any).id || (result as any).batch_id || "ledger",
        auth.current().email,
      );
      save();
    }
    return result as T;
  }
  if (/^\/(panels|cameras|cctv)(\/|$)/.test(path))
    return panelDemoRequest<T>(path, body, {
      auth,
      deviceKey,
      source: state,
      record: recordAudit,
      saveSource: save,
    });
  if (path.startsWith("/agents/"))
    return agentDemoRequest<T>(path, body, {
      auth,
      source: state,
      record: recordAudit,
      saveSource: save,
    });
  let response: unknown;
  if (path === "/auth/me") return auth.current() as T;
  if (path === "/auth/register") {
    const result = await auth.register(body);
    recordAudit("auth.register", result.user.email, result.user.email);
    recordAudit("auth.login", result.user.email, result.user.email);
    save();
    return result as T;
  }
  if (path === "/auth/login") {
    const result = await auth.login(body);
    recordAudit("auth.login", result.user.email, result.user.email);
    save();
    return result as T;
  }
  const user = auth.current();
  if (path === "/assets") return structuredClone(state.assets) as T;
  const audit = (action: string, target: string) =>
    recordAudit(action, target, user.email);
  if (path === "/auth/logout") {
    audit("auth.logout", user.email);
    save();
    return auth.logout() as T;
  }
  if (path === "/users") return auth.listUsers() as T;
  const adminOnly =
    path === "/audit" ||
    path === "/connectors" ||
    /^\/models\/[^/]+\/deploy$/.test(path) ||
    /^\/recommendations\/[^/]+\/decision$/.test(path);
  if (adminOnly) auth.requireRole("admin");
  else if (body !== undefined) auth.requireRole("operator", "admin");
  if (path === "/overview") {
    if (Date.now() - state.lastTick > 8000) tick();
    const good = state.assets.reduce((s, a) => s + a.produced, 0),
      rejected = state.assets.reduce((s, a) => s + a.rejected, 0),
      running = state.assets.filter((a) =>
        ["running", "warning"].includes(a.status),
      ).length,
      quality = (good / (good + rejected)) * 100;
    const buckets: Record<
      string,
      {
        time: string;
        good: number;
        rejected: number;
        temperature: number;
        count: number;
      }
    > = {};
    state.events.slice(-768).forEach((e) => {
      const key = e.timestamp.slice(0, 16);
      const b =
        buckets[key] ||
        (buckets[key] = {
          time: e.timestamp,
          good: 0,
          rejected: 0,
          temperature: 0,
          count: 0,
        });
      b.good += e.good;
      b.rejected += e.rejected;
      b.temperature += e.temperature;
      b.count++;
    });
    response = {
      assets: state.assets,
      kpis: {
        equipment_health: Number(
          ((running / state.assets.length) * quality).toFixed(1),
        ),
        quality: Number(quality.toFixed(1)),
        produced: good,
        rejected,
        running,
        total_assets: state.assets.length,
        events: state.total,
        pending: state.resources.recommendation.filter(
          (r) => r.status === "pending",
        ).length,
      },
      series: Object.values(buckets)
        .slice(-24)
        .map((b) => ({ ...b, temperature: b.temperature / b.count })),
      alerts: state.resources.alert.filter((a) => a.status === "open"),
      server_time: stamp(),
      demo: true,
    };
  } else if (path.startsWith("/resources/")) {
    response = state.resources[path.split("/")[2]] || [];
  } else if (path.startsWith("/telemetry?")) {
    const params = new URLSearchParams(path.split("?")[1]);
    response = [...state.events]
      .reverse()
      .filter(
        (e) => !params.get("asset_id") || e.asset_id === params.get("asset_id"),
      )
      .slice(0, Number(params.get("limit") || 100));
  } else if (path === "/demo/tick") {
    tick();
    response = { accepted: 8, duplicates: 0, late: 0 };
    audit("demo.collect", "all-assets");
  } else if (path === "/connectors") {
    response = add("connector", body.name, "configured", {
      ...body,
      driver: "unconfigured",
    });
    audit("connector.create", (response as Resource).id);
  } else if (path === "/simulations") {
    const a = state.assets
      .filter((a) => a.line === body.line)
      .sort((a, b) => b.cycle_time - a.cycle_time)[0];
    const baseline = Math.floor(
        ((body.hours * 3600) / a.cycle_time) * 0.9 * 0.98,
      ),
      cycle = a.cycle_time * (1 - body.cycle_reduction / 100),
      optimized = Math.floor(
        ((body.hours * 3600) / cycle) *
          (1 - body.downtime / 100) *
          (1 - body.defect_rate / 100),
      );
    response = add("simulation", body.name, "completed", {
      ...body,
      baseline,
      optimized,
      improvement: Number(((optimized / baseline - 1) * 100).toFixed(1)),
      bottleneck: a.id,
      baseline_cycle: a.cycle_time,
      optimized_cycle: Number(cycle.toFixed(2)),
      method: "deterministic-capacity-v1",
      assumptions:
        "직렬 공정·병목 주기 기반; 기준 비가동 10%, 불량률 2%; 버퍼·고장 분포·물리 엔진 미포함",
    });
    audit("simulation.run", (response as Resource).id);
  } else if (path === "/models/train") {
    const values = state.events
      .filter((e) => e.asset_id === body.asset_id)
      .slice(-500)
      .map((e) => Number(e[body.metric as "temperature" | "vibration"]));
    if (values.length < 20)
      throw new Error("최소 20개 학습 이벤트가 필요합니다.");
    const split = Math.floor(values.length * 0.8),
      train = values.slice(0, split),
      holdout = values.slice(split),
      mean = train.reduce((s, v) => s + v, 0) / train.length,
      std = Math.max(
        Math.sqrt(
          train.reduce((s, v) => s + (v - mean) ** 2, 0) / train.length,
        ),
        0.1,
      );
    response = add("model", body.name, "trained", {
      ...body,
      algorithm: "Gaussian z-score",
      mean,
      std,
      threshold: 3,
      samples: values.length,
      train_samples: split,
      holdout_samples: holdout.length,
      holdout_anomaly_rate: Number(
        (
          (holdout.filter((v) => Math.abs(v - mean) / std > 3).length /
            holdout.length) *
          100
        ).toFixed(1),
      ),
      version: id("v"),
      data_source: "synthetic",
    });
    audit("model.train", (response as Resource).id);
  } else if (/^\/models\/[^/]+\/deploy$/.test(path)) {
    const r = resource("model", path.split("/")[2]);
    state.resources.model
      .filter(
        (m) =>
          m.status === "deployed" &&
          m.asset_id === r.asset_id &&
          m.metric === r.metric,
      )
      .forEach((m) => (m.status = "archived"));
    r.status = "deployed";
    response = r;
    audit("model.deploy", r.id);
  } else if (/^\/models\/[^/]+\/inference$/.test(path)) {
    const r = resource("model", path.split("/")[2]);
    if (r.status !== "deployed")
      throw new Error("배포된 모델만 추론할 수 있습니다.");
    const a = state.assets.find((a) => a.id === r.asset_id)!;
    const value = a[r.metric as "temperature" | "vibration"],
      z = Math.abs(value - r.mean) / r.std;
    response = {
      value,
      z_score: Number(z.toFixed(3)),
      anomaly: z > 3,
      threshold: 3,
      asset_id: a.id,
      timestamp: a.updated_at,
    };
  } else if (/^\/recommendations\/[^/]+\/decision$/.test(path)) {
    const r = resource("recommendation", path.split("/")[2]);
    if (r.status !== "pending") throw new Error("이미 처리된 제안입니다.");
    r.status = body.decision === "approve" ? "approved" : "rejected";
    r.decided_by = user.email;
    r.decided_at = stamp();
    if (r.status === "approved") {
      const task = add("maintenance", r.name, "planned", {
        asset_id: r.asset_id,
        recommendation_id: r.id,
        description: r.reason,
      });
      r.task_id = task.id;
    }
    response = r;
    audit(`recommendation.${body.decision}`, r.id);
  } else if (/^\/alerts\/[^/]+\/ack$/.test(path)) {
    const r = resource("alert", path.split("/")[2]);
    r.status = "acknowledged";
    response = r;
    audit("alert.acknowledge", r.id);
  } else if (path === "/orders") {
    response = add("order", body.name, "planned", { ...body, completed: 0 });
    audit("order.create", (response as Resource).id);
  } else if (/^\/orders\/[^/]+\/start$/.test(path)) {
    const r = resource("order", path.split("/")[2]);
    if (r.status !== "planned")
      throw new Error("대기 상태의 작업만 시작할 수 있습니다.");
    if (
      state.resources.order.some(
        (o) => o.line === r.line && o.status === "running",
      )
    )
      throw new Error("라인에서 이미 작업이 진행 중입니다.");
    r.status = "running";
    response = r;
    audit("order.start", r.id);
  } else if (path === "/robot-jobs") {
    const r = state.resources.robot.find((r) => r.name === body.robot_id)!;
    if (r.status !== "idle" || r.battery < 20)
      throw new Error("로봇이 대기 상태가 아니거나 배터리가 부족합니다.");
    r.status = "busy";
    response = add("job", `${body.robot_id} → ${body.destination}`, "running", {
      ...body,
      mode: "virtual",
      robot_resource: r.id,
    });
    audit("robot.dispatch.virtual", (response as Resource).id);
  } else if (/^\/robot-jobs\/[^/]+\/complete$/.test(path)) {
    const j = resource("job", path.split("/")[2]);
    if (j.status !== "running")
      throw new Error("실행 중인 작업만 완료할 수 있습니다.");
    j.status = "completed";
    const r = resource("robot", j.robot_resource);
    r.status = "idle";
    r.location = j.destination;
    r.battery -= 3;
    r.jobs++;
    response = j;
    audit("robot.complete.virtual", j.id);
  } else if (path === "/datasets") {
    const s = resource("simulation", body.simulation_id);
    response = add("dataset", s.name + " · 합성 운전 데이터", "ready", {
      ...body,
      cycle_time: s.optimized_cycle,
      line: s.line,
      method: "parametric-operating-data-v1",
    });
    audit("dataset.generate", (response as Resource).id);
  } else if (path === "/audit") response = state.audit;
  else throw new Error("공개 체험 모드에서 지원하지 않는 작업입니다.");
  save();
  return structuredClone(response) as T;
}
export function demoCSV(
  path: string,
  auth: BrowserDemoAuth = demoAuth,
): string {
  auth.current();
  if (path === "/telemetry/export")
    return (
      "id,asset_id,temperature,vibration,good,rejected,timestamp\n" +
      [...state.events]
        .reverse()
        .map(
          (r) =>
            `${r.id},${r.asset_id},${r.temperature},${r.vibration},${r.good},${r.rejected},${r.timestamp}`,
        )
        .join("\n")
    );
  const r = resource("dataset", path.split("/")[2]);
  return (
    "sample,cycle_time,temperature,vibration,synthetic\n" +
    Array.from(
      { length: r.samples },
      (_, i) =>
        `${i + 1},${(r.cycle_time * (1 + 0.04 * Math.sin(i))).toFixed(3)},${(48 + 3 * Math.sin(i / 9)).toFixed(3)},${(1.2 + 0.2 * Math.cos(i / 5)).toFixed(3)},true`,
    ).join("\n")
  );
}
