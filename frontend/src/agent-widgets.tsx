import { ui } from "./i18n/locale";
import { intlLocale } from "./i18n/locale";
import { useEffect, useState } from "react";
import { Bot, Settings2, RefreshCw } from "lucide-react";
import { api } from "./api";
import { FieldDialog } from "./field-ui";
import type { AgentModule } from "./agent-modules/contracts";
import { lineLabel, useIndustry } from "./industry-context";
import { defaults, metricLabels } from "./agent-widget-model";
import type { AgentWidgetResult, WidgetLayout } from "./agent-widget-model";
export function AgentWidgetCards({
  results,
  floor = false,
}: {
  results: AgentWidgetResult[];
  floor?: boolean;
}) {
  return (
    <div className={`agent-widget-grid ${floor ? "floor-agent-grid" : ""}`}>
      {results.map((r) => (
        <article className="agent-widget-card" key={r.id}>
          <header>
            <span>
              <Bot size={floor ? 28 : 17} />
              {ui(r.name)}
            </span>
            <small>
              {ui(r.line)} LINE · v{ui(r.module_revision)}
            </small>
          </header>
          {r.fact ? (
            <>
              <p>{ui(r.fact.summary)}</p>
              <div className="agent-widget-metrics">
                {Object.entries(r.fact.metrics || {})
                  .slice(0, 4)
                  .map(([k, v]) => (
                    <span key={k}>
                      <small>{ui(metricLabels[k] || k)}</small>
                      <b>
                        {ui(
                          v.toLocaleString(intlLocale(), {
                            maximumFractionDigits: 3,
                          }),
                        )}
                      </b>
                    </span>
                  ))}
              </div>
              <footer>
                {ui("도구 결과 · 조회 전용 ·")}{" "}
                {ui(
                  new Date(r.captured_at).toLocaleTimeString(intlLocale(), {
                    hour12: false,
                  }),
                )}
              </footer>
            </>
          ) : (
            <p>{ui(r.message)}</p>
          )}
        </article>
      ))}
    </div>
  );
}
export function DashboardAgentWidgets() {
  const industry = useIndustry(),
    [layout, setLayout] = useState<WidgetLayout | null>(null),
    [results, setResults] = useState<AgentWidgetResult[]>([]),
    [modules, setModules] = useState<AgentModule[]>([]),
    [draft, setDraft] = useState<WidgetLayout | null>(null),
    [error, setError] = useState("");
  const load = async () => {
    try {
      const [l, m] = await Promise.all([
        api<WidgetLayout>("/agent-widgets/layout"),
        api<AgentModule[]>("/agents/modules"),
      ]);
      setLayout(l);
      setModules(m);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, [industry.revision]);
  useEffect(() => {
    if (!layout?.enabled) {
      setResults([]);
      return;
    }
    let alive = true;
    const update = () =>
      api<AgentWidgetResult[]>(
        `/agent-widgets/results?line=${layout.line}&ids=${layout.module_ids.join(",")}`,
      )
        .then((r) => {
          if (alive) {
            setResults(r);
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    void update();
    const timer = setInterval(update, 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [layout, industry.revision]);
  return (
    <section className="dashboard-agent-widgets">
      <div className="field-section-heading">
        <div>
          <div className="eyebrow">REUSABLE OPERATIONS AGENTS</div>
          <h2>
            {ui("공용 운영 에이전트 ·")}
            {ui(lineLabel(layout?.line || "A"))}
          </h2>
          <p>
            {ui("재고·창고·LOT·BOM 상태를 동일한 원장 기준으로 분석합니다.")}
          </p>
        </div>
        <button
          className="btn small-btn"
          onClick={() => setDraft(structuredClone(layout || defaults))}
        >
          <Settings2 size={14} />
          {ui("위젯 설치·설정")}
        </button>
      </div>
      {error && <div className="form-error">{ui(error)}</div>}
      {layout?.enabled ? (
        <AgentWidgetCards results={results} />
      ) : (
        <p className="field-dialog-description">
          {ui("위젯 사용을 켜고 필요한 에이전트를 설치하세요.")}
        </p>
      )}
      {draft && (
        <FieldDialog
          title={ui("대시보드 에이전트 위젯")}
          onClose={() => setDraft(null)}
        >
          <form
            className="form-body"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const l = await api<WidgetLayout>(
                  "/agent-widgets/layout",
                  draft,
                );
                setLayout(l);
                setDraft(null);
                setError("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {error && <div className="form-error">{ui(error)}</div>}
            <label className="check-row">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) =>
                  setDraft({ ...draft, enabled: e.target.checked })
                }
              />
              {ui("위젯 사용")}
            </label>
            <label>
              {ui("라인")}
              <select
                value={draft.line}
                onChange={(e) => setDraft({ ...draft, line: e.target.value })}
              >
                <option value="A">{ui(lineLabel("A"))}</option>
                <option value="B">{ui(lineLabel("B"))}</option>
              </select>
            </label>
            <AgentWidgetPicker
              modules={modules}
              selected={draft.module_ids}
              onChange={(ids) => setDraft({ ...draft, module_ids: ids })}
            />
            <button className="btn primary">
              <RefreshCw size={14} />
              {ui("위젯 적용")}
            </button>
          </form>
        </FieldDialog>
      )}
    </section>
  );
}
export function AgentWidgetPicker({
  modules,
  selected,
  onChange,
  disabled = false,
}: {
  modules: AgentModule[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="agent-widget-picker">
      {modules
        .filter((m) => m.enabled && m.compatible !== false)
        .map((m) => (
          <label className="check-row" key={m.id}>
            <input
              type="checkbox"
              checked={selected.includes(m.id)}
              disabled={
                disabled || (!selected.includes(m.id) && selected.length >= 4)
              }
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, m.id]
                    : selected.filter((id) => id !== m.id),
                )
              }
            />
            {ui(m.name)}
            <small>
              {ui(m.industries?.includes("common") ? "업종 공통" : "라면 전용")}
            </small>
          </label>
        ))}
    </div>
  );
}
