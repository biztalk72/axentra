import { ui } from "./i18n/locale";
import { intlLocale } from "./i18n/locale";
import { useIndustry } from "./industry-context";
import { useEffect, useState } from "react";
import {
  Bot,
  Box,
  Check,
  Copy,
  FlaskConical,
  GitBranch,
  History,
  Plus,
  Play,
  RefreshCw,
  Save,
  Search,
} from "lucide-react";
import { api, date } from "./api";
import { FieldDialog } from "./field-ui";
import { editable } from "./agent-modules/registry";
import type { AgentModule, AgentModuleConfig } from "./agent-modules/contracts";
import type { AgentFact } from "./agent-model";
export function AgentModulesPage({
  admin,
  write,
  onChanged,
  onRun,
}: {
  admin: boolean;
  write: boolean;
  onChanged: () => void;
  onRun: (id: string) => void;
}) {
  const industry = useIndustry();
  const [scope, setScope] = useState("all");
  const [items, setItems] = useState<AgentModule[]>([]),
    [selected, setSelected] = useState("equipment"),
    [draft, setDraft] = useState<AgentModuleConfig | null>(null),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<Record<string, AgentFact> | null>(null),
    [adding, setAdding] = useState(false),
    [template, setTemplate] = useState("equipment"),
    [newId, setNewId] = useState(""),
    [newName, setNewName] = useState("");
  const current = items.find((m) => m.id === selected),
    dirty =
      !!current &&
      !!draft &&
      JSON.stringify(editable(current)) !== JSON.stringify(draft);
  async function load() {
    try {
      setItems(await api<AgentModule[]>("/agents/modules"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (current) {
      setDraft(editable(current));
      setPreview(null);
    }
  }, [selected, current?.revision]);
  const patch = (v: Partial<AgentModuleConfig>) => {
    setDraft((d) => (d ? { ...d, ...v } : d));
    setPreview(null);
  };
  async function save() {
    if (!draft || !current) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(`/agents/modules/${current.id}`, {
        expected_revision: current.revision,
        config: draft,
      });
      await load();
      onChanged();
      setMessage("에이전트 구성을 저장했습니다. 다음 실행부터 적용됩니다.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    if (!draft || !current) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ line_results: Record<string, AgentFact> }>(
        `/agents/modules/${current.id}/preview`,
        draft,
      );
      setPreview(result.line_results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FUNCTION AGENT LIBRARY</div>
          <h1>{ui("기능을 나누고, 필요한 역할을 조합하세요.")}</h1>
          <p>
            {ui(
              "독립 에이전트의 진단 기준과 의존성을 관리합니다. 변경은 다음 실행에 적용됩니다.",
            )}
          </p>
        </div>
        <button
          className="btn primary"
          disabled={!admin}
          onClick={() => {
            setError("");
            setAdding(true);
          }}
        >
          <Plus size={16} />
          {ui("에이전트 구성 추가")}
        </button>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {ui(error)}
        </div>
      )}
      {message && (
        <div className="field-success" role="status">
          <Check size={15} />
          {ui(message)}
        </div>
      )}
      <div className="module-summary">
        <span>
          <Box size={19} />
          <b>{ui(items.length)}</b>
          {ui("독립 에이전트")}
        </span>
        <span>
          <i className="status-dot" />
          <b>{ui(items.filter((m) => m.enabled).length)}</b>
          {ui("사용 중")}
        </span>
        <span>
          <GitBranch size={18} />
          {ui("의존성 기반 실행")}
        </span>
        <span>
          <History size={18} />
          {ui("구성 리비전 고정")}
        </span>
      </div>
      <div className="field-toolbar">
        <div className="segmented">
          {[
            ["all", "전체 카탈로그"],
            ["common", "업종 공통"],
            ["ramen", "라면 전용"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={scope === id ? "selected" : ""}
              onClick={() => setScope(id)}
            >
              {ui(label)}
            </button>
          ))}
        </div>
        <span className="field-dialog-description">
          {ui("현재 업종:")}
          {ui(industry.config.name)}
          {ui("· 공통 에이전트는 업종 전환 후에도 재사용합니다.")}
        </span>
      </div>
      <div className="module-studio">
        <aside className="module-library">
          <div className="module-search">
            <Search size={15} />
            <input
              aria-label={ui("에이전트 검색")}
              placeholder={ui("기능, 에이전트 검색")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              className="icon-button"
              aria-label={ui("모듈 목록 새로고침")}
              onClick={() => void load()}
            >
              <RefreshCw size={14} />
            </button>
          </div>
          {items
            .filter((m) => scope === "all" || m.industries?.includes(scope))
            .filter((m) =>
              (m.name + m.category + m.id)
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((m) => (
              <button
                key={m.id}
                className={`module-card ${selected === m.id ? "selected" : ""}`}
                onClick={() => {
                  setSelected(m.id);
                  setError("");
                  setMessage("");
                }}
                disabled={dirty && m.id !== selected}
              >
                <span className="module-card-icon">
                  <Bot size={19} />
                </span>
                <span>
                  <small>{ui(m.category)}</small>
                  <b>{ui(m.name)}</b>
                  <em>
                    {ui(
                      m.industries?.includes("common")
                        ? "업종 공통"
                        : "라면 전용",
                    )}{" "}
                    · v{ui(m.revision)}
                  </em>
                </span>
                <i
                  className={
                    m.enabled && m.compatible !== false ? "enabled" : "disabled"
                  }
                >
                  {ui(
                    m.compatible === false
                      ? "업종 외"
                      : m.enabled
                        ? "사용"
                        : "중지",
                  )}
                </i>
              </button>
            ))}
          {!items.length && (
            <p className="agent-empty">
              {ui("에이전트 목록을 불러오는 중입니다.")}
            </p>
          )}
        </aside>
        {current && draft && (
          <div className="module-detail">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>{ui(current.name)}</h2>
                  <p>
                    {ui(current.id)}
                    {ui("· 코드")}
                    {ui(current.version)}
                    {ui("· 구성 v")}
                    {ui(current.revision)}
                  </p>
                </div>
                <div className="agent-run-actions">
                  <button
                    className="btn small-btn"
                    disabled={
                      busy ||
                      !write ||
                      !current.enabled ||
                      current.compatible === false ||
                      dirty
                    }
                    onClick={() => onRun(current.id)}
                  >
                    <Play size={13} />
                    {ui("개별 실행")}
                  </button>
                  <button
                    className="btn small-btn"
                    disabled={busy}
                    onClick={test}
                  >
                    <FlaskConical size={14} />
                    {ui("변경 미리보기")}
                  </button>
                </div>
              </div>
              <div className="form-body">
                <div className="module-form-grid">
                  <label>
                    {ui("에이전트 이름")}
                    <input
                      value={draft.name}
                      maxLength={80}
                      disabled={!admin}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                  </label>
                  <label>
                    {ui("기능 도구")}
                    <input value={current.tool} readOnly />
                  </label>
                </div>
                <label>
                  {ui("역할 설명")}
                  <textarea
                    value={draft.description}
                    maxLength={500}
                    disabled={!admin}
                    onChange={(e) => patch({ description: e.target.value })}
                  />
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    disabled={!admin || current.id === "data"}
                    onChange={(e) => patch({ enabled: e.target.checked })}
                  />
                  {ui("이 에이전트 사용")}
                </label>
                <div className="module-section-title">
                  <h3>{ui("진단 매개변수")}</h3>
                  <small>{ui("저장된 값은 이 에이전트에만 적용됩니다.")}</small>
                </div>
                <div className="module-form-grid">
                  {current.parameter_specs.map((p) => (
                    <label key={p.key}>
                      {ui(p.label)}
                      <input
                        type="number"
                        value={draft.parameters[p.key]}
                        min={p.min}
                        max={p.max}
                        step={p.step}
                        disabled={!admin}
                        onChange={(e) =>
                          patch({
                            parameters: {
                              ...draft.parameters,
                              [p.key]: Number(e.target.value),
                            },
                          })
                        }
                      />
                      <small>
                        {ui(p.min)} ~ {ui(p.max)}
                      </small>
                    </label>
                  ))}
                </div>
                {!current.parameter_specs.length && (
                  <p className="field-dialog-description">
                    {ui(
                      "이 도구는 추가 매개변수 없이 현재 데이터를 확인합니다.",
                    )}
                  </p>
                )}
                <div className="module-section-title">
                  <h3>{ui("선행 에이전트")}</h3>
                  <small>{ui("선택한 에이전트의 완료 후 실행합니다.")}</small>
                </div>
                <div className="module-dependencies">
                  {items
                    .filter((m) => m.id !== current.id)
                    .map((m) => (
                      <label className="check-row" key={m.id}>
                        <input
                          type="checkbox"
                          checked={draft.depends.includes(m.id)}
                          disabled={!admin || current.id === "data"}
                          onChange={(e) =>
                            patch({
                              depends: e.target.checked
                                ? [...draft.depends, m.id]
                                : draft.depends.filter((d) => d !== m.id),
                            })
                          }
                        />
                        {ui(m.name)}
                        {!m.enabled && <small>{ui("중지됨")}</small>}
                      </label>
                    ))}
                </div>
                <label>
                  {ui("LLM 요약 지침")}
                  <textarea
                    placeholder={ui(
                      "예: 품질 담당자가 먼저 확인할 수 있도록 수치와 근거를 간결하게 요약하세요.",
                    )}
                    value={draft.instruction}
                    maxLength={2000}
                    disabled={!admin}
                    onChange={(e) => patch({ instruction: e.target.value })}
                  />
                  <small>
                    {ui(
                      "Ollama 연계 모드의 요약에 적용됩니다. 도구 모드에서는 사용하지 않습니다.",
                    )}
                  </small>
                </label>
                {dirty && (
                  <p className="field-dialog-description">
                    {ui(
                      "저장되지 않은 변경이 있습니다. 저장하거나 변경 취소 후 다른 에이전트를 선택하세요.",
                    )}
                  </p>
                )}
                <div className="module-form-actions">
                  <button
                    className="btn"
                    disabled={!dirty || busy}
                    onClick={() => {
                      setDraft(editable(current));
                      setPreview(null);
                    }}
                  >
                    {ui("변경 취소")}
                  </button>
                  <button
                    className="btn primary"
                    disabled={!admin || !dirty || busy}
                    onClick={save}
                  >
                    <Save size={15} />
                    {ui("구성 저장")}
                  </button>
                </div>
              </div>
            </section>
            {preview && (
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>{ui("읽기 전용 미리보기")}</h2>
                    <p>
                      {ui(
                        "저장·LLM 호출·작업 생성 없이 도구 결과를 확인합니다.",
                      )}
                    </p>
                  </div>
                  <FlaskConical size={19} />
                </div>
                <div className="module-preview-results">
                  {Object.entries(preview).map(([line, result]) => (
                    <article key={line}>
                      <small>{ui(line)} LINE</small>
                      <h3>{ui(result.summary)}</h3>
                      <div>
                        {Object.entries(result.metrics || {}).map(
                          ([key, value]) => (
                            <span key={key}>
                              {ui(key)}
                              <b>{ui(value.toLocaleString(intlLocale()))}</b>
                            </span>
                          ),
                        )}
                      </div>
                      <p>{ui(result.findings.join(" "))}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>{ui("구성 변경 이력")}</h2>
                  <p>
                    {ui(
                      "최근 20개 구성 보관 · 복원 후 저장하면 새 리비전으로 기록합니다.",
                    )}
                  </p>
                </div>
                <History size={18} />
              </div>
              {current.history.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{ui("리비전")}</th>
                        <th>{ui("설정")}</th>
                        <th>{ui("기준 시각")}</th>
                        <th>{ui("복원")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...current.history].reverse().map((h) => (
                        <tr key={h.revision}>
                          <td>v{ui(h.revision)}</td>
                          <td>
                            {ui(h.name)}
                            <small className="block muted">
                              {ui(h.enabled ? "사용" : "중지")}
                              {ui("· 선행")} {ui(h.depends.length)}
                              {ui("개")}
                            </small>
                          </td>
                          <td>
                            {ui(h.saved_at ? date(h.saved_at) : "기본 구성")}
                          </td>
                          <td>
                            <button
                              className="btn small-btn"
                              disabled={!admin || busy}
                              onClick={() => {
                                setDraft({
                                  name: h.name,
                                  description: h.description,
                                  enabled: h.enabled,
                                  depends: [...h.depends],
                                  instruction: h.instruction,
                                  parameters: { ...h.parameters },
                                });
                                setPreview(null);
                              }}
                            >
                              <Copy size={13} />
                              {ui("편집에 복원")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="agent-empty">
                  {ui("아직 저장된 변경 이력이 없습니다.")}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
      {adding && (
        <FieldDialog
          title={ui("에이전트 구성 추가")}
          onClose={() => setAdding(false)}
        >
          <form
            className="form-body"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const base = items.find((m) => m.builtin && m.id === template)!;
                const result = await api<AgentModule>("/agents/modules", {
                  ...editable(base),
                  enabled: false,
                  id: newId,
                  name: newName,
                  template_id: template,
                });
                await load();
                setSelected(result.id);
                setAdding(false);
                onChanged();
                setMessage(
                  "독립 구성을 추가했습니다. 설정 확인 후 활성화하세요.",
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && (
              <div className="form-error" role="alert">
                {ui(error)}
              </div>
            )}
            <label>
              {ui("기반 기능")}
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              >
                {items
                  .filter((m) => m.builtin)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {ui(m.name)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {ui("에이전트 ID")}
              <input
                required
                value={newId}
                pattern="[a-z][a-z0-9_-]{1,39}"
                placeholder={ui("예: precision-equipment")}
                onChange={(e) => setNewId(e.target.value)}
              />
            </label>
            <label>
              {ui("에이전트 이름")}
              <input
                required
                minLength={2}
                maxLength={80}
                value={newName}
                placeholder={ui("예: 제면·포장 설비 에이전트")}
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            <p className="field-dialog-description">
              {ui(
                "등록된 기능의 코드를 재사용하며 진단 기준·지침·의존성은 독립적으로 저장합니다. 새 기능 코드는 개발 가이드의 모듈 계약으로 추가합니다.",
              )}
            </p>
            <button className="btn primary" disabled={busy}>
              <Plus size={15} />
              {ui("구성 추가")}
            </button>
          </form>
        </FieldDialog>
      )}
    </>
  );
}
