import { ui } from "./i18n/locale";
import { useEffect, useState } from "react";
import { ExternalLink, Monitor, Pause, Play, RefreshCw } from "lucide-react";
import { api } from "./api";
import type { PanelRecord, PanelSnapshot } from "./panel-model";
import { PanelViewport } from "./panel-player";
import { lineLabel } from "./industry-context";
export function PanelViewerPage() {
  const [panels, setPanels] = useState<PanelRecord[]>([]),
    [line, setLine] = useState("all"),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    api<PanelRecord[]>("/panels")
      .then((rows) => {
        if (alive) {
          setPanels(rows);
          setSelected((ids) =>
            ids.length
              ? ids
              : rows
                  .filter((p) => p.published)
                  .sort(
                    (a, b) =>
                      Number(b.published?.mode === "tv") -
                      Number(a.published?.mode === "tv"),
                  )
                  .slice(0, 2)
                  .map((p) => p.id),
          );
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [revision]);
  const visible = panels.filter(
    (p) => line === "all" || (p.published?.line || p.draft.line) === line,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SHOPFLOOR PANEL VIEWER</div>
          <h1>{ui("현장 패널 통합 관제")}</h1>
          <p>
            {ui(
              "라인별 게시 화면을 독립적으로 조회하고 최대 두 개 패널을 비교합니다.",
            )}
          </p>
        </div>
        <button className="btn" onClick={() => setRevision((r) => r + 1)}>
          <RefreshCw size={15} />
          {ui("목록 새로고침")}
        </button>
      </div>
      <div className="field-toolbar">
        <div className="segmented">
          {[
            ["all", "전체 라인"],
            ["A", lineLabel("A")],
            ["B", lineLabel("B")],
          ].map(([id, label]) => (
            <button
              key={id}
              className={line === id ? "selected" : ""}
              onClick={() => {
                setLine(id);
                setSelected(
                  panels
                    .filter(
                      (p) =>
                        p.published &&
                        (id === "all" ||
                          (p.published?.line || p.draft.line) === id),
                    )
                    .slice(0, 2)
                    .map((p) => p.id),
                );
              }}
            >
              {ui(label)}
            </button>
          ))}
        </div>
        <span className="muted small">
          {ui("게시 화면만 조회 · 장치 응답 및 작업 입력 기록 없음")}
        </span>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {ui(error)}
        </div>
      )}
      <div className="viewer-panel-picker">
        {visible.map((p) => (
          <label
            key={p.id}
            className={`viewer-panel-option ${selected.includes(p.id) ? "selected" : ""}`}
          >
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              disabled={
                !p.published ||
                (!selected.includes(p.id) && selected.length >= 2)
              }
              onChange={(e) =>
                setSelected((ids) =>
                  e.target.checked
                    ? [...ids, p.id]
                    : ids.filter((id) => id !== p.id),
                )
              }
            />
            <Monitor size={20} />
            <span>
              <b>{ui(p.published?.name || p.draft.name)}</b>
              <small>
                {ui(lineLabel(p.published?.line || p.draft.line))} ·{" "}
                {ui(p.published ? `게시 v${p.published_revision}` : "미게시")}
              </small>
            </span>
          </label>
        ))}
      </div>
      {!selected.length && (
        <div className="panel-viewer-empty">
          <Monitor size={30} />
          <h2>{ui("조회할 게시 패널을 선택하세요.")}</h2>
          <p>
            {ui(
              "패널 스튜디오에서 구성한 화면을 게시하면 이곳에서 확인할 수 있습니다.",
            )}
          </p>
        </div>
      )}
      <div
        className={`viewer-panel-grid ${selected.length === 1 ? "single" : ""}`}
      >
        {selected.map((id) => (
          <LivePanel key={id} id={id} revision={revision} />
        ))}
      </div>
    </>
  );
}
function LivePanel({ id, revision }: { id: string; revision: number }) {
  const [snapshot, setSnapshot] = useState<PanelSnapshot | null>(null),
    [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const next = await api<PanelSnapshot>(`/panels/${id}/display`);
        if (alive) {
          setSnapshot(next);
          setIndex((i) => Math.min(i, next.config.screens.length - 1));
          setError("");
        }
        if (alive)
          timer = setTimeout(load, next.config.refresh_interval * 1000);
      } catch (e) {
        if (alive) {
          setError((e as Error).message);
          timer = setTimeout(load, 10000);
        }
      }
    }
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, revision]);
  const screen = snapshot?.config.screens[index];
  useEffect(() => {
    if (!snapshot || paused || !snapshot.config.rotation_enabled) return;
    const timer = setTimeout(
      () => setIndex((i) => (i + 1) % snapshot.config.screens.length),
      (screen?.duration || 20) * 1000,
    );
    return () => clearTimeout(timer);
  }, [
    snapshot?.config.rotation_enabled,
    snapshot?.config.screens.length,
    screen?.id,
    screen?.duration,
    paused,
  ]);
  return (
    <section className="viewer-panel-card">
      <header>
        <div>
          <Monitor size={16} />
          <span>
            <b>{ui(snapshot?.config.name || id)}</b>
            <small>
              {ui(
                snapshot
                  ? `${snapshot.config.resolution} · 게시 v${snapshot.revision}`
                  : "화면 연결 중…",
              )}
            </small>
          </span>
        </div>
        <a
          className="btn small-btn"
          href={`#panel/${encodeURIComponent(id)}?view=monitor`}
        >
          <ExternalLink size={13} />
          {ui("전용 화면 열기")}
        </a>
      </header>
      {error && (
        <div className="form-error" role="alert">
          {ui(error)}
        </div>
      )}
      {snapshot && (
        <>
          <PanelViewport snapshot={snapshot} index={index} offline={!!error} />
          <footer>
            <select
              aria-label={ui(`${id} 표시 화면`)}
              value={index}
              onChange={(e) => {
                setIndex(Number(e.target.value));
                setPaused(true);
              }}
            >
              {snapshot.config.screens.map((s, i) => (
                <option key={s.id} value={i}>
                  {ui(s.title)}
                </option>
              ))}
            </select>
            <button
              className="btn small-btn"
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? <Play size={13} /> : <Pause size={13} />}{" "}
              {ui(paused ? "화면 순환 재개" : "화면 순환 일시중지")}
            </button>
          </footer>
        </>
      )}
    </section>
  );
}
