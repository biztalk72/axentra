import { ui } from "./i18n/locale";
import { lineLabel } from "./industry-context";
import { AgentWidgetPicker } from "./agent-widgets";
import type { AgentModule } from "./agent-modules/contracts";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  Copy,
  ExternalLink,
  Layers3,
  Maximize2,
  Monitor,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Tablet,
  Trash2,
  Video,
} from "lucide-react";
import { api, STATIC_DEMO, date } from "./api";
import {
  makeConfig,
  makeScreen,
  TEMPLATES,
  validatePanelConfig,
} from "./panel-model";
import type {
  PanelConfig,
  PanelRecord,
  PanelSnapshot,
  Screen,
  Template,
  Camera,
} from "./panel-model";
import { PanelViewport } from "./panel-player";
import { CameraPicker } from "./cctv";
import { FieldDialog } from "./field-ui";
import "./field.css";
export function PanelsPage({
  write,
  admin,
}: {
  write: boolean;
  admin: boolean;
}) {
  const [rows, setRows] = useState<PanelRecord[]>([]),
    [cameras, setCameras] = useState<Camera[]>([]),
    [agentModules, setAgentModules] = useState<AgentModule[]>([]),
    [selected, setSelected] = useState(""),
    [draft, setDraft] = useState<PanelConfig | null>(null),
    [line, setLine] = useState("all"),
    [checked, setChecked] = useState<string[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<"new" | "bulk" | "preview" | "access" | null>(
      null,
    ),
    [snapshot, setSnapshot] = useState<PanelSnapshot | null>(null),
    [previewError, setPreviewError] = useState(""),
    [index, setIndex] = useState(0),
    [previewSource, setPreviewSource] = useState<"draft" | "published">(
      "draft",
    ),
    [access, setAccess] = useState<{ url: string; expires: string } | null>(
      null,
    ),
    [copied, setCopied] = useState(false);
  const current = rows.find((p) => p.id === selected),
    dirty =
      !!draft &&
      !!current &&
      JSON.stringify(draft) !== JSON.stringify(current.draft);
  async function load() {
    try {
      const [panels, cameras] = await Promise.all([
        api<PanelRecord[]>("/panels"),
        api<Camera[]>("/cameras"),
      ]);
      setRows(panels);
      setCameras(cameras);
      setSelected((id) => id || panels[0]?.id || "");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    void api<AgentModule[]>("/agents/modules")
      .then(setAgentModules)
      .catch(() => {});
    const timer = setInterval(() => {
      void api<PanelRecord[]>("/panels")
        .then(setRows)
        .catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (current) {
      setDraft(structuredClone(current.draft));
      setIndex(0);
    }
  }, [selected, current?.revision]);
  const previewConfig =
    previewSource === "published" ? current?.published : draft;
  const signature = JSON.stringify(previewConfig);
  useEffect(() => {
    let alive = true,
      timer: ReturnType<typeof setTimeout>;
    setSnapshot(null);
    setPreviewError("");
    if (!previewConfig) {
      return;
    }
    const loadPreview = async () => {
      try {
        validatePanelConfig(previewConfig, cameras);
        const next = await api<PanelSnapshot>("/panels/preview", previewConfig);
        if (alive) {
          setSnapshot(next);
          setPreviewError("");
        }
      } catch (e) {
        if (alive) {
          setPreviewError((e as Error).message);
          setSnapshot(null);
        }
      } finally {
        if (alive)
          timer = setTimeout(
            loadPreview,
            previewConfig.refresh_interval * 1000,
          );
      }
    };
    const debounce = setTimeout(loadPreview, 250);
    return () => {
      alive = false;
      clearTimeout(debounce);
      clearTimeout(timer);
    };
  }, [signature, cameras]);
  useEffect(() => {
    if (index >= (previewConfig?.screens.length || 1)) setIndex(0);
  }, [previewConfig?.screens.length, index]);
  const patch = (value: Partial<PanelConfig>) =>
    setDraft((config) => (config ? { ...config, ...value } : config));
  const changeScreen = (id: string, patch: Partial<Screen>) =>
    draft &&
    patchScreens(
      draft.screens.map((screen) =>
        screen.id === id ? { ...screen, ...patch } : screen,
      ),
    );
  const patchScreens = (screens: Screen[]) => patch({ screens });
  async function mutate(path: string, body: unknown, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await api<PanelRecord | PanelRecord[]>(path, body);
      await load();
      setMessage(success);
      return response;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!draft || !current) return;
    try {
      validatePanelConfig(draft, cameras);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    await mutate(
      `/panels/${selected}/draft`,
      { expected_revision: current.revision, config: draft },
      "초안을 저장했습니다. 게시하면 현장 화면에 반영됩니다.",
    );
  }
  const targets = rows
    .filter((p) => checked.includes(p.id))
    .map((p) => ({ id: p.id, expected_revision: p.revision }));
  async function provision() {
    setBusy(true);
    try {
      const result = await api<{ access_token: string; expires_at: string }>(
        `/panels/${selected}/access`,
        {},
      );
      const url = `${location.origin}${location.pathname}#panel/${encodeURIComponent(selected)}?key=${encodeURIComponent(result.access_token)}`;
      setAccess({ url, expires: result.expires_at });
      setCopied(false);
      setModal("access");
      await load();
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
          <div className="eyebrow">SHOPFLOOR EXPERIENCE STUDIO</div>
          <h1>{ui("현장의 화면을 설계하세요.")}</h1>
          <p>
            {ui(
              "라인마다 필요한 정보를, 필요한 패널에. 구성부터 현장 미리보기까지.",
            )}
          </p>
        </div>
        <button
          className="btn primary"
          disabled={!write || busy}
          onClick={() => setModal("new")}
        >
          <Plus size={16} />
          {ui("패널 등록")}
        </button>
      </div>
      <div className="panel-studio-summary">
        <div>
          <span className="studio-summary-icon">
            <Monitor size={19} />
          </span>
          <b>{ui(rows.length)}</b>
          <span>{ui("등록 패널")}</span>
        </div>
        <div>
          <i className="studio-dot green" />
          <b>{ui(rows.filter((p) => p.connection === "online").length)}</b>
          <span>{ui("최근 응답")}</span>
        </div>
        <div>
          <i className="studio-dot blue" />
          <b>{ui(rows.filter((p) => p.published).length)}</b>
          <span>{ui("게시된 패널")}</span>
        </div>
        <div>
          <i className="studio-dot amber" />
          <b>
            {ui(rows.filter((p) => p.revision !== p.published_revision).length)}
          </b>
          <span>{ui("게시 대기 초안")}</span>
        </div>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {ui(error)}
        </div>
      )}
      {message && (
        <div className="field-success" role="status">
          <Check size={16} />
          {ui(message)}
        </div>
      )}
      <div className="field-toolbar">
        <a className="btn" href="#panel-view">
          <Monitor size={15} />
          {ui("현장 패널 뷰 열기")}
        </a>
        <div className="segmented">
          {[
            ["all", "전체 라인"],
            ["A", lineLabel("A")],
            ["B", lineLabel("B")],
          ].map(([id, label]) => (
            <button
              key={id}
              className={line === id ? "selected" : ""}
              onClick={() => setLine(id)}
            >
              {ui(label)}
            </button>
          ))}
        </div>
        <div>
          <button className="btn small-btn" onClick={() => void load()}>
            <RefreshCw size={13} />
            {ui("동기화")}
          </button>
          <button
            className="btn small-btn"
            disabled={!write || !draft || !targets.length || busy}
            onClick={() => setModal("bulk")}
          >
            <Layers3 size={14} />
            {ui("선택")}
            {ui(checked.length)}
            {ui("개에 분배")}
          </button>
          <button
            className="btn small-btn"
            disabled={!admin || !targets.length || busy || dirty}
            onClick={() =>
              mutate(
                "/panels/bulk-publish",
                { targets },
                "선택한 패널 설정을 일괄 게시했습니다.",
              )
            }
          >
            <CheckCheck size={14} />
            {ui("선택 패널 게시")}
          </button>
        </div>
      </div>
      <div className="panel-studio">
        <aside className="studio-panel-list">
          <div className="studio-list-heading">
            <span>LINE PANELS</span>
            <small>{ui("체크하여 일괄 분배")}</small>
          </div>
          {rows
            .filter((p) => line === "all" || p.draft.line === line)
            .map((p) => (
              <div
                key={p.id}
                className={`studio-panel-card ${selected === p.id ? "selected" : ""}`}
              >
                <input
                  type="checkbox"
                  aria-label={ui(`${p.draft.name} 분배 대상으로 선택`)}
                  checked={checked.includes(p.id)}
                  onChange={(e) =>
                    setChecked((ids) =>
                      e.target.checked
                        ? [...ids, p.id]
                        : ids.filter((id) => id !== p.id),
                    )
                  }
                />
                <button
                  onClick={() => {
                    if (dirty && selected !== p.id) {
                      setError(
                        "편집 중인 내용을 저장하거나 변경 취소한 뒤 다른 패널을 선택하세요.",
                      );
                      return;
                    }
                    setSelected(p.id);
                    setPreviewSource("draft");
                    setError("");
                  }}
                >
                  <div>
                    <span className="studio-device-icon">
                      {p.draft.mode === "tv" ? (
                        <Monitor size={21} />
                      ) : (
                        <Tablet size={21} />
                      )}
                    </span>
                    <span className={`studio-connection ${p.connection}`}>
                      <i />
                      {ui(
                        p.connection === "online"
                          ? "응답 있음"
                          : p.connection === "offline"
                            ? "응답 지연"
                            : "연결 대기",
                      )}
                    </span>
                  </div>
                  <h3>{ui(p.draft.name)}</h3>
                  <p>{ui(p.draft.location)}</p>
                  <footer>
                    <span>
                      {ui(p.draft.resolution)} · {ui(p.draft.screens.length)}
                      {ui("개 화면")}
                    </span>
                    <b>
                      {ui(
                        p.revision === p.published_revision
                          ? `게시 v${p.published_revision}`
                          : "초안 변경",
                      )}
                    </b>
                  </footer>
                </button>
              </div>
            ))}
        </aside>
        <div className="studio-workspace">
          {draft && current ? (
            <>
              <section className="panel studio-preview">
                <div className="panel-header">
                  <div>
                    <h2>
                      <span className="studio-dot blue" />
                      {ui("현장 패널 미리보기")}
                    </h2>
                    <p>
                      {ui(
                        previewSource === "draft"
                          ? "저장 전 편집 내용도 미리 볼 수 있습니다."
                          : "현장에서 표시되는 게시 버전입니다.",
                      )}
                    </p>
                  </div>
                  <div className="studio-preview-actions">
                    <div className="segmented compact">
                      <button
                        className={previewSource === "draft" ? "selected" : ""}
                        onClick={() => setPreviewSource("draft")}
                      >
                        {ui("초안")}
                      </button>
                      <button
                        className={
                          previewSource === "published" ? "selected" : ""
                        }
                        disabled={!current.published}
                        onClick={() => setPreviewSource("published")}
                      >
                        {ui("게시 v")}
                        {ui(current.published_revision)}
                      </button>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={ui("패널 미리보기 최대화")}
                      disabled={!snapshot}
                      onClick={() => setModal("preview")}
                    >
                      <Maximize2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="studio-preview-stage">
                  {snapshot && modal !== "preview" ? (
                    <PanelViewport snapshot={snapshot} index={index} preview />
                  ) : (
                    <div className="studio-preview-empty">
                      <Monitor size={33} />
                      <p>
                        {ui(
                          modal === "preview"
                            ? "확대 미리보기 표시 중"
                            : previewError || "미리보기 준비 중…",
                        )}
                      </p>
                    </div>
                  )}
                </div>
                <div className="studio-preview-footer">
                  <div>
                    <button
                      aria-label={ui("이전 미리보기 화면")}
                      onClick={() =>
                        setIndex(
                          (i) =>
                            (i - 1 + (previewConfig?.screens.length || 1)) %
                            (previewConfig?.screens.length || 1),
                        )
                      }
                    >
                      <ArrowLeft size={14} />
                    </button>
                    <span>
                      {ui(previewConfig?.screens[index]?.title || "—")}{" "}
                      <small>
                        {ui(index + 1)}/{ui(previewConfig?.screens.length || 0)}
                      </small>
                    </span>
                    <button
                      aria-label={ui("다음 미리보기 화면")}
                      onClick={() =>
                        setIndex(
                          (i) => (i + 1) % (previewConfig?.screens.length || 1),
                        )
                      }
                    >
                      <ArrowRight size={14} />
                    </button>
                  </div>
                  <span>
                    {ui(previewConfig?.resolution)} ·{" "}
                    {ui(previewConfig?.theme === "dark" ? "다크" : "라이트")}
                    {ui("· 입력 저장 안 함")}
                  </span>
                </div>
              </section>
              <section className="panel studio-settings">
                <div className="panel-header">
                  <div>
                    <h2>{ui("패널 구성")}</h2>
                    <p>
                      {ui(current.id)}
                      {ui("· 초안 v")}
                      {ui(current.revision)}{" "}
                      {ui(dirty ? "· 저장되지 않은 변경" : "")}
                    </p>
                  </div>
                  <div>
                    <button
                      className="btn small-btn"
                      disabled={!dirty || busy}
                      onClick={() => {
                        setDraft(structuredClone(current.draft));
                        setError("");
                      }}
                    >
                      <RotateCcw size={13} />
                      {ui("변경 취소")}
                    </button>
                    <button
                      className="btn small-btn"
                      disabled={!write || !dirty || busy}
                      onClick={save}
                    >
                      <Save size={13} />
                      {ui("초안 저장")}
                    </button>
                    <button
                      className="btn primary small-btn"
                      disabled={
                        !admin ||
                        dirty ||
                        busy ||
                        current.revision === current.published_revision
                      }
                      onClick={() =>
                        mutate(
                          `/panels/${selected}/publish`,
                          { expected_revision: current.revision },
                          "게시했습니다. 패널의 다음 데이터 갱신에 적용됩니다.",
                        )
                      }
                    >
                      <CheckCheck size={14} />
                      {ui("게시")}
                    </button>
                  </div>
                </div>
                <div className="studio-settings-grid">
                  <label>
                    {ui("패널 이름")}
                    <input
                      disabled={!write}
                      value={draft.name}
                      maxLength={80}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                  </label>
                  <label>
                    {ui("설치 위치")}
                    <input
                      disabled={!write}
                      value={draft.location}
                      maxLength={80}
                      onChange={(e) => patch({ location: e.target.value })}
                    />
                  </label>
                  <label>
                    {ui("생산 라인")}
                    <select
                      disabled={!write}
                      value={draft.line}
                      onChange={(e) =>
                        patch({
                          line: e.target.value as "A" | "B",
                          camera_widget: {
                            ...draft.camera_widget,
                            enabled: false,
                            camera_ids: [],
                          },
                        })
                      }
                    >
                      <option value="A">{ui(lineLabel("A"))}</option>
                      <option value="B">{ui(lineLabel("B"))}</option>
                    </select>
                  </label>
                  <label>
                    {ui("패널 유형")}
                    <select
                      disabled={!write}
                      value={draft.mode}
                      onChange={(e) =>
                        patch({ mode: e.target.value as PanelConfig["mode"] })
                      }
                    >
                      <option value="tv">{ui("TV / 전광판")}</option>
                      <option value="touch">{ui("현장 터치 패널")}</option>
                    </select>
                  </label>
                  <label>
                    {ui("해상도 / 방향")}
                    <select
                      disabled={!write}
                      value={draft.resolution}
                      onChange={(e) =>
                        patch({
                          resolution: e.target
                            .value as PanelConfig["resolution"],
                        })
                      }
                    >
                      {["1920x1080", "1366x768", "1280x800", "1080x1920"].map(
                        (r) => (
                          <option key={r} value={r}>
                            {ui(r)}
                            {ui(r === "1080x1920" ? " · 세로" : "")}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    {ui("화면 테마")}
                    <select
                      disabled={!write}
                      value={draft.theme}
                      onChange={(e) =>
                        patch({ theme: e.target.value as "dark" | "light" })
                      }
                    >
                      <option value="dark">{ui("다크 · 현장 전광판")}</option>
                      <option value="light">
                        {ui("라이트 · 작업자 패널")}
                      </option>
                    </select>
                  </label>
                  <label>
                    {ui("데이터 갱신 (초)")}
                    <input
                      disabled={!write}
                      type="number"
                      min={5}
                      max={60}
                      value={draft.refresh_interval}
                      onChange={(e) =>
                        patch({ refresh_interval: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="check-row">
                    <input
                      disabled={!write}
                      type="checkbox"
                      checked={draft.rotation_enabled}
                      onChange={(e) =>
                        patch({ rotation_enabled: e.target.checked })
                      }
                    />
                    {ui("화면 자동 순환")}
                  </label>
                </div>
              </section>
              <section className="panel studio-playlist">
                <div className="panel-header">
                  <div>
                    <h2>
                      {ui("화면 플레이리스트")}
                      <span className="label neutral">
                        {ui(draft.screens.length)}/12
                      </span>
                    </h2>
                    <p>
                      {ui(
                        "위아래 버튼으로 표시 순서를 조정하세요. 화면별 노출 시간을 설정할 수 있습니다.",
                      )}
                    </p>
                  </div>
                </div>
                <div className="studio-screen-list">
                  {draft.screens.map((screen, i) => (
                    <div
                      className={`studio-screen-row ${index === i ? "selected" : ""}`}
                      key={screen.id}
                    >
                      <button
                        className="screen-number"
                        title={ui(`${screen.title} 미리보기`)}
                        onClick={() => {
                          setPreviewSource("draft");
                          setIndex(i);
                        }}
                        style={{
                          color: TEMPLATES.find((t) => t.id === screen.template)
                            ?.color,
                        }}
                      >
                        {ui(String(i + 1).padStart(2, "0"))}
                      </button>
                      <div className="screen-details">
                        <span>
                          {ui(
                            TEMPLATES.find((t) => t.id === screen.template)
                              ?.name,
                          )}
                        </span>
                        <input
                          aria-label={ui(`화면 ${i + 1} 제목`)}
                          disabled={!write}
                          maxLength={60}
                          value={screen.title}
                          onChange={(e) =>
                            changeScreen(screen.id, {
                              title: e.target.value,
                            })
                          }
                        />
                        {["notice", "work-order"].includes(screen.template) && (
                          <textarea
                            aria-label={ui(`화면 ${i + 1} 내용`)}
                            disabled={!write}
                            maxLength={1000}
                            value={screen.message}
                            onChange={(e) =>
                              changeScreen(screen.id, {
                                message: e.target.value,
                              })
                            }
                            placeholder={ui(
                              screen.template === "notice"
                                ? "현장 공지 내용을 입력하세요."
                                : "작업 안내를 줄바꿈으로 입력하세요.",
                            )}
                          />
                        )}
                      </div>
                      <label className="screen-duration">
                        <input
                          aria-label={ui(`화면 ${i + 1} 노출 시간`)}
                          disabled={!write}
                          type="number"
                          min={10}
                          max={300}
                          value={screen.duration}
                          onChange={(e) =>
                            changeScreen(screen.id, {
                              duration: Number(e.target.value),
                            })
                          }
                        />
                        <small>{ui("초")}</small>
                      </label>
                      <div className="screen-reorder">
                        <button
                          aria-label={ui(`화면 ${i + 1} 위로 이동`)}
                          disabled={!write || i === 0}
                          onClick={() => {
                            const next = [...draft.screens];
                            [next[i - 1], next[i]] = [next[i], next[i - 1]];
                            patchScreens(next);
                            setIndex(i - 1);
                          }}
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          aria-label={ui(`화면 ${i + 1} 아래로 이동`)}
                          disabled={!write || i === draft.screens.length - 1}
                          onClick={() => {
                            const next = [...draft.screens];
                            [next[i + 1], next[i]] = [next[i], next[i + 1]];
                            patchScreens(next);
                            setIndex(i + 1);
                          }}
                        >
                          <ArrowDown size={13} />
                        </button>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={ui(`화면 ${i + 1} 삭제`)}
                        disabled={!write || draft.screens.length <= 1}
                        onClick={() =>
                          patchScreens(
                            draft.screens.filter((s) => s.id !== screen.id),
                          )
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="screen-library">
                  {TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      disabled={!write || draft.screens.length >= 12}
                      onClick={() => {
                        patchScreens([
                          ...draft.screens,
                          makeScreen(template.id as Template),
                        ]);
                        setPreviewSource("draft");
                        setIndex(draft.screens.length);
                      }}
                    >
                      <span
                        style={{
                          background: template.color + "18",
                          color: template.color,
                        }}
                      >
                        <Plus size={14} />
                      </span>
                      <div>
                        <b>{ui(template.name)}</b>
                        <small>{ui(template.description)}</small>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>{ui("설치할 에이전트 위젯")}</h2>
                    <p>
                      {ui(
                        "최대 4개 선택 후 공용 에이전트 현황 화면을 재생 목록에 추가하세요.",
                      )}
                    </p>
                  </div>
                </div>
                <div className="form-body">
                  <AgentWidgetPicker
                    modules={agentModules}
                    selected={draft.agent_widgets || []}
                    onChange={(ids) => patch({ agent_widgets: ids })}
                    disabled={!write}
                  />
                </div>
              </section>
              <section className="panel studio-camera-settings">
                <div className="panel-header">
                  <div>
                    <h2>
                      <Video size={16} />
                      {ui("패널 CCTV 위젯")}
                    </h2>
                    <p>
                      {ui(
                        "같은 라인의 카메라를 화면 옆 또는 아래에 함께 표시합니다.",
                      )}
                    </p>
                  </div>
                  <label className="check-row">
                    <input
                      disabled={!write}
                      type="checkbox"
                      checked={draft.camera_widget.enabled}
                      onChange={(e) =>
                        patch({
                          camera_widget: {
                            ...draft.camera_widget,
                            enabled: e.target.checked,
                          },
                        })
                      }
                    />
                    {ui("위젯 사용")}
                  </label>
                </div>
                <div className="studio-camera-body">
                  <div>
                    <label>
                      {ui("위젯 위치")}
                      <select
                        disabled={!write}
                        value={draft.camera_widget.position}
                        onChange={(e) =>
                          patch({
                            camera_widget: {
                              ...draft.camera_widget,
                              position: e.target.value as "right" | "bottom",
                            },
                          })
                        }
                      >
                        <option value="right">{ui("오른쪽")}</option>
                        <option value="bottom">{ui("아래")}</option>
                      </select>
                    </label>
                    <label>
                      {ui("기본 보기")}
                      <select
                        disabled={!write}
                        value={draft.camera_widget.layout}
                        onChange={(e) =>
                          patch({
                            camera_widget: {
                              ...draft.camera_widget,
                              layout: e.target.value as "single" | "grid",
                            },
                          })
                        }
                      >
                        <option value="grid">{ui("멀티뷰")}</option>
                        <option value="single">{ui("단일 보기")}</option>
                      </select>
                    </label>
                  </div>
                  <fieldset disabled={!write}>
                    <CameraPicker
                      cameras={cameras.filter(
                        (c) => c.line === draft.line && c.enabled,
                      )}
                      selected={draft.camera_widget.camera_ids}
                      onChange={(ids) =>
                        patch({
                          camera_widget: {
                            ...draft.camera_widget,
                            camera_ids: ids,
                          },
                        })
                      }
                    />
                  </fieldset>
                </div>
              </section>
              <section className="panel studio-connect">
                <div>
                  <Radio size={23} />
                  <span>
                    <h2>{ui("현장 패널 연결")}</h2>
                    <p>
                      {ui(
                        current.last_seen
                          ? `최근 응답 ${date(current.last_seen)} · 수신 v${current.runtime_revision || "—"}`
                          : "실행 화면의 응답을 받으면 연결 상태가 표시됩니다.",
                      )}
                    </p>
                  </span>
                </div>
                <div>
                  <a
                    className="btn"
                    href={`#panel/${selected}`}
                    aria-disabled={!current.published}
                    onClick={(e) => {
                      if (!current.published) e.preventDefault();
                    }}
                  >
                    <ExternalLink size={14} />
                    {ui("게시 화면 열기")}
                  </a>
                  <button
                    className="btn primary"
                    disabled={!admin || !current.published || busy}
                    onClick={provision}
                  >
                    <Radio size={14} />
                    {ui("연결 주소 발급")}
                  </button>
                </div>
              </section>
              {snapshot && snapshot.events.length > 0 && (
                <section className="panel">
                  <div className="panel-header">
                    <h2>
                      {ui("최근")}
                      {ui(draft.line)}
                      {ui("라인 현장 입력")}
                    </h2>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{ui("작업")}</th>
                          <th>{ui("패널")}</th>
                          <th>{ui("시각")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.events.map((e) => (
                          <tr key={e.id}>
                            <td>{ui(e.name)}</td>
                            <td>{ui(e.panel_id)}</td>
                            <td>{ui(date(e.created_at))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="panel empty">
              <Monitor size={35} />
              <strong>{ui("패널을 선택하거나 새로 등록하세요.")}</strong>
            </div>
          )}
        </div>
      </div>
      {modal === "new" && (
        <FieldDialog
          title={ui("현장 패널 등록")}
          onClose={() => setModal(null)}
        >
          <NewPanel
            busy={busy}
            onSubmit={async (config) => {
              const result = await mutate(
                "/panels",
                config,
                "패널을 등록했습니다. 초안을 구성한 뒤 게시하세요.",
              );
              if (result && !Array.isArray(result)) {
                setSelected(result.id);
                setModal(null);
              }
            }}
          />
        </FieldDialog>
      )}
      {modal === "bulk" && draft && (
        <FieldDialog
          title={ui("선택 패널에 화면 분배")}
          onClose={() => setModal(null)}
        >
          <div className="form-body">
            <p className="field-dialog-description">
              {ui("선택한")}
              {ui(targets.length)}
              {ui(
                "개 패널에 현재 플레이리스트·테마·전환·갱신 주기를 초안으로 분배합니다. 각 패널의 라인·위치·해상도·카메라 선택은 유지합니다.",
              )}
            </p>
            <div className="bulk-targets">
              {rows
                .filter((p) => checked.includes(p.id))
                .map((p) => (
                  <span key={p.id}>
                    <Monitor size={14} />
                    {ui(p.draft.name)}
                    <small>{ui(p.draft.line)} LINE</small>
                  </span>
                ))}
            </div>
            <div className="bulk-playlist">
              {draft.screens.map((s, i) => (
                <span key={s.id}>
                  {ui(i + 1)}. {ui(s.title)}
                  <small>
                    {ui(s.duration)}
                    {ui("초")}
                  </small>
                </span>
              ))}
            </div>
            <button
              className="btn primary"
              disabled={busy}
              onClick={async () => {
                const result = await mutate(
                  "/panels/bulk-layout",
                  {
                    targets,
                    screens: draft.screens,
                    theme: draft.theme,
                    refresh_interval: draft.refresh_interval,
                    rotation_enabled: draft.rotation_enabled,
                    agent_widgets: draft.agent_widgets || [],
                  },
                  `${targets.length}개 패널에 초안을 분배했습니다. 게시 후 현장에 반영됩니다.`,
                );
                if (result) setModal(null);
              }}
            >
              <Layers3 size={15} />
              {ui("초안 분배 실행")}
            </button>
          </div>
        </FieldDialog>
      )}
      {modal === "preview" && snapshot && (
        <FieldDialog
          title={ui("현장 화면 미리보기 · 입력 저장 안 함")}
          onClose={() => setModal(null)}
          wide
        >
          <div className="preview-canvas-stage">
            <PanelViewport snapshot={snapshot} index={index} preview fill />
          </div>
          <div className="preview-dialog-controls">
            <button
              className="btn"
              onClick={() =>
                setIndex(
                  (i) =>
                    (i - 1 + snapshot.config.screens.length) %
                    snapshot.config.screens.length,
                )
              }
            >
              <ArrowLeft size={15} />
              {ui("이전 화면")}
            </button>
            <span>{ui(snapshot.config.screens[index]?.title)}</span>
            <button
              className="btn"
              onClick={() =>
                setIndex((i) => (i + 1) % snapshot.config.screens.length)
              }
            >
              {ui("다음 화면")}
              <ArrowRight size={15} />
            </button>
          </div>
        </FieldDialog>
      )}
      {modal === "access" && access && (
        <FieldDialog
          title={ui("패널 연결 주소")}
          onClose={() => {
            setModal(null);
            setAccess(null);
          }}
        >
          <div className="form-body">
            <div className="field-access-note">
              <ShieldCheckIcon />
              <p>
                {ui(
                  "이 주소는 선택한 패널의 게시 화면과 허용된 현장 입력에만 접근합니다. 30일 후 만료되며 재발급하면 이전 주소가 해제됩니다.",
                )}
              </p>
            </div>
            {STATIC_DEMO && (
              <div className="info-banner small">
                {ui(
                  "Pages 체험 설정과 연결 키는 이 브라우저에 저장됩니다. 실제 다른 장비 연결은 백엔드 모드에서 사용하세요.",
                )}
              </div>
            )}
            <label>
              {ui("연결 URL")}
              <input type="password" readOnly value={access.url} />
            </label>
            <small className="muted">
              {ui("만료")}
              {ui(date(access.expires))}
            </small>
            <div className="form-row">
              <button
                className="btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(access.url);
                    setCopied(true);
                  } catch {
                    setError("클립보드 권한을 확인하세요.");
                  }
                }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
                {ui(copied ? "복사 완료" : "주소 복사")}
              </button>
              <a
                className="btn primary"
                href={access.url}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={14} />
                {ui("연결 화면 열기")}
              </a>
            </div>
          </div>
        </FieldDialog>
      )}
    </>
  );
}
function ShieldCheckIcon() {
  return <CheckCheck size={23} />;
}
function NewPanel({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (config: PanelConfig) => void;
}) {
  const [config, setConfig] = useState(makeConfig());
  return (
    <form
      className="form-body"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(config);
      }}
    >
      <label>
        {ui("패널 이름")}
        <input
          required
          minLength={2}
          maxLength={80}
          value={config.name}
          onChange={(e) => setConfig({ ...config, name: e.target.value })}
        />
      </label>
      <label>
        {ui("생산 라인")}
        <select
          value={config.line}
          onChange={(e) =>
            setConfig({ ...config, line: e.target.value as "A" | "B" })
          }
        >
          <option>A</option>
          <option>B</option>
        </select>
      </label>
      <label>
        {ui("설치 위치")}
        <input
          required
          minLength={2}
          maxLength={80}
          value={config.location}
          onChange={(e) => setConfig({ ...config, location: e.target.value })}
        />
      </label>
      <label>
        {ui("패널 유형")}
        <select
          value={config.mode}
          onChange={(e) =>
            setConfig({
              ...config,
              mode: e.target.value as PanelConfig["mode"],
              rotation_enabled: e.target.value === "tv",
            })
          }
        >
          <option value="tv">{ui("TV / 전광판")}</option>
          <option value="touch">{ui("현장 터치 패널")}</option>
        </select>
      </label>
      <button className="btn primary" disabled={busy}>
        <Plus size={15} />
        {ui("패널 등록")}
      </button>
    </form>
  );
}
