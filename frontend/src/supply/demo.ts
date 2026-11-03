import { eventEnvelope } from "../integrations/demo.ts";
import seed from "./seed.json" with { type: "json" };
import { transact, productionPlan, lotTrace } from "./engine.ts";
import type { SupplyState } from "./types.ts";
import type { BrowserDemoAuth } from "../demo-auth.ts";
const KEY = "forge-ax-supply-v1";
export function emptySupply(): SupplyState {
  return {
    version: 1,
    revision: 1,
    sequence: 0,
    skus: [],
    locations: [],
    lots: [],
    balances: [],
    boms: [],
    movements: [],
    batches: [],
    events: {},
  };
}
export function seedSupply() {
  let state = emptySupply();
  const stamp = new Date().toISOString(),
    today = stamp.slice(0, 10),
    future = (n: number) =>
      new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const apply = (command: string, body: any) => {
    const out = transact(state, command, body, stamp);
    state = out.state;
    return out.result;
  };
  for (const s of seed.skus) apply("sku", s);
  for (const l of seed.locations) apply("location", l);
  for (const b of seed.boms) apply("bom", b);
  seed.receipts.forEach((r, i) => {
    const { expires_in_days, ...body } = r;
    apply("receipt", {
      ...body,
      event_id: `seed-receipt-${i}`,
      manufactured_on: future(-1),
      expires_on: future(expires_in_days),
      supplier: "합성 데모 공급처",
      reference: "라면 제조 데모 초기 입고",
    });
    const l = state.lots.find(
      (l) => l.sku_id === r.sku_id && l.code === r.lot_code,
    )!;
    if (!r.lot_code.endsWith("HOLD"))
      apply("lot-status", {
        lot_id: l.id,
        expected_revision: 1,
        status: "released",
      });
  });
  seed.production.forEach((p, i) => {
    const bom = state.boms.find((b) => b.product_sku_id === p.product)!,
      body = { bom_id: bom.id, bom_revision: 1, quantity: p.quantity },
      plan = productionPlan(state, body, today),
      out = apply("produce", {
        ...body,
        event_id: `seed-produce-${i}`,
        lot_code: p.product + "-DEMO-01",
        to_location: p.to_location,
        expires_on: future(p.expires_in_days),
        allocations: plan.allocations,
        reference: "합성 데모 생산",
      });
    apply("lot-status", {
      lot_id: out.lot_id,
      expected_revision: 1,
      status: "released",
    });
  });
  return state;
}
export function readSupply(): SupplyState {
  const value = localStorage.getItem(KEY);
  if (value) return JSON.parse(value);
  const state = seedSupply();
  localStorage.setItem(KEY, JSON.stringify(state));
  return state;
}
export function publicSupply(s: SupplyState) {
  const { events: _, sequence: __, outbox: ___, ...rest } = s;
  return structuredClone(rest);
}
const specs: Record<string, string[]> = {
  sku: ["id", "name", "category", "unit", "min_stock", "expected_revision"],
  location: [
    "id",
    "warehouse",
    "zone",
    "name",
    "allowed_categories",
    "expected_revision",
  ],
  bom: [
    "product_sku_id",
    "name",
    "output_quantity",
    "components",
    "expected_revision",
  ],
  "lot-status": ["lot_id", "expected_revision", "status"],
  receipt: [
    "event_id",
    "sku_id",
    "lot_code",
    "quantity",
    "to_location",
    "manufactured_on",
    "expires_on",
    "supplier",
    "reference",
  ],
  issue: ["event_id", "lot_id", "quantity", "from_location", "reference"],
  transfer: [
    "event_id",
    "lot_id",
    "quantity",
    "from_location",
    "to_location",
    "reference",
  ],
  produce: [
    "event_id",
    "bom_id",
    "bom_revision",
    "quantity",
    "lot_code",
    "to_location",
    "expires_on",
    "reference",
    "allocations",
  ],
};
function validate(command: string, b: any) {
  if (
    !b ||
    typeof b !== "object" ||
    Object.keys(b).some((k) => !specs[command]?.includes(k))
  )
    throw new Error("허용된 작업 필드만 입력하세요.");
  for (const k of ["id"])
    if (k in b && !/^[A-Z0-9][A-Z0-9_-]{0,29}$/.test(b[k]))
      throw new Error("ID는 영문 대문자·숫자·하이픈 1~30자입니다.");
  for (const k of ["name", "warehouse", "zone"])
    if (
      k in b &&
      (typeof b[k] !== "string" || b[k].trim().length < 2 || b[k].length > 80)
    )
      throw new Error("이름·창고·구역은 2~80자입니다.");
  if ("event_id" in b && !/^[a-zA-Z0-9_-]{1,80}$/.test(b.event_id))
    throw new Error("요청 ID를 확인하세요.");
  for (const k of ["expires_on", "manufactured_on"])
    if (
      b[k] &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(b[k]) || Number.isNaN(Date.parse(b[k])))
    )
      throw new Error("날짜 형식을 확인하세요.");
}
export function supplyDemo(path: string, body: any, auth: BrowserDemoAuth) {
  auth.current();
  const state = readSupply();
  if (path === "/supply" && body === undefined) return publicSupply(state);
  if (path === "/supply/production-preview")
    return productionPlan(state, body, new Date().toISOString().slice(0, 10));
  if (path.match(/^\/supply\/lots\/[^/]+\/trace$/))
    return lotTrace(state, path.split("/")[3]);
  const command = (
    {
      skus: "sku",
      locations: "location",
      boms: "bom",
      "lot-status": "lot-status",
      receipts: "receipt",
      issues: "issue",
      transfers: "transfer",
      production: "produce",
    } as Record<string, string>
  )[path.split("/")[2]];
  if (!command) throw new Error("공급망 기능을 찾을 수 없습니다.");
  auth.requireRole(
    ...(["sku", "location", "bom", "lot-status"].includes(command)
      ? (["admin"] as const)
      : (["admin", "operator"] as const)),
  );
  validate(command, body);
  const out = transact(state, command, body, new Date().toISOString());
  if (!out.result.duplicate) {
    out.state.outbox ||= [];
    out.state.outbox.push(
      eventEnvelope(
        "supply." + command,
        String(
          out.result.lot_id || out.result.id || out.result.batch_id || command,
        ),
        out.result,
      ),
    );
  }
  localStorage.setItem(KEY, JSON.stringify(out.state));
  return out.result;
}
