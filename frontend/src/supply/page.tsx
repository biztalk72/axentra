import { ui } from "../i18n/locale";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowRightLeft,
  Boxes,
  Factory,
  GitBranch,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Warehouse,
} from "lucide-react";
import { api, date } from "../api";
import { FieldDialog } from "../field-ui";
import { useIndustry, setIndustry } from "../industry-context";
import type { IndustryState, IndustryProfile } from "./industry-demo";
import type { SupplyState, ProductionPlan, LotTrace, Lot } from "./types";
import {
  categoryLabels,
  statusLabels,
  actionLabels,
  number,
  isEligible,
} from "./types";
import "./supply.css";
const today = () => new Date().toISOString().slice(0, 10);
type Command =
  "receipt" | "issue" | "transfer" | "sku" | "location" | "bom" | "production";
const commandNames: Record<Command, string> = {
  receipt: "원료·자재 입고",
  issue: "재고 출고",
  transfer: "창고·로케이션 이동",
  sku: "품목 마스터",
  location: "창고·로케이션 설정",
  bom: "BOM 편집",
  production: "BOM 기준 생산",
};
export function SupplyPage({
  admin,
  write,
}: {
  admin: boolean;
  write: boolean;
}) {
  const industry = useIndustry(),
    [data, setData] = useState<SupplyState | null>(null),
    [tab, setTab] = useState("inventory"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [modal, setModal] = useState<Command | null>(null),
    [form, setForm] = useState<Record<string, any>>({}),
    [plan, setPlan] = useState<ProductionPlan | null>(null),
    [lotId, setLotId] = useState(""),
    [trace, setTrace] = useState<LotTrace | null>(null),
    [profile, setProfile] = useState<IndustryProfile | null>(null);
  async function load() {
    try {
      const next = await api<SupplyState>("/supply");
      setData(next);
      setLotId(
        (id) =>
          id ||
          next.lots.find((l) => l.sku_id === "RAMEN-BOX")?.id ||
          next.lots[0]?.id ||
          "",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    setProfile(structuredClone(industry.config));
  }, [industry.revision]);
  useEffect(() => {
    if (!lotId) return;
    let active = true;
    void api<LotTrace>(`/supply/lots/${lotId}/trace`)
      .then((r) => {
        if (active) setTrace(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [lotId, data?.revision]);
  const patch = (v: Record<string, any>) => {
    setForm((f) => ({
      ...f,
      ...v,
      ...(f.event_id ? { event_id: crypto.randomUUID() } : {}),
    }));
    setPlan(null);
  };
  function open(command: Command, initial?: any) {
    if (!data) return;
    setError("");
    setPlan(null);
    setModal(command);
    const raw = data.skus[0],
      location = data.locations[0],
      bom = data.boms[0];
    const defaults: Record<Command, any> = {
      receipt: {
        event_id: crypto.randomUUID(),
        sku_id: raw?.id || "",
        lot_code: "RCV-" + Date.now(),
        quantity: "1",
        to_location: location?.id || "",
        manufactured_on: today(),
        expires_on: "",
        supplier: "",
        reference: "",
      },
      issue: {
        event_id: crypto.randomUUID(),
        lot_id: "",
        from_location: "",
        quantity: "1",
        reference: "",
      },
      transfer: {
        event_id: crypto.randomUUID(),
        lot_id: "",
        from_location: "",
        to_location: location?.id || "",
        quantity: "1",
        reference: "",
      },
      sku: { id: "", name: "", category: "raw", unit: "kg", min_stock: "0" },
      location: {
        id: "",
        name: "",
        warehouse: "",
        zone: "",
        allowed_categories: ["raw"],
      },
      bom: {
        product_sku_id:
          data.skus.find((s) => s.category === "finished")?.id || raw?.id || "",
        name: "신규 생산 BOM",
        output_quantity: "1000",
        components: [{ sku_id: raw?.id || "", quantity: "1" }],
      },
      production: {
        event_id: crypto.randomUUID(),
        bom_id: bom?.id || "",
        bom_revision: bom?.revision || 1,
        quantity: bom?.output_quantity || "1",
        lot_code: "PRD-" + Date.now(),
        to_location:
          data.locations.find((l) =>
            l.allowed_categories.includes(
              data.skus.find((s) => s.id === bom?.product_sku_id)?.category ||
                "wip",
            ),
          )?.id || "",
        expires_on: "",
        reference: "",
      },
    };
    const clean = initial ? structuredClone(initial) : defaults[command];
    if (initial && ["sku", "location", "bom"].includes(command)) {
      clean.expected_revision = initial.revision;
      delete clean.revision;
      if (command === "bom") delete clean.id;
    }
    setForm(clean);
  }
  async function submit() {
    if (!modal || !data) return;
    setBusy(true);
    setError("");
    try {
      const routes: Record<Command, string> = {
        receipt: "receipts",
        issue: "issues",
        transfer: "transfers",
        sku: "skus",
        location: "locations",
        bom: "boms",
        production: "production",
      };
      const body = { ...form };
      if (body.expires_on === "") body.expires_on = null;
      if (body.manufactured_on === "") body.manufactured_on = null;
      if (modal === "production") {
        if (!plan?.ready) throw new Error("자재·LOT 소요량을 먼저 확인하세요.");
        body.allocations = plan.allocations;
      }
      const result = await api<any>("/supply/" + routes[modal], body);
      setMessage(
        result.duplicate
          ? "이미 처리된 요청입니다. 원장을 다시 확인했습니다."
          : `${commandNames[modal]} 처리를 저장했습니다.`,
      );
      setModal(null);
      setPlan(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function status(lot: Lot, status: string) {
    setBusy(true);
    setError("");
    try {
      await api("/supply/lot-status", {
        lot_id: lot.id,
        expected_revision: lot.revision,
        status,
      });
      setMessage("LOT 상태를 변경했습니다.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="agent-empty">
        {ui("공급망 원장을 불러오는 중입니다.")}
        {ui(error)}
      </div>
    );
  const skuName = (id: string) =>
      data.skus.find((s) => s.id === id)?.name || id,
    lotCode = (id: string) => data.lots.find((l) => l.id === id)?.code || id,
    locationName = (id: string | null) =>
      id ? data.locations.find((l) => l.id === id)?.name || id : "—",
    stock = data.balances.filter((b) => Number(b.quantity) > 0),
    stocked = new Set(stock.map((b) => b.lot_id)),
    held = data.lots.filter(
      (l) => stocked.has(l.id) && l.status !== "released",
    ).length;
  const selectedBom = data.boms.find((b) => b.id === form.bom_id),
    outputSku = data.skus.find((s) => s.id === selectedBom?.product_sku_id),
    selectedSku = data.skus.find((s) => s.id === form.sku_id);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">INDUSTRY-NEUTRAL SUPPLY CHAIN</div>
          <h1>
            {ui(industry.config.name)}
            {ui("· 공정과 공급망.")}
          </h1>
          <p>
            {ui(
              "입고부터 생산·출하까지, 같은 품목·LOT·BOM 원장으로 연결합니다.",
            )}
          </p>
        </div>
        <button className="btn" onClick={() => void load()}>
          <RefreshCw size={15} />
          {ui("원장 새로고침")}
        </button>
      </div>
      {error && !modal && (
          <div className="form-error" role="alert">
            {ui(error)}
          </div>
        )}
      {message && (
          <div className="field-success" role="status">
            <ShieldCheck size={16} />
            {ui(message)}
          </div>
        )}
      <div className="supply-processes">
        {industry.config.lines.map((l) => (
            <article key={l.id}>
              <header>
                <Factory size={19} />
                <b>
                  {ui(l.id)} LINE · {ui(l.name)}
                </b>
                <span>
                  {ui(
                    industry.config.id === "ramen"
                      ? "라면 전용 공정"
                      : "공정 프로필",
                  )}
                </span>
              </header>
              <div>
                {l.stages.map((stage, i) => (
                    <span key={i}>
                      <small>{ui(String(i + 1).padStart(2, "0"))}</small>
                      {ui(stage)}
                    </span>
                  ))}
              </div>
            </article>
          ))}
      </div>
      <div className="supply-kpis">
        {ui(
          [
            [Package, data.skus.length, "관리 품목"],
            [Warehouse, data.locations.length, "창고 로케이션"],
            [GitBranch, stocked.size, "재고 LOT"],
            [ShieldCheck, held, "검사 대기·차단 LOT"],
          ].map(([Icon, v, label], i) => {
            const I = Icon as typeof Package;
            return (
              <article key={i}>
                <I size={18} />
                <span>{ui(String(label))}</span>
                <b>{ui(String(v))}</b>
              </article>
            );
          }),
        )}
      </div>
      <div className="supply-tabs">
        {[
            ["inventory", "재고·창고"],
            ["movements", "입출고 원장"],
            ["lots", "LOT 추적"],
            ["boms", "BOM·생산"],
            ["industry", "업종·공정 설정"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "selected" : ""}
              onClick={() => {
                setTab(id);
                setError("");
              }}
            >
              {ui(label)}
            </button>
          ))}
      </div>
      {tab === "inventory" && (
          <>
            <div className="field-toolbar">
              <div className="module-search">
                <Search size={14} />
                <input
                  placeholder={ui("품목, LOT, 창고 검색")}
                  aria-label={ui("재고 검색")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div>
                <button
                  className="btn primary"
                  disabled={!write}
                  onClick={() => open("receipt")}
                >
                  <ArrowDownToLine size={14} />
                  {ui("입고")}
                </button>
                <button
                  className="btn"
                  disabled={!write}
                  onClick={() => open("transfer")}
                >
                  <ArrowRightLeft size={14} />
                  {ui("이동")}
                </button>
                <button
                  className="btn"
                  disabled={!write}
                  onClick={() => open("issue")}
                >
                  <ArrowUpFromLine size={14} />
                  {ui("출고")}
                </button>
              </div>
            </div>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>{ui("위치·LOT별 재고")}</h2>
                  <p>
                    {ui(
                      "품목별 기준 단위로 표시합니다. 검사 대기·차단·기한 경과 LOT는 투입·출고가 제한됩니다.",
                    )}
                  </p>
                </div>
                <Boxes size={20} />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{ui("품목 / 분류")}</th>
                      <th>LOT</th>
                      <th>{ui("창고 · 위치")}</th>
                      <th>{ui("상태 / 기한")}</th>
                      <th>{ui("보유 수량")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ui(
                      stock
                        .filter((b) =>
                          (
                            skuName(
                              data.lots.find((l) => l.id === b.lot_id)!.sku_id,
                            ) +
                            lotCode(b.lot_id) +
                            locationName(b.location_id)
                          )
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        )
                        .map((b) => {
                          const lot = data.lots.find((l) => l.id === b.lot_id)!,
                            sku = data.skus.find((s) => s.id === lot.sku_id)!,
                            loc = data.locations.find(
                              (l) => l.id === b.location_id,
                            )!;
                          return (
                            <tr key={b.lot_id + b.location_id}>
                              <td>
                                <b>{ui(sku.name)}</b>
                                <small className="block muted">
                                  {ui(sku.id)} ·{" "}
                                  {ui(categoryLabels[sku.category])}
                                </small>
                              </td>
                              <td>
                                <button
                                  className="supply-link"
                                  onClick={() => {
                                    setLotId(lot.id);
                                    setTab("lots");
                                  }}
                                >
                                  {ui(lot.code)}
                                </button>
                              </td>
                              <td>
                                {ui(loc.warehouse)}
                                <small className="block muted">
                                  {ui(loc.zone)} · {ui(loc.name)}
                                </small>
                              </td>
                              <td>
                                <span
                                  className={`lot-status ${isEligible(lot, today()) ? "released" : lot.status === "released" ? "blocked" : lot.status}`}
                                >
                                  {ui(
                                    lot.expires_on && lot.expires_on < today()
                                      ? "기한 경과"
                                      : statusLabels[lot.status],
                                  )}
                                </span>
                                <small className="block muted">
                                  {ui(lot.expires_on || "기한 미지정")}
                                </small>
                              </td>
                              <td>
                                <b>
                                  {ui(number(b.quantity))} {ui(sku.unit)}
                                </b>
                              </td>
                            </tr>
                          );
                        }),
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <div className="field-section-heading">
              <h2>{ui("창고·분류 규칙")}</h2>
              <button
                className="btn small-btn"
                disabled={!admin}
                onClick={() => open("location")}
              >
                <Plus size={14} />
                {ui("로케이션 등록")}
              </button>
            </div>
            <div className="supply-location-grid">
              {data.locations.map((l) => (
                  <article className="panel" key={l.id}>
                    <Warehouse size={22} />
                    <small>
                      {ui(l.warehouse)} · {ui(l.zone)}
                    </small>
                    <h3>{ui(l.name)}</h3>
                    <p>
                      {ui(
                        l.allowed_categories
                          .map((c) => categoryLabels[c])
                          .join(" · "),
                      )}
                    </p>
                    <footer>
                      <span>
                        {ui(stock.filter((b) => b.location_id === l.id).length)}
                        {ui("개 LOT 재고")}
                      </span>
                      <button
                        className="btn small-btn"
                        disabled={!admin}
                        onClick={() => open("location", l)}
                      >
                        {ui("편집")}
                      </button>
                    </footer>
                  </article>
                ))}
            </div>
            <details className="panel supply-masters">
              <summary>{ui("품목 마스터 · 최소재고·단위·분류 편집")}</summary>
              <button
                className="btn small-btn"
                disabled={!admin}
                onClick={() => open("sku")}
              >
                <Plus size={14} />
                {ui("품목 등록")}
              </button>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{ui("품목")}</th>
                      <th>{ui("분류")}</th>
                      <th>{ui("단위")}</th>
                      <th>{ui("최소재고")}</th>
                      <th>{ui("설정")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.skus.map((s) => (
                        <tr key={s.id}>
                          <td>
                            {ui(s.name)}
                            <small className="block muted">{ui(s.id)}</small>
                          </td>
                          <td>{ui(categoryLabels[s.category])}</td>
                          <td>{ui(s.unit)}</td>
                          <td>
                            {ui(number(s.min_stock))} {ui(s.unit)}
                          </td>
                          <td>
                            <button
                              className="btn small-btn"
                              disabled={!admin}
                              onClick={() => open("sku", s)}
                            >
                              {ui("편집 v")}
                              {ui(s.revision)}
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      {tab === "movements" && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>{ui("입고·이동·투입·출하 원장")}</h2>
                <p>
                  {ui(
                    "동일 요청 재전송은 한 번만 반영됩니다. 생산 투입과 결과 입고는 한 트랜잭션으로 저장합니다.",
                  )}
                </p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{ui("이력")}</th>
                    <th>{ui("품목 / LOT")}</th>
                    <th>{ui("수량")}</th>
                    <th>{ui("이동")}</th>
                    <th>{ui("기준 / 시각")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.movements]
                      .reverse()
                      .slice(0, 200)
                      .map((m) => (
                        <tr key={m.id}>
                          <td>
                            <span className="lot-status released">
                              {ui(actionLabels[m.action])}
                            </span>
                            <small className="block muted">{ui(m.id)}</small>
                          </td>
                          <td>
                            {ui(skuName(m.sku_id))}
                            <small className="block muted">
                              {ui(lotCode(m.lot_id))}
                            </small>
                          </td>
                          <td>
                            {ui(number(m.quantity))}
                            {" "}
                            {ui(data.skus.find((s) => s.id === m.sku_id)?.unit)}
                          </td>
                          <td>
                            {ui(locationName(m.from_location))} →{" "}
                            {ui(locationName(m.to_location))}
                          </td>
                          <td>
                            {ui(m.batch_id || m.reference || "—")}
                            <small className="block muted">
                              {ui(date(m.timestamp))}
                            </small>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      {tab === "lots" && (
          <>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>{ui("원료 → 반제품 → 완제품 LOT 계보")}</h2>
                  <p>
                    {ui(
                      "현재 선택 LOT의 상위 투입 원료와 하위 생산 LOT를 추적합니다.",
                    )}
                  </p>
                </div>
                <select
                  aria-label={ui("추적할 LOT")}
                  value={lotId}
                  onChange={(e) => setLotId(e.target.value)}
                >
                  {data.lots.map((l) => (
                      <option key={l.id} value={l.id}>
                        {ui(skuName(l.sku_id))} · {ui(l.code)}
                      </option>
                    ))}
                </select>
              </div>
              {trace && (
                  <LotGenealogy
                    trace={trace}
                    onSelect={setLotId}
                    skuName={skuName}
                  />
                )}
            </section>
            <section className="panel">
              <div className="panel-header">
                <h2>{ui("LOT 사용 상태 관리")}</h2>
                <span>{ui("승인·차단은 관리자 권한")}</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{ui("LOT / 품목")}</th>
                      <th>{ui("제조일 · 기한")}</th>
                      <th>{ui("공급처 / 상위 LOT")}</th>
                      <th>{ui("현재 상태")}</th>
                      <th>{ui("변경")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lots.map((l) => (
                        <tr key={l.id}>
                          <td>
                            <button
                              className="supply-link"
                              onClick={() => setLotId(l.id)}
                            >
                              {ui(l.code)}
                            </button>
                            <small className="block muted">
                              {ui(skuName(l.sku_id))}
                            </small>
                          </td>
                          <td>
                            {ui(l.manufactured_on || "—")}
                            <small className="block muted">
                              {ui(l.expires_on || "미지정")}
                            </small>
                          </td>
                          <td>
                            {ui(l.supplier || "자체 생산")}
                            <small className="block muted">
                              {ui("상위 투입 LOT")}
                              {ui(l.parents.length)}
                              {ui("개")}
                            </small>
                          </td>
                          <td>
                            <span className={`lot-status ${l.status}`}>
                              {ui(statusLabels[l.status])}
                            </span>
                          </td>
                          <td>
                            <select
                              aria-label={ui(`${l.code} 상태`)}
                              value={l.status}
                              disabled={!admin || busy}
                              onChange={(e) => void status(l, e.target.value)}
                            >
                              {Object.entries(statusLabels).map(([id, n]) => (
                                  <option key={id} value={id}>
                                    {ui(n)}
                                  </option>
                                ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      {tab === "boms" && (
          <>
            <div className="field-toolbar">
              <p className="field-dialog-description">
                {ui(
                  "다단계 BOM을 보관하고, 생산할 때 해당 버전의 소요량과 LOT 할당을 검토합니다.",
                )}
              </p>
              <div>
                <button
                  className="btn"
                  disabled={!admin}
                  onClick={() => open("bom")}
                >
                  <Plus size={14} />
                  {ui("BOM 등록")}
                </button>
                <button
                  className="btn primary"
                  disabled={!write || !data.boms.length}
                  onClick={() => open("production")}
                >
                  <Factory size={15} />
                  {ui("BOM 기준 생산")}
                </button>
              </div>
            </div>
            <div className="supply-bom-grid">
              {data.boms.map((b) => (
                  <article className="panel" key={b.id}>
                    <header>
                      <span className="module-card-icon">
                        <GitBranch size={22} />
                      </span>
                      <div>
                        <small>
                          {ui(b.id)} · v{ui(b.revision)}
                        </small>
                        <h3>{ui(b.name)}</h3>
                      </div>
                    </header>
                    <p>
                      {ui("산출")}
                      {ui(number(b.output_quantity))}
                      {" "}
                      {ui(
                        data.skus.find((s) => s.id === b.product_sku_id)?.unit,
                      )}{" "}
                      ·{" "}
                      {ui(skuName(b.product_sku_id))}
                    </p>
                    <div>
                      {b.components.map((c) => (
                          <span key={c.sku_id}>
                            <b>{ui(skuName(c.sku_id))}</b>
                            <em>
                              {ui(number(c.quantity))}
                              {" "}
                              {ui(
                                data.skus.find((s) => s.id === c.sku_id)?.unit,
                              )}
                            </em>
                          </span>
                        ))}
                    </div>
                    <footer>
                      <button
                        className="btn small-btn"
                        disabled={!admin}
                        onClick={() => open("bom", b)}
                      >
                        {ui("BOM 편집")}
                      </button>
                      <button
                        className="btn small-btn"
                        disabled={!write}
                        onClick={() => {
                          open("production");
                          setForm((f) => ({
                            ...f,
                            bom_id: b.id,
                            bom_revision: b.revision,
                            quantity: b.output_quantity,
                            to_location:
                              data.locations.find((l) =>
                                l.allowed_categories.includes(
                                  data.skus.find(
                                    (s) => s.id === b.product_sku_id,
                                  )!.category,
                                ),
                              )?.id || "",
                          }));
                        }}
                      >
                        {ui("소요량 확인·생산")}
                      </button>
                    </footer>
                  </article>
                ))}
            </div>
            <section className="panel">
              <div className="panel-header">
                <h2>{ui("생산 배치 · 사용 BOM 버전")}</h2>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{ui("배치")}</th>
                      <th>{ui("생산 LOT")}</th>
                      <th>{ui("산출 수량")}</th>
                      <th>{ui("고정 BOM")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.batches].reverse().map((b) => (
                        <tr key={b.batch_id}>
                          <td>{ui(b.batch_id)}</td>
                          <td>
                            <button
                              className="supply-link"
                              onClick={() => {
                                setLotId(b.lot_id);
                                setTab("lots");
                              }}
                            >
                              {ui(lotCode(b.lot_id))}
                            </button>
                          </td>
                          <td>
                            {ui(number(b.quantity))}
                            {" "}
                            {ui(
                              data.skus.find(
                                (s) => s.id === b.bom_snapshot.product_sku_id,
                              )?.unit,
                            )}
                          </td>
                          <td>
                            {ui(b.bom_snapshot.name)} · v
                            {ui(b.bom_snapshot.revision)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      {tab === "industry" && profile && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>{ui("업종 프로필 · 공정 이름 편집")}</h2>
                <p>
                  {ui(
                    "프로필은 공정 표현과 에이전트 호환 범위를 변경합니다. 기존 설비·재고·LOT·BOM·실행 이력은 보존합니다.",
                  )}
                </p>
              </div>
            </div>
            <form
              className="form-body"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const next = await api<IndustryState>("/industry", {
                    expected_revision: industry.revision,
                    config: profile,
                  });
                  setIndustry(next);
                  setMessage(
                    "업종·공정 프로필을 적용했습니다. 공통 원장은 유지됩니다.",
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="module-form-grid">
                <label>
                  {ui("업종 템플릿")}
                  <select
                    disabled={!admin}
                    value={profile.id}
                    onChange={(e) =>
                      setProfile(
                        structuredClone(
                          industry.templates.find(
                            (p) => p.id === e.target.value,
                          )!,
                        ),
                      )
                    }
                  >
                    {industry.templates.map((p) => (
                        <option key={p.id} value={p.id}>
                          {ui(p.name)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  {ui("워크스페이스 이름")}
                  <input
                    disabled={!admin}
                    value={profile.plant_name}
                    maxLength={80}
                    onChange={(e) =>
                      setProfile({ ...profile, plant_name: e.target.value })
                    }
                  />
                </label>
                <label>
                  {ui("업종 이름")}
                  <input
                    disabled={!admin}
                    value={profile.name}
                    maxLength={60}
                    onChange={(e) =>
                      setProfile({ ...profile, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  {ui("업종 설명")}
                  <input
                    disabled={!admin}
                    value={profile.description}
                    maxLength={500}
                    onChange={(e) =>
                      setProfile({ ...profile, description: e.target.value })
                    }
                  />
                </label>
              </div>
              {profile.lines.map((l, i) => (
                  <div className="industry-line-edit" key={l.id}>
                    <h3>{ui(l.id)} LINE</h3>
                    <label>
                      {ui("라인 이름")}
                      <input
                        disabled={!admin}
                        value={l.name}
                        maxLength={60}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            lines: profile.lines.map((x, j) =>
                              i === j ? { ...x, name: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      {ui("공정 설명")}
                      <input
                        disabled={!admin}
                        value={l.description}
                        maxLength={200}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            lines: profile.lines.map((x, j) =>
                              i === j
                                ? { ...x, description: e.target.value }
                                : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      {ui("공정 단계 (한 줄에 한 단계)")}
                      <textarea
                        disabled={!admin}
                        value={l.stages.join("\n")}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            lines: profile.lines.map((x, j) =>
                              i === j
                                ? { ...x, stages: e.target.value.split("\n") }
                                : x,
                            ),
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
              <p className="field-dialog-description">
                {ui(
                  "라면 전용 에이전트는 일반 제조 프로필에서 제외되고, 공통 물류·분류·재고·창고·LOT·BOM 에이전트는 유지됩니다.",
                )}
              </p>
              <button className="btn primary" disabled={!admin || busy}>
                <Save size={15} />
                {ui("업종·공정 적용 v")}
                {ui(industry.revision)}
              </button>
            </form>
          </section>
        )}
      {modal && (
          <FieldDialog
            title={ui(commandNames[modal])}
            onClose={() => {
              if (!busy) setModal(null);
            }}
            wide={modal === "production" || modal === "bom"}
          >
            <form
              className="form-body"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {error && (
                  <div className="form-error" role="alert">
                    {ui(error)}
                  </div>
                )}
              {modal === "sku" && (
                  <>
                    <label>
                      {ui("품목 ID")}
                      <input
                        required
                        pattern="[A-Z0-9][A-Z0-9_-]{0,29}"
                        disabled={!!form.expected_revision}
                        value={form.id}
                        onChange={(e) => patch({ id: e.target.value })}
                      />
                    </label>
                    <label>
                      {ui("품목 이름")}
                      <input
                        required
                        minLength={2}
                        maxLength={80}
                        value={form.name}
                        onChange={(e) => patch({ name: e.target.value })}
                      />
                    </label>
                    <div className="module-form-grid">
                      <label>
                        {ui("분류")}
                        <select
                          value={form.category}
                          onChange={(e) => patch({ category: e.target.value })}
                        >
                          {Object.entries(categoryLabels).map(([id, n]) => (
                              <option key={id} value={id}>
                                {ui(n)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        {ui("기준 단위")}
                        <select
                          value={form.unit}
                          onChange={(e) => patch({ unit: e.target.value })}
                        >
                          {["kg", "ea", "box"].map((u) => (
                              <option key={u}>{ui(u)}</option>
                            ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      {ui("최소재고")}
                      <input
                        required
                        type="number"
                        min="0"
                        max="1000000000"
                        step=".001"
                        value={form.min_stock}
                        onChange={(e) => patch({ min_stock: e.target.value })}
                      />
                    </label>
                    <p className="field-dialog-description">
                      {ui(
                        "LOT 또는 BOM에 사용된 품목의 기준 단위는 변경할 수 없습니다.",
                      )}
                    </p>
                  </>
                )}
              {modal === "location" && (
                  <>
                    <label>
                      {ui("로케이션 ID")}
                      <input
                        required
                        pattern="[A-Z0-9][A-Z0-9_-]{0,29}"
                        disabled={!!form.expected_revision}
                        value={form.id}
                        onChange={(e) => patch({ id: e.target.value })}
                      />
                    </label>
                    {[
                        ["name", "로케이션 이름"],
                        ["warehouse", "창고"],
                        ["zone", "구역"],
                      ].map(([key, label]) => (
                        <label key={key}>
                          {ui(label)}
                          <input
                            required
                            minLength={2}
                            maxLength={60}
                            value={form[key]}
                            onChange={(e) => patch({ [key]: e.target.value })}
                          />
                        </label>
                      ))}
                    <div className="module-dependencies">
                      {Object.entries(categoryLabels).map(([id, n]) => (
                          <label className="check-row" key={id}>
                            <input
                              type="checkbox"
                              checked={form.allowed_categories.includes(id)}
                              onChange={(e) =>
                                patch({
                                  allowed_categories: e.target.checked
                                    ? [...form.allowed_categories, id]
                                    : form.allowed_categories.filter(
                                        (x: string) => x !== id,
                                      ),
                                })
                              }
                            />
                            {ui(n)}
                            {ui("적치 허용")}
                          </label>
                        ))}
                    </div>
                  </>
                )}
              {modal === "receipt" && (
                  <>
                    <label>
                      {ui("입고 품목")}
                      <select
                        value={form.sku_id}
                        onChange={(e) => {
                          const sku = data.skus.find(
                            (s) => s.id === e.target.value,
                          )!;
                          patch({
                            sku_id: sku.id,
                            to_location:
                              data.locations.find((l) =>
                                l.allowed_categories.includes(sku.category),
                              )?.id || "",
                          });
                        }}
                      >
                        {data.skus.map((s) => (
                            <option key={s.id} value={s.id}>
                              {ui(s.name)} · {ui(s.unit)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      {ui("입고 위치")}
                      <select
                        required
                        value={form.to_location}
                        onChange={(e) => patch({ to_location: e.target.value })}
                      >
                        {data.locations
                            .filter((l) =>
                              l.allowed_categories.includes(
                                selectedSku?.category || "raw",
                              ),
                            )
                            .map((l) => (
                              <option key={l.id} value={l.id}>
                                {ui(l.warehouse)} · {ui(l.name)}
                              </option>
                            ))}
                      </select>
                    </label>
                    <label>
                      {ui("공급처")}
                      <input
                        maxLength={80}
                        value={form.supplier}
                        onChange={(e) => patch({ supplier: e.target.value })}
                      />
                    </label>
                    <label>
                      {ui("제조일")}
                      <input
                        type="date"
                        max={today()}
                        value={form.manufactured_on || ""}
                        onChange={(e) =>
                          patch({ manufactured_on: e.target.value })
                        }
                      />
                    </label>
                    <p className="field-dialog-description">
                      {ui(
                        "신규 입고 LOT는 검사 대기로 등록됩니다. 관리자가 사용 승인 후 출고·투입할 수 있습니다.",
                      )}
                    </p>
                  </>
                )}
              {(modal === "issue" || modal === "transfer") && (
                  <>
                    <label>
                      {ui("출발 재고 (LOT · 위치)")}
                      <select
                        required
                        value={form.lot_id + "|" + form.from_location}
                        onChange={(e) => {
                          const [lot_id, from_location] =
                            e.target.value.split("|");
                          patch({ lot_id, from_location });
                        }}
                      >
                        <option value="|">{ui("재고 선택")}</option>
                        {stock
                            .filter(
                              (b) =>
                                modal === "transfer" ||
                                isEligible(
                                  data.lots.find((l) => l.id === b.lot_id)!,
                                  today(),
                                ),
                            )
                            .map((b) => (
                              <option
                                key={b.lot_id + b.location_id}
                                value={b.lot_id + "|" + b.location_id}
                              >
                                {ui(
                                  skuName(
                                    data.lots.find((l) => l.id === b.lot_id)!
                                      .sku_id,
                                  ),
                                )}
                                {" "}· {ui(lotCode(b.lot_id))} ·{" "}
                                {ui(locationName(b.location_id))}
                                {" "}· {ui(number(b.quantity))}
                              </option>
                            ))}
                      </select>
                    </label>
                    {modal === "transfer" && (
                        <label>
                          {ui("도착 위치")}
                          <select
                            required
                            value={form.to_location}
                            onChange={(e) =>
                              patch({ to_location: e.target.value })
                            }
                          >
                            {data.locations
                                .filter(
                                  (l) =>
                                    !form.lot_id ||
                                    l.allowed_categories.includes(
                                      data.skus.find(
                                        (s) =>
                                          s.id ===
                                          data.lots.find(
                                            (x) => x.id === form.lot_id,
                                          )?.sku_id,
                                      )?.category || "raw",
                                    ),
                                )
                                .map((l) => (
                                  <option key={l.id} value={l.id}>
                                    {ui(l.warehouse)} · {ui(l.name)}
                                  </option>
                                ))}
                          </select>
                        </label>
                      )}
                  </>
                )}
              {modal === "bom" && (
                  <>
                    <div className="module-form-grid">
                      <label>
                        {ui("산출 품목")}
                        <select
                          disabled={!!form.expected_revision}
                          value={form.product_sku_id}
                          onChange={(e) =>
                            patch({ product_sku_id: e.target.value })
                          }
                        >
                          {data.skus.map((s) => (
                              <option key={s.id} value={s.id}>
                                {ui(s.name)} · {ui(s.unit)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        {ui("BOM 이름")}
                        <input
                          required
                          minLength={2}
                          maxLength={80}
                          value={form.name}
                          onChange={(e) => patch({ name: e.target.value })}
                        />
                      </label>
                    </div>
                    <label>
                      {ui("기준 산출 수량")}
                      <input
                        required
                        type="number"
                        min=".001"
                        step=".001"
                        max="1000000000"
                        value={form.output_quantity}
                        onChange={(e) =>
                          patch({ output_quantity: e.target.value })
                        }
                      />
                    </label>
                    <div className="supply-bom-editor">
                      {form.components.map((c: any, i: number) => (
                          <div key={i}>
                            <label>
                              {ui("구성품")}
                              {ui(i + 1)}
                              <select
                                value={c.sku_id}
                                onChange={(e) =>
                                  patch({
                                    components: form.components.map(
                                      (x: any, j: number) =>
                                        j === i
                                          ? { ...x, sku_id: e.target.value }
                                          : x,
                                    ),
                                  })
                                }
                              >
                                {data.skus.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {ui(s.name)} · {ui(s.unit)}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <label>
                              {ui("투입량")}
                              <input
                                required
                                type="number"
                                min=".001"
                                step=".001"
                                value={c.quantity}
                                onChange={(e) =>
                                  patch({
                                    components: form.components.map(
                                      (x: any, j: number) =>
                                        j === i
                                          ? { ...x, quantity: e.target.value }
                                          : x,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <button
                              type="button"
                              className="btn small-btn"
                              disabled={form.components.length === 1}
                              onClick={() =>
                                patch({
                                  components: form.components.filter(
                                    (_: any, j: number) => i !== j,
                                  ),
                                })
                              }
                            >
                              {ui("삭제")}
                            </button>
                          </div>
                        ))}
                    </div>
                    <button
                      type="button"
                      className="btn"
                      disabled={form.components.length >= 30}
                      onClick={() =>
                        patch({
                          components: [
                            ...form.components,
                            { sku_id: data.skus[0]?.id, quantity: "1" },
                          ],
                        })
                      }
                    >
                      <Plus size={14} />
                      {ui("구성품 추가")}
                    </button>
                  </>
                )}
              {modal === "production" && (
                  <>
                    <div className="module-form-grid">
                      <label>
                        {ui("생산 BOM")}
                        <select
                          value={form.bom_id}
                          onChange={(e) => {
                            const b = data.boms.find(
                              (b) => b.id === e.target.value,
                            )!;
                            patch({
                              bom_id: b.id,
                              bom_revision: b.revision,
                              quantity: b.output_quantity,
                              to_location:
                                data.locations.find((l) =>
                                  l.allowed_categories.includes(
                                    data.skus.find(
                                      (s) => s.id === b.product_sku_id,
                                    )!.category,
                                  ),
                                )?.id || "",
                            });
                          }}
                        >
                          {data.boms.map((b) => (
                              <option key={b.id} value={b.id}>
                                {ui(b.name)} · v{ui(b.revision)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        {ui("생산 입고 위치")}
                        <select
                          required
                          value={form.to_location}
                          onChange={(e) =>
                            patch({ to_location: e.target.value })
                          }
                        >
                          {data.locations
                              .filter((l) =>
                                l.allowed_categories.includes(
                                  outputSku?.category || "wip",
                                ),
                              )
                              .map((l) => (
                                <option key={l.id} value={l.id}>
                                  {ui(l.warehouse)} · {ui(l.name)}
                                </option>
                              ))}
                        </select>
                      </label>
                    </div>
                    <p className="field-dialog-description">
                      {ui(
                        "검토한 LOT를 투입하고 새로운 산출 LOT를 검사 대기로 입고합니다. 생산 배치에 사용한 BOM 버전을 고정합니다.",
                      )}
                    </p>
                  </>
                )}
              {["receipt", "issue", "transfer", "production"].includes(
                  modal,
                ) && (
                  <label>
                    {ui("수량")}
                    {" "}
                    {ui(
                      modal === "production"
                        ? outputSku?.unit
                        : modal === "receipt"
                          ? selectedSku?.unit
                          : "",
                    )}
                    <input
                      required
                      type="number"
                      min=".001"
                      max="1000000000"
                      step=".001"
                      value={form.quantity}
                      onChange={(e) => patch({ quantity: e.target.value })}
                    />
                  </label>
                )}
              {(modal === "receipt" || modal === "production") && (
                  <div className="module-form-grid">
                    <label>
                      {ui("LOT 코드")}
                      <input
                        required
                        maxLength={60}
                        value={form.lot_code}
                        onChange={(e) => patch({ lot_code: e.target.value })}
                      />
                    </label>
                    <label>
                      {ui("소비/유효기한")}
                      <input
                        type="date"
                        min={form.manufactured_on || today()}
                        value={form.expires_on || ""}
                        onChange={(e) => patch({ expires_on: e.target.value })}
                      />
                    </label>
                  </div>
                )}
              {["receipt", "issue", "transfer", "production"].includes(
                  modal,
                ) && (
                  <label>
                    {ui("참조 / 작업 번호")}
                    <input
                      value={form.reference}
                      maxLength={200}
                      onChange={(e) => patch({ reference: e.target.value })}
                    />
                  </label>
                )}
              {modal === "production" && (
                  <>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          setPlan(
                            await api<ProductionPlan>(
                              "/supply/production-preview",
                              {
                                bom_id: form.bom_id,
                                bom_revision: form.bom_revision,
                                quantity: form.quantity,
                              },
                            ),
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Search size={15} />
                      {ui("소요량·FEFO LOT 할당 확인")}
                    </button>
                    {plan && (
                        <div className="supply-production-plan">
                          <h3>
                            {ui(
                              plan.ready
                                ? "투입 가능한 재고를 확인했습니다."
                                : "부족한 자재를 확인하세요.",
                            )}
                          </h3>
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>{ui("구성품")}</th>
                                  <th>{ui("필요")}</th>
                                  <th>{ui("부족")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {plan.needs.map((n) => (
                                    <tr key={n.sku_id}>
                                      <td>{ui(n.name)}</td>
                                      <td>
                                        {ui(number(n.required))} {ui(n.unit)}
                                      </td>
                                      <td>
                                        {ui(number(n.shortage))} {ui(n.unit)}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                          <p>
                            {ui(
                              "기한이 먼저 도래하는 사용 승인 LOT부터 추천합니다.",
                            )}
                          </p>
                          {plan.allocations.map((a) => (
                              <div
                                className="supply-allocation"
                                key={a.lot_id + a.from_location}
                              >
                                <span>
                                  {ui(lotCode(a.lot_id))} ·{" "}
                                  {ui(locationName(a.from_location))}
                                </span>
                                <b>
                                  {ui(number(a.quantity))}
                                  {" "}
                                  {ui(
                                    data.skus.find(
                                      (s) =>
                                        s.id ===
                                        data.lots.find((l) => l.id === a.lot_id)
                                          ?.sku_id,
                                    )?.unit,
                                  )}
                                </b>
                              </div>
                            ))}
                        </div>
                      )}
                  </>
                )}
              <button
                className="btn primary"
                disabled={busy || (modal === "production" && !plan?.ready)}
              >
                <Save size={15} />
                {ui(
                  modal === "production" ? "검토한 LOT 투입·생산 입고" : "저장",
                )}
              </button>
            </form>
          </FieldDialog>
        )}
    </>
  );
}
function LotGenealogy({
  trace,
  onSelect,
  skuName,
}: {
  trace: LotTrace;
  onSelect: (id: string) => void;
  skuName: (id: string) => string;
}) {
  const depths: Record<string, number> = {};
  const depth = (id: string, seen = new Set<string>()): number => {
    if (id in depths) return depths[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    const parents = trace.edges
      .filter((e) => e.target === id)
      .map((e) => e.source);
    return (depths[id] = parents.length
      ? Math.max(...parents.map((p) => depth(p, new Set(seen)))) + 1
      : 0);
  };
  trace.nodes.forEach((l) => depth(l.id));
  const levels = Array.from(
    { length: Math.max(0, ...Object.values(depths)) + 1 },
    (_, i) => trace.nodes.filter((l) => depths[l.id] === i),
  );
  return (
    <>
      <div className="lot-genealogy">
        {levels.map((level, i) => (
            <div key={i}>
              <small>{ui(i === 0 ? "원료·외부 입고" : `${i}단계 생산`)}</small>
              {level.map((l) => (
                  <button
                    key={l.id}
                    className={trace.root === l.id ? "selected" : ""}
                    onClick={() => onSelect(l.id)}
                  >
                    <GitBranch size={17} />
                    <b>{ui(skuName(l.sku_id))}</b>
                    <span>{ui(l.code)}</span>
                    <em className={`lot-status ${l.status}`}>
                      {ui(statusLabels[l.status])}
                    </em>
                  </button>
                ))}
            </div>
          ))}
      </div>
      <div className="lot-edge-list">
        {trace.edges.map((e) => (
            <span key={e.source + e.target}>
              {ui(trace.nodes.find((l) => l.id === e.source)?.code)} →{" "}
              {ui(trace.nodes.find((l) => l.id === e.target)?.code)}
            </span>
          ))}
      </div>
    </>
  );
}
