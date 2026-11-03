import test from "node:test";
import assert from "node:assert/strict";
const memory = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
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
const { demoApi, demoCSV } = await import("../src/demo.ts");

test("Pages demo supports the complete manufacturing review flow", async () => {
  const initial = await demoApi("/overview");
  assert.equal(initial.assets.length, 8);
  assert.equal(initial.kpis.pending, 1);
  await demoApi("/demo/tick", {});
  assert.equal(
    (await demoApi("/overview")).kpis.events,
    initial.kpis.events + 8,
  );
  const s = await demoApi("/simulations", {
    name: "테스트 시나리오",
    line: "A",
    hours: 8,
    cycle_reduction: 15,
    downtime: 5,
    defect_rate: 1.5,
  });
  assert.ok(s.optimized > s.baseline);
  assert.equal(s.bottleneck, "CNC-003");
  const d = await demoApi("/datasets", { simulation_id: s.id, samples: 20 });
  assert.equal(demoCSV(`/datasets/${d.id}/download`).split("\n").length, 21);
  const m = await demoApi("/models/train", {
    name: "온도 감지",
    asset_id: "CNC-003",
    metric: "temperature",
  });
  assert.equal(m.status, "trained");
  await demoApi(`/models/${m.id}/deploy`, {});
  assert.equal(
    typeof (await demoApi(`/models/${m.id}/inference`)).anomaly,
    "boolean",
  );
  const approved = await demoApi("/recommendations/REC-SEED/decision", {
    decision: "approve",
  });
  assert.equal(approved.status, "approved");
  assert.equal((await demoApi("/resources/maintenance")).length, 1);
  await assert.rejects(
    demoApi("/recommendations/REC-SEED/decision", { decision: "approve" }),
  );
  const job = await demoApi("/robot-jobs", {
    robot_id: "AMR-001",
    destination: "가공 A라인",
  });
  assert.equal(job.status, "running");
  await assert.rejects(
    demoApi("/robot-jobs", { robot_id: "AMR-001", destination: "출하 구역" }),
  );
  await demoApi(`/robot-jobs/${job.id}/complete`, {});
  const robot = (await demoApi("/resources/robot")).find(
    (r) => r.name === "AMR-001",
  );
  assert.equal(robot.battery, 83);
  assert.equal(robot.location, "가공 A라인");
  assert.ok((await demoApi("/audit")).length >= 8);
  assert.ok(localStorage.getItem("forge-ax-public-demo-v1"));
  assert.ok(demoCSV("/telemetry/export").startsWith("id,asset_id"));
});

test("Pages demo makes logout and explicit demo login work", async () => {
  await demoApi("/auth/logout", {});
  await assert.rejects(demoApi("/auth/me"));
  await assert.rejects(
    demoApi("/auth/login", { email: "admin@forge.local", password: "bad" }),
  );
  await demoApi("/auth/login", {
    email: "admin@forge.local",
    password: "ForgeDemo!2026",
  });
  assert.equal((await demoApi("/auth/me")).role, "admin");
});
