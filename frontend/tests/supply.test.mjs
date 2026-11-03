import test from "node:test";
import assert from "node:assert/strict";
const memory = () => {
  const values = new Map();
  return {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
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
const { migrateRamenDemo } = await import("../src/supply/industry-demo.ts");
const password = "SupplyAdmin!2026",
  auth = new BrowserDemoAuth({
    id: "admin",
    name: "공급망 검증",
    email: "admin@admin.com",
    role: "admin",
    password_hash: await hashDemoPassword(password),
  });
const request = (path, body) => demoApi(path, body, auth);
const login = () =>
  request("/auth/login", { email: "admin@admin.com", password });
const config = (m) => ({
  name: m.name,
  description: m.description,
  enabled: m.enabled,
  depends: m.depends,
  instruction: m.instruction,
  parameters: m.parameters,
});

test("ramen factory seed connects multi-level BOM production and exact inventory transactions", async () => {
  await login();
  const assets = await request("/assets");
  assert.ok(assets.some((a) => a.id === "NDL-STEAM"));
  const initial = await request("/supply");
  assert.equal(initial.skus.length, 14);
  assert.equal(initial.batches.length, 5);
  assert.equal(initial.lots.length, 15);
  const body = {
    event_id: "trial-receipt",
    sku_id: "FLOUR",
    lot_code: "TRIAL-01",
    quantity: "2.500",
    to_location: "RAW-01",
    manufactured_on: new Date().toISOString().slice(0, 10),
    expires_on: null,
    supplier: "테스트",
    reference: "정밀 수량",
  };
  const received = await request("/supply/receipts", body),
    lid = received.lot_id,
    before = await request("/supply");
  assert.equal((await request("/supply/receipts", body)).duplicate, true);
  assert.deepEqual(await request("/supply"), before);
  await assert.rejects(request("/supply/receipts", { ...body, quantity: "3" }));
  await assert.rejects(
    request("/supply/issues", {
      event_id: "held",
      lot_id: lid,
      from_location: "RAW-01",
      quantity: "1",
    }),
  );
  await request("/supply/lot-status", {
    lot_id: lid,
    expected_revision: 1,
    status: "released",
  });
  await request("/supply/issues", {
    event_id: "precision-issue",
    lot_id: lid,
    from_location: "RAW-01",
    quantity: "0.125",
  });
  await request("/supply/transfers", {
    event_id: "precision-move",
    lot_id: lid,
    from_location: "RAW-01",
    to_location: "RAW-02",
    quantity: "0.375",
  });
  const after = await request("/supply");
  assert.deepEqual(
    Object.fromEntries(
      after.balances
        .filter((b) => b.lot_id === lid)
        .map((b) => [b.location_id, b.quantity]),
    ),
    { "RAW-01": "2.000", "RAW-02": "0.375" },
  );
  await assert.rejects(
    request("/supply/issues", {
      event_id: "overdraw",
      lot_id: lid,
      from_location: "RAW-01",
      quantity: "5",
    }),
  );
  assert.deepEqual(await request("/supply"), after);
});

test("BOM preview, atomic allocations and upstream/downstream LOT genealogy work in Pages", async () => {
  const s = await request("/supply"),
    bom = s.boms.find((b) => b.product_sku_id === "RAMEN"),
    planBody = { bom_id: bom.id, bom_revision: bom.revision, quantity: "1000" },
    plan = await request("/supply/production-preview", planBody);
  assert.equal(plan.ready, true);
  assert.deepEqual(await request("/supply"), s);
  const body = {
    ...planBody,
    event_id: "trial-production",
    lot_code: "RAMEN-TRIAL-01",
    to_location: "FG-01",
    expires_on: null,
    reference: "검토 생산",
    allocations: plan.allocations,
  };
  const wrong = structuredClone(body);
  wrong.allocations[0].quantity = "1";
  await assert.rejects(request("/supply/production", wrong));
  assert.deepEqual(await request("/supply"), s);
  const made = await request("/supply/production", body),
    after = await request("/supply");
  assert.equal((await request("/supply/production", body)).duplicate, true);
  assert.deepEqual(await request("/supply"), after);
  assert.equal(
    after.lots.find((l) => l.id === made.lot_id).status,
    "quarantine",
  );
  assert.equal(after.batches.at(-1).bom_snapshot.revision, bom.revision);
  const trace = await request(`/supply/lots/${made.lot_id}/trace`);
  for (const sku of ["FLOUR", "SPICE", "SOUP", "SOUP-PACK", "NOODLE", "RAMEN"])
    assert.ok(trace.nodes.some((l) => l.sku_id === sku));
  await assert.rejects(
    request("/supply/boms", {
      product_sku_id: "FLOUR",
      name: "순환 참조",
      output_quantity: "1",
      components: [{ sku_id: "NOODLE", quantity: "1" }],
    }),
  );
});

test("common agent widgets remain installable when industry changes and specific agents are excluded", async () => {
  const state = await request("/supply"),
    p = await request("/industry");
  await request("/industry", {
    expected_revision: p.revision,
    config: p.templates.find((p) => p.id === "general"),
  });
  assert.deepEqual(await request("/supply"), state);
  const modules = await request("/agents/modules");
  assert.equal(modules.length, 20);
  assert.equal(modules.find((m) => m.id === "noodles").compatible, false);
  await assert.rejects(
    request("/agents/runs", {
      goal: "업종 외 에이전트 선택",
      line: "A",
      mode: "tools",
      agent_ids: ["soup"],
    }),
  );
  const widgets = await request(
    "/agent-widgets/results?line=B&ids=inventory,lot,warehouse,bom",
  );
  assert.equal(widgets.length, 4);
  assert.ok(widgets.every((w) => w.status === "ready"));
  await request("/agent-widgets/layout", {
    enabled: true,
    line: "B",
    module_ids: ["warehouse", "lot"],
  });
  assert.equal((await request("/agent-widgets/layout")).line, "B");
  const panels = await request("/panels"),
    panel = panels.find((p) => p.id === "PANEL-A-TV");
  assert.ok(panel.published.screens.some((s) => s.template === "agents"));
  assert.equal(
    (await request(`/panels/${panel.id}/display`)).agent_widgets.length,
    4,
  );
  const inv = modules.find((m) => m.id === "inventory");
  await request("/agents/modules/inventory", {
    expected_revision: inv.revision,
    config: { ...config(inv), parameters: { coverage_factor: 10 } },
  });
  const changed = await request("/agent-widgets/results?line=A&ids=inventory");
  assert.ok(changed[0].fact.metrics.low_stock_skus > 0);
  await request("/industry", {
    expected_revision: p.revision + 1,
    config: p.config,
  });
});

test("governance exports and outbox capture are prepared without pretending to publish externally", async () => {
  const catalog = await request("/integrations/catalog");
  assert.ok(
    catalog.datasets.every(
      (d) => d.owner && d.classification === "internal" && d.primary_key.length,
    ),
  );
  const events = await request("/integrations/events");
  assert.ok(events.events.length >= 5);
  assert.ok(
    events.events.every(
      (e) =>
        e.status === "pending" &&
        e.event.id &&
        e.event.governance.schema_version === 1,
    ),
  );
  const exported = await request("/integrations/export/stock");
  assert.equal(exported.manifest.row_count, exported.rows.length);
  assert.equal(exported.manifest.schema_version, 1);
  await assert.rejects(request("/integrations/dispatch", { limit: 1 }));
  const cfg = await request("/integrations/config");
  await assert.rejects(
    request("/integrations/config", {
      expected_revision: cfg.revision,
      config: { ...cfg.config, password_env: "ADMIN_PASSWORD" },
    }),
  );
  const old = {
    assets: [{ id: "CNC-001", name: "CNC 가공기 01", kind: "CNC", line: "A" }],
    events: [{ asset_id: "CNC-001" }],
    resources: { order: [], model: [] },
    industry_version: 0,
  };
  const migrated = migrateRamenDemo(old);
  assert.equal(migrated.assets[0].id, "NDL-MIX");
  assert.equal(migrated.events[0].asset_id, "NDL-MIX");
});
