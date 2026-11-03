import type { SupplyState, Lot, ProductionPlan, LotTrace } from "./types.ts";
import { isEligible } from "./types.ts";
const MAX = 1000000000000n;
function fail(message: string): never {
  throw new Error(message);
}
export function qty(v: any, positive = true): bigint {
  const s = String(v);
  if (!/^\d+(\.\d{1,3})?$/.test(s))
    return fail("수량은 소수 3자리 이내로 입력하세요.");
  const [a, b = ""] = s.split("."),
    n = BigInt(a) * 1000n + BigInt(b.padEnd(3, "0"));
  if (n > MAX || n < (positive ? 1n : 0n))
    return fail("수량 범위를 확인하세요.");
  return n;
}
const fmt = (n: bigint) => `${n / 1000n}.${String(n % 1000n).padStart(3, "0")}`;
function get<K extends "skus" | "locations" | "lots" | "boms">(
  s: SupplyState,
  k: K,
  id: string,
): SupplyState[K][number] {
  const item = s[k].find((r: any) => r.id === id);
  if (!item) return fail("등록되지 않은 항목입니다: " + id);
  return item as SupplyState[K][number];
}
function units(s: SupplyState, id: string, n: bigint) {
  const sku = get(s, "skus", id);
  if (sku.unit !== "kg" && n % 1000n !== 0n)
    fail("개/박스 단위는 정수 수량을 입력하세요.");
  return sku;
}
function bin(s: SupplyState, id: string, skuId: string) {
  const l = get(s, "locations", id),
    sku = get(s, "skus", skuId);
  if (!l.allowed_categories.includes(sku.category))
    fail("이 로케이션은 해당 품목 분류를 허용하지 않습니다.");
  return l;
}
function add(s: SupplyState, lid: string, location: string, delta: bigint) {
  let row = s.balances.find(
    (r) => r.lot_id === lid && r.location_id === location,
  );
  if (!row) {
    row = { lot_id: lid, location_id: location, quantity: "0.000" };
    s.balances.push(row);
  }
  const n = qty(row.quantity, false) + delta;
  if (n < 0n) fail("가용 재고가 부족합니다.");
  if (n > MAX) fail("재고 수량 범위를 초과했습니다.");
  row.quantity = fmt(n);
}
function lot(
  s: SupplyState,
  sku: string,
  code: string,
  manufactured: string | null,
  expires: string | null,
  supplier = "",
  parents: string[] = [],
  status = "quarantine",
): Lot {
  if (!code.trim() || code.length > 60) fail("LOT 코드는 1~60자입니다.");
  if (manufactured && manufactured > new Date().toISOString().slice(0, 10))
    fail("제조일은 미래일 수 없습니다.");
  if (expires && manufactured && expires < manufactured)
    fail("소비/유효기한은 제조일 이후여야 합니다.");
  if (s.lots.some((l) => l.sku_id === sku && l.code === code.trim()))
    fail("이미 사용 중인 생산 LOT 코드입니다.");
  const next: Lot = {
    id: "LOT-" + crypto.randomUUID().replaceAll("-", "").slice(0, 24),
    sku_id: sku,
    code: code.trim(),
    manufactured_on: manufactured,
    expires_on: expires,
    supplier,
    parents: [...new Set(parents)].sort(),
    status,
    revision: 1,
  };
  s.lots.push(next);
  return next;
}
function record(
  s: SupplyState,
  action: string,
  l: Lot,
  n: bigint,
  source: string | null,
  target: string | null,
  reference: string,
  stamp: string,
  batch: string | null = null,
) {
  s.sequence = (s.sequence || 0) + 1;
  const row = {
    id: `MOV-${String(s.sequence).padStart(6, "0")}`,
    action,
    lot_id: l.id,
    sku_id: l.sku_id,
    quantity: fmt(n),
    from_location: source,
    to_location: target,
    reference,
    timestamp: stamp,
    batch_id: batch,
  };
  s.movements.push(row);
  return row;
}
function boms(s: SupplyState, c: any) {
  const product = get(s, "skus", c.product_sku_id);
  units(s, product.id, qty(c.output_quantity));
  if (
    !c.components.length ||
    c.components.length > 30 ||
    new Set(c.components.map((x: any) => x.sku_id)).size !== c.components.length
  )
    fail("BOM 구성품을 중복 없이 1~30개 입력하세요.");
  c.components.forEach((x: any) => units(s, x.sku_id, qty(x.quantity)));
  const graph = new Map(
    s.boms.map((b) => [b.product_sku_id, b.components.map((x) => x.sku_id)]),
  );
  graph.set(
    product.id,
    c.components.map((x: any) => x.sku_id),
  );
  const seen = new Set<string>(),
    active = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id)) fail("BOM 순환 참조는 허용되지 않습니다.");
    if (seen.has(id)) return;
    active.add(id);
    (graph.get(id) || []).forEach(visit);
    active.delete(id);
    seen.add(id);
  };
  [...graph.keys()].forEach(visit);
}
export function productionPlan(
  s: SupplyState,
  b: any,
  today: string,
): ProductionPlan {
  const bom = get(s, "boms", b.bom_id);
  if (bom.revision !== b.bom_revision)
    fail("BOM이 변경되었습니다. 소요량을 다시 확인하세요.");
  const out = qty(b.quantity),
    product = units(s, bom.product_sku_id, out),
    base = qty(bom.output_quantity),
    needs: ProductionPlan["needs"] = [],
    allocations: ProductionPlan["allocations"] = [];
  for (const c of bom.components) {
    const sku = get(s, "skus", c.sku_id),
      raw = qty(c.quantity) * out,
      step = sku.unit === "kg" ? 1n : 1000n;
    let required = (raw + base - 1n) / base;
    required = ((required + step - 1n) / step) * step;
    let remaining = required;
    const stocks = s.balances
      .map((stock) => ({ stock, lot: get(s, "lots", stock.lot_id) }))
      .filter(
        (x) =>
          x.lot.sku_id === sku.id &&
          isEligible(x.lot, today) &&
          qty(x.stock.quantity, false) > 0n,
      )
      .sort((a, b) =>
        (
          (a.lot.expires_on || "9999") +
          (a.lot.manufactured_on || "") +
          a.lot.id +
          a.stock.location_id
        ).localeCompare(
          (b.lot.expires_on || "9999") +
            (b.lot.manufactured_on || "") +
            b.lot.id +
            b.stock.location_id,
        ),
      );
    for (const x of stocks) {
      const available = qty(x.stock.quantity, false),
        take = available < remaining ? available : remaining;
      if (take > 0n)
        allocations.push({
          lot_id: x.lot.id,
          from_location: x.stock.location_id,
          quantity: fmt(take),
        });
      remaining -= take;
      if (remaining <= 0n) break;
    }
    needs.push({
      sku_id: sku.id,
      name: sku.name,
      unit: sku.unit,
      required: fmt(required),
      shortage: fmt(remaining > 0n ? remaining : 0n),
    });
  }
  return {
    bom_id: bom.id,
    bom_revision: bom.revision,
    product_sku_id: product.id,
    quantity: fmt(out),
    needs,
    allocations,
    ready: needs.every((n) => qty(n.shortage, false) === 0n),
    planned_on: today,
  };
}
function canonical(v: any): any {
  return Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
}
export function transact(
  original: SupplyState,
  command: string,
  body: any,
  stamp: string,
) {
  const s = structuredClone(original),
    today = stamp.slice(0, 10),
    fingerprint = JSON.stringify(canonical({ command, body })),
    event = body.event_id;
  s.events ||= {};
  if (event && s.events[event]) {
    if (s.events[event].fingerprint !== fingerprint)
      fail("같은 요청 ID에 다른 내용을 사용할 수 없습니다.");
    return { state: s, result: { ...s.events[event].result, duplicate: true } };
  }
  let result: any = {};
  if (command === "sku") {
    const old = s.skus.find((x) => x.id === body.id);
    if (old && old.revision !== body.expected_revision)
      fail("품목 설정이 변경되었습니다.");
    if (
      !["raw", "wip", "finished", "packaging"].includes(body.category) ||
      !["kg", "ea", "box"].includes(body.unit)
    )
      fail("품목 분류와 단위를 확인하세요.");
    qty(body.min_stock, false);
    if (
      old &&
      old.unit !== body.unit &&
      (s.lots.some((l) => l.sku_id === old.id) ||
        s.boms.some(
          (b) =>
            b.product_sku_id === old.id ||
            b.components.some((c) => c.sku_id === old.id),
        ))
    )
      fail("LOT 또는 BOM에 사용된 품목의 단위는 변경할 수 없습니다.");
    if (
      old &&
      old.category !== body.category &&
      s.balances.some(
        (b) =>
          get(s, "lots", b.lot_id).sku_id === old.id &&
          qty(b.quantity, false) > 0n &&
          !get(s, "locations", b.location_id).allowed_categories.includes(
            body.category,
          ),
      )
    )
      fail("현재 적치 위치와 맞지 않는 품목 분류입니다.");
    result = {
      id: body.id,
      name: body.name,
      category: body.category,
      unit: body.unit,
      min_stock: fmt(qty(body.min_stock, false)),
      revision: (old?.revision || 0) + 1,
    };
    s.skus = s.skus.filter((x) => x.id !== body.id).concat(result);
  } else if (command === "location") {
    const old = s.locations.find((x) => x.id === body.id);
    if (old && old.revision !== body.expected_revision)
      fail("로케이션 설정이 변경되었습니다.");
    if (
      !body.allowed_categories.length ||
      new Set(body.allowed_categories).size !==
        body.allowed_categories.length ||
      body.allowed_categories.some(
        (c: string) => !["raw", "wip", "finished", "packaging"].includes(c),
      )
    )
      fail("적치 가능한 품목 분류를 선택하세요.");
    if (
      s.balances.some(
        (b) =>
          b.location_id === body.id &&
          qty(b.quantity, false) > 0n &&
          !body.allowed_categories.includes(
            get(s, "skus", get(s, "lots", b.lot_id).sku_id).category,
          ),
      )
    )
      fail("현재 재고가 있는 분류를 제외할 수 없습니다.");
    result = {
      id: body.id,
      name: body.name,
      warehouse: body.warehouse,
      zone: body.zone,
      allowed_categories: body.allowed_categories,
      revision: (old?.revision || 0) + 1,
    };
    s.locations = s.locations.filter((x) => x.id !== body.id).concat(result);
  } else if (command === "bom") {
    const id = "BOM-" + body.product_sku_id,
      old = s.boms.find((x) => x.id === id);
    if (old && old.revision !== body.expected_revision)
      fail("BOM이 변경되었습니다.");
    boms(s, body);
    result = {
      id,
      name: body.name,
      product_sku_id: body.product_sku_id,
      output_quantity: fmt(qty(body.output_quantity)),
      components: body.components.map((c: any) => ({
        sku_id: c.sku_id,
        quantity: fmt(qty(c.quantity)),
      })),
      revision: (old?.revision || 0) + 1,
    };
    s.boms = s.boms.filter((x) => x.id !== id).concat(result);
  } else if (command === "lot-status") {
    const l = get(s, "lots", body.lot_id);
    if (l.revision !== body.expected_revision)
      fail("LOT 상태가 변경되었습니다.");
    if (!["released", "quarantine", "blocked"].includes(body.status))
      fail("LOT 상태를 확인하세요.");
    l.status = body.status;
    l.revision++;
    result = l;
  } else if (["receipt", "issue", "transfer"].includes(command)) {
    const n = qty(body.quantity),
      reference = body.reference || "";
    if (command === "receipt") {
      const sku = units(s, body.sku_id, n);
      bin(s, body.to_location, sku.id);
      let l = s.lots.find(
        (l) => l.sku_id === sku.id && l.code === body.lot_code.trim(),
      );
      if (l) {
        if (
          ["manufactured_on", "expires_on", "supplier"].some(
            (k) => (l as any)[k] !== body[k],
          ) ||
          l.parents.length ||
          s.batches.some((b) => b.lot_id === l!.id)
        )
          fail(
            "기존 LOT의 제조 정보와 다르거나 생산 LOT에 추가 입고할 수 없습니다.",
          );
      } else
        l = lot(
          s,
          sku.id,
          body.lot_code,
          body.manufactured_on || null,
          body.expires_on || null,
          body.supplier || "",
        );
      add(s, l.id, body.to_location, n);
      result = record(
        s,
        command,
        l,
        n,
        null,
        body.to_location,
        reference,
        stamp,
      );
    } else {
      const l = get(s, "lots", body.lot_id),
        sku = units(s, l.sku_id, n);
      get(s, "locations", body.from_location);
      if (command === "issue" && !isEligible(l, today))
        fail("사용 승인되지 않았거나 기한이 지난 LOT는 출고할 수 없습니다.");
      if (command === "transfer") {
        if (body.from_location === body.to_location)
          fail("출발지와 도착지가 같습니다.");
        bin(s, body.to_location, sku.id);
      }
      add(s, l.id, body.from_location, -n);
      if (command === "transfer") add(s, l.id, body.to_location, n);
      result = record(
        s,
        command,
        l,
        n,
        body.from_location,
        body.to_location || null,
        reference,
        stamp,
      );
    }
  } else if (command === "produce") {
    const plan = productionPlan(s, body, today);
    if (!plan.ready) fail("가용 원재료/반제품이 부족합니다.");
    bin(s, body.to_location, plan.product_sku_id);
    if (!body.allocations.length) fail("검토한 LOT 할당이 필요합니다.");
    const consumed = new Map<string, bigint>(),
      seen = new Set<string>();
    for (const a of body.allocations) {
      const l = get(s, "lots", a.lot_id),
        n = qty(a.quantity);
      units(s, l.sku_id, n);
      if (!isEligible(l, today))
        fail("보류·차단·기한 경과 LOT는 생산에 투입할 수 없습니다.");
      const key = l.id + ":" + a.from_location;
      if (seen.has(key)) fail("동일 LOT·로케이션을 중복 투입할 수 없습니다.");
      seen.add(key);
      get(s, "locations", a.from_location);
      consumed.set(l.sku_id, (consumed.get(l.sku_id) || 0n) + n);
      add(s, l.id, a.from_location, -n);
    }
    if (
      consumed.size !== plan.needs.length ||
      plan.needs.some((n) => consumed.get(n.sku_id) !== qty(n.required))
    )
      fail("LOT 투입량이 검토한 BOM 소요량과 다릅니다.");
    const output = lot(
        s,
        plan.product_sku_id,
        body.lot_code,
        today,
        body.expires_on || null,
        "",
        body.allocations.map((a: any) => a.lot_id),
      ),
      batch = `BAT-${String((s.sequence || 0) + 1).padStart(6, "0")}`;
    for (const a of body.allocations)
      record(
        s,
        "consume",
        get(s, "lots", a.lot_id),
        qty(a.quantity),
        a.from_location,
        null,
        body.reference || "",
        stamp,
        batch,
      );
    add(s, output.id, body.to_location, qty(plan.quantity));
    const movement = record(
      s,
      "produce",
      output,
      qty(plan.quantity),
      null,
      body.to_location,
      body.reference || "",
      stamp,
      batch,
    );
    result = {
      batch_id: batch,
      lot_id: output.id,
      movement_id: movement.id,
      bom_snapshot: structuredClone(get(s, "boms", body.bom_id)),
      allocations: body.allocations,
      quantity: plan.quantity,
    };
    s.batches.push(structuredClone(result));
  } else fail("지원하지 않는 공급망 작업입니다.");
  s.revision++;
  if (event) s.events[event] = { fingerprint, result: structuredClone(result) };
  return { state: s, result: { ...structuredClone(result), duplicate: false } };
}
export function lotTrace(s: SupplyState, id: string): LotTrace {
  get(s, "lots", id);
  const selected = new Set([id]),
    edges = new Map<string, { source: string; target: string }>();
  const ancestors = (node: string) => {
    for (const parent of get(s, "lots", node).parents) {
      edges.set(parent + node, { source: parent, target: node });
      if (!selected.has(parent)) {
        selected.add(parent);
        ancestors(parent);
      }
    }
  };
  ancestors(id);
  const pending = [id],
    seen = new Set([id]);
  while (pending.length) {
    const cur = pending.pop()!;
    for (const l of s.lots.filter((l) => l.parents.includes(cur))) {
      edges.set(cur + l.id, { source: cur, target: l.id });
      if (!seen.has(l.id)) {
        seen.add(l.id);
        selected.add(l.id);
        pending.push(l.id);
      }
    }
  }
  for (const selectedId of [...selected]) ancestors(selectedId);
  return {
    root: id,
    nodes: s.lots.filter((l) => selected.has(l.id)),
    edges: [...edges.values()],
  };
}
