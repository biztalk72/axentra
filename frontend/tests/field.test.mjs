import test from "node:test";
import assert from "node:assert/strict";
const memory = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
};
Object.defineProperty(globalThis, "localStorage", {
  value: memory(),
  configurable: true,
});
Object.defineProperty(globalThis, "sessionStorage", {
  value: memory(),
  configurable: true,
});
const { BrowserDemoAuth, hashDemoPassword } =
  await import("../src/demo-auth.ts");
const { demoApi } = await import("../src/demo.ts");
const { validatePanelConfig, validateCamera, TEMPLATES } =
  await import("../src/panel-model.ts");
const password = "FieldAdmin!2026";
const auth = new BrowserDemoAuth({
  id: "admin",
  name: "현장 검증 관리자",
  email: "admin@admin.com",
  role: "admin",
  password_hash: await hashDemoPassword(password),
});
const request = (path, body, key) => demoApi(path, body, auth, key);
const login = () =>
  request("/auth/login", { email: "admin@admin.com", password });

test("nine panel templates preview line data without publishing or heartbeats", async () => {
  await login();
  const panels = await request("/panels"),
    cameras = await request("/cameras");
  assert.equal(panels.length, 4);
  assert.equal(cameras.length, 4);
  for (const template of TEMPLATES) {
    const config = structuredClone(panels[0].draft);
    config.screens = [
      {
        id: "screen-" + template.id,
        template: template.id,
        title: template.name,
        duration: 20,
        message: "미리보기 내용",
      },
    ];
    const preview = await request("/panels/preview", config);
    assert.equal(preview.source, "preview");
    assert.ok(preview.assets.every((a) => a.line === config.line));
    assert.ok(preview.cameras.every((c) => c.line === config.line));
  }
  const after = (await request("/panels"))[0];
  assert.equal(after.revision, 1);
  assert.equal(after.last_seen, null);
  const invalid = structuredClone(after.draft);
  invalid.camera_widget.camera_ids = ["CAM-B-01"];
  assert.throws(() => validatePanelConfig(invalid, cameras));
});

test("drafts publish explicitly and bulk distribution preserves each line and camera selection", async () => {
  const rows = await request("/panels");
  const a = rows.find((p) => p.id === "PANEL-A-TV"),
    b = rows.find((p) => p.id === "PANEL-B-TV");
  const draft = structuredClone(a.draft);
  draft.screens[0].title = "변경된 생산 화면";
  await request(`/panels/${a.id}/draft`, {
    expected_revision: 1,
    config: draft,
  });
  assert.notEqual(
    (await request(`/panels/${a.id}/display`)).config.screens[0].title,
    draft.screens[0].title,
  );
  await assert.rejects(
    request(`/panels/${a.id}/draft`, { expected_revision: 1, config: draft }),
  );
  await request(`/panels/${a.id}/publish`, { expected_revision: 2 });
  assert.equal(
    (await request(`/panels/${a.id}/display`)).config.screens[0].title,
    draft.screens[0].title,
  );
  const body = {
    targets: [
      { id: a.id, expected_revision: 2 },
      { id: b.id, expected_revision: 99 },
    ],
    screens: draft.screens,
    theme: "light",
    refresh_interval: 10,
    rotation_enabled: true,
  };
  await assert.rejects(request("/panels/bulk-layout", body));
  assert.equal(
    (await request("/panels")).find((p) => p.id === a.id).revision,
    2,
  );
  body.targets[1].expected_revision = 1;
  await request("/panels/bulk-layout", body);
  const current = (await request("/panels")).find((p) => p.id === b.id);
  assert.equal(current.draft.line, "B");
  assert.deepEqual(
    current.draft.camera_widget.camera_ids,
    b.draft.camera_widget.camera_ids,
  );
  await request("/panels/bulk-publish", {
    targets: [
      { id: a.id, expected_revision: 3 },
      { id: b.id, expected_revision: 2 },
    ],
  });
  assert.equal((await request(`/panels/${b.id}/display`)).revision, 2);
});

test("device keys are scoped, revocable and cannot edit configuration", async () => {
  const access = await request("/panels/PANEL-A-TOUCH/access", {});
  assert.ok(access.access_token);
  const data = await request(
    "/panels/PANEL-A-TOUCH/display",
    undefined,
    access.access_token,
  );
  assert.ok(data.assets.every((a) => a.line === "A"));
  await assert.rejects(
    request(
      "/panels/PANEL-A-TOUCH/draft",
      { expected_revision: 1, config: data.config },
      access.access_token,
    ),
  );
  await assert.rejects(
    request("/panels/PANEL-B-TV/display", undefined, access.access_token),
  );
  await request(
    "/panels/PANEL-A-TOUCH/heartbeat",
    { screen_id: "screen-work-order", revision: 1 },
    access.access_token,
  );
  assert.equal(
    (await request("/panels")).find((p) => p.id === "PANEL-A-TOUCH").connection,
    "online",
  );
  const body = {
    event_id: "support-1",
    action: "support.request",
    reason: "equipment",
  };
  assert.equal(
    (await request("/panels/PANEL-A-TOUCH/events", body, access.access_token))
      .duplicate,
    false,
  );
  assert.equal(
    (await request("/panels/PANEL-A-TOUCH/events", body, access.access_token))
      .duplicate,
    true,
  );
  await assert.rejects(
    request(
      "/panels/PANEL-A-TOUCH/events",
      {
        event_id: "wrong-line",
        action: "work.acknowledge",
        order_id: "WO-2602",
      },
      access.access_token,
    ),
  );
  await request("/panels/PANEL-A-TOUCH/access", {});
  await assert.rejects(
    request("/panels/PANEL-A-TOUCH/display", undefined, access.access_token),
  );
});

test("CCTV preferences persist per account and camera input rejects RTSP and embedded credentials", async () => {
  const camera = {
    name: "라인 스트림",
    line: "A",
    location: "입구 카메라",
    source_type: "hls",
    url: "https://stream.example.com/live.m3u8",
    enabled: true,
    fit: "contain",
  };
  assert.doesNotThrow(() => validateCamera(camera));
  assert.throws(() => validateCamera({ ...camera, url: "rtsp://camera/live" }));
  assert.throws(() =>
    validateCamera({ ...camera, url: "https://name:password@camera/live" }),
  );
  const saved = await request("/cameras", camera);
  assert.equal(saved.revision, 1);
  await request("/cctv/layout", {
    enabled: true,
    minimized: true,
    layout: "single",
    camera_ids: ["CAM-A-01"],
  });
  assert.equal((await request("/cctv/layout")).minimized, true);
  await request("/auth/register", {
    name: "현장 사용자",
    email: "floor@example.com",
    password: "TrialFloor!2026",
    password_confirm: "TrialFloor!2026",
  });
  assert.equal((await request("/cctv/layout")).minimized, false);
  await assert.rejects(
    request("/panels/PANEL-A-TV/publish", { expected_revision: 3 }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    request("/panels/PANEL-A-TV/access", {}),
    (e) => e.status === 403,
  );
  await login();
  assert.equal((await request("/cctv/layout")).minimized, true);
});

test("multi-agent planner, workers, graphs, shared facts and approvals form a complete workflow", async () => {
  const created = await request("/agents/runs", {
    goal: "A라인의 공정과 이상 설비를 진단해주세요.",
    line: "A",
    mode: "tools",
  });
  assert.equal(created.status, "queued");
  const result = await request(`/agents/runs/${created.id}`);
  assert.equal(result.status, "awaiting_approval");
  assert.equal(result.tasks.length, 23);
  assert.ok(
    result.blackboard.equipment.maintenance_assets.includes("NDL-STEAM"),
  );
  assert.ok(result.blackboard.quality.metrics.good > 0);
  assert.ok(
    result.blackboard.production.metrics.scenario_ea >
      result.blackboard.production.metrics.baseline_ea,
  );
  assert.ok(result.knowledge_graph.nodes.some((n) => n.id === "CAM-A-01"));
  assert.ok(!result.knowledge_graph.nodes.some((n) => n.id === "CAM-B-01"));
  assert.equal(result.traces.length, 20);
  const approval = result.approvals[0];
  await request(`/recommendations/${approval.id}/decision`, {
    decision: "approve",
  });
  assert.equal(
    (await request(`/agents/runs/${created.id}`)).status,
    "completed",
  );
  await assert.rejects(
    request("/agents/runs", {
      goal: "LLM 미설정 상태 실행",
      line: "A",
      mode: "ollama",
    }),
  );
});

test("queued agent runs can pause, resume or cancel without silently changing scope", async () => {
  const run = await request("/agents/runs", {
    goal: "B라인의 현장 상태를 진단해주세요.",
    line: "B",
    mode: "tools",
  });
  assert.equal(
    (await request(`/agents/runs/${run.id}/control`, { action: "pause" }))
      .status,
    "paused",
  );
  assert.equal((await request(`/agents/runs/${run.id}`)).status, "paused");
  await request(`/agents/runs/${run.id}/control`, { action: "resume" });
  assert.equal((await request(`/agents/runs/${run.id}`)).status, "completed");
  const cancel = await request("/agents/runs", {
    goal: "취소 처리 검증용 라인 진단",
    line: "B",
    mode: "tools",
  });
  assert.equal(
    (await request(`/agents/runs/${cancel.id}/control`, { action: "cancel" }))
      .status,
    "cancelled",
  );
  await assert.rejects(
    request(`/agents/runs/${cancel.id}/control`, { action: "resume" }),
  );
});

test("agent catalogs agree and modules validate dependencies and preview without effects", async () => {
  const { readFile } = await import("node:fs/promises");
  const backend = JSON.parse(
    await readFile(
      new URL("../../backend/app/agent_modules/catalog.json", import.meta.url),
      "utf8",
    ),
  );
  const frontend = JSON.parse(
    await readFile(
      new URL("../src/agent-modules/catalog.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(frontend, backend);
  await login();
  const items = await request("/agents/modules");
  assert.equal(items.length, 20);
  const equipment = items.find((m) => m.id === "equipment");
  const cfg = (m) => ({
    name: m.name,
    description: m.description,
    enabled: m.enabled,
    depends: m.depends,
    instruction: m.instruction,
    parameters: m.parameters,
  });
  const before = await request("/agents/runs");
  const preview = await request("/agents/modules/equipment/preview", {
    ...cfg(equipment),
    parameters: { temperature_threshold: 200, vibration_threshold: 100 },
  });
  assert.equal(preview.line_results.A.metrics.warnings, 0);
  assert.equal((await request("/agents/runs")).length, before.length);
  const production = items.find((m) => m.id === "production");
  await assert.rejects(
    request("/agents/modules/production", {
      expected_revision: 1,
      config: { ...cfg(production), depends: ["simulation"] },
    }),
  );
  await assert.rejects(
    request("/agents/modules/equipment", {
      expected_revision: 1,
      config: { ...cfg(equipment), tool: "shell.exec" },
    }),
  );
  const updated = await request("/agents/modules/equipment", {
    expected_revision: 1,
    config: {
      ...cfg(equipment),
      name: "별도 설비 분석",
      parameters: { temperature_threshold: 80, vibration_threshold: 4 },
    },
  });
  assert.equal(updated.revision, 2);
  assert.equal(updated.history[0].parameters.temperature_threshold, 75);
  await assert.rejects(
    request("/agents/modules/equipment", {
      expected_revision: 1,
      config: cfg(equipment),
    }),
  );
  await request("/agents/modules/equipment", {
    expected_revision: 2,
    config: cfg(equipment),
  });
});

test("individual module runs include dependency closure and freeze configured values", async () => {
  await login();
  const cfg = (m) => ({
    name: m.name,
    description: m.description,
    enabled: m.enabled,
    depends: m.depends,
    instruction: m.instruction,
    parameters: m.parameters,
  });
  const m = (await request("/agents/modules")).find(
    (m) => m.id === "equipment",
  );
  const frozen = await request("/agents/runs", {
    goal: "생성 시점 구성 고정 확인",
    line: "A",
    mode: "tools",
    agent_ids: ["equipment"],
  });
  await request("/agents/modules/equipment", {
    expected_revision: m.revision,
    config: {
      ...cfg(m),
      parameters: { temperature_threshold: 200, vibration_threshold: 100 },
    },
  });
  const result = await request(`/agents/runs/${frozen.id}`);
  assert.equal(result.blackboard.equipment.metrics.warnings, 1);
  assert.equal(
    result.modules.find((m) => m.id === "equipment").revision,
    m.revision,
  );
  const fresh = await request("/agents/runs", {
    goal: "수정 후 별도 에이전트 진단",
    line: "A",
    mode: "tools",
    agent_ids: ["equipment"],
  });
  assert.equal(
    (await request(`/agents/runs/${fresh.id}`)).blackboard.equipment.metrics
      .warnings,
    0,
  );
  const camera = (await request("/agents/modules")).find(
    (m) => m.id === "cctv",
  );
  await assert.rejects(
    request("/agents/modules", {
      ...cfg(camera),
      id: "main",
      name: "예약 이름 거부",
      template_id: "cctv",
    }),
  );
  const clone = await request("/agents/modules", {
    ...cfg(camera),
    id: "camera-inspector",
    name: "카메라 독립 구성",
    template_id: "cctv",
  });
  assert.equal(clone.builtin, false);
  const selected = await request("/agents/runs", {
    goal: "CCTV 의존성 포함 선택 실행",
    line: "B",
    mode: "tools",
    agent_ids: ["camera-inspector"],
  });
  const completed = await request(`/agents/runs/${selected.id}`);
  assert.deepEqual(
    new Set(completed.tasks.map((t) => t.id)),
    new Set([
      "planner",
      "data",
      "panels",
      "camera-inspector",
      "main",
      "approval",
    ]),
  );
  assert.equal(completed.status, "completed");
  await assert.rejects(
    request("/agents/runs", {
      goal: "잘못된 선택 실행 확인",
      line: "B",
      mode: "tools",
      agent_ids: [],
    }),
  );
  await request("/auth/logout", {});
  await request("/auth/login", {
    email: "floor@example.com",
    password: "TrialFloor!2026",
  });
  await assert.rejects(
    request("/agents/modules/equipment", {
      expected_revision: m.revision + 1,
      config: cfg(m),
    }),
    (e) => e.status === 403,
  );
  await login();
});
