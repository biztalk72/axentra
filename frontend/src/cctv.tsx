import { ui } from "./i18n/locale";
import { DeviceCameraView } from "./device-camera-view";
import { lineLabel } from "./industry-context";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type Hls from "hls.js";
import {
  Camera as CameraIcon,
  Video,
  Maximize2,
  Minimize2,
  Grid2X2,
  Square,
  Settings2,
  Plus,
  RefreshCw,
  EyeOff,
  X,
  Play,
} from "lucide-react";
import { api } from "./api";
import type { Camera, CctvLayout } from "./panel-model";
import { validateCamera } from "./panel-model";
import { FieldDialog } from "./field-ui";
import "./field.css";
function DemoScene({ camera }: { camera: Camera }) {
  return (
    <svg
      viewBox="0 0 800 450"
      className="camera-demo-scene"
      role="img"
      aria-label={ui(`${camera.name} 모의 CCTV · 실제 카메라 아님`)}
    >
      <defs>
        <linearGradient
          id={`cam-floor-${camera.id}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop stopColor="#253d4c" />
          <stop offset="1" stopColor="#182737" />
        </linearGradient>
        <pattern
          id={`cam-grid-${camera.id}`}
          width="80"
          height="50"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M80 0H0V50"
            fill="none"
            stroke="#527082"
            strokeWidth="1"
            opacity=".25"
          />
        </pattern>
      </defs>
      <rect width="800" height="450" fill="#122333" />
      <path d="M0 155L800 110V450H0Z" fill={`url(#cam-floor-${camera.id})`} />
      <path d="M0 155L800 110V450H0Z" fill={`url(#cam-grid-${camera.id})`} />
      {[80, 310, 540].map((x, i) => (
        <g key={x} transform={`translate(${x} ${155 - i * 11})`}>
          <path d="M0 25L28 0H150V150L122 170H0Z" fill="#879eaa" />
          <path d="M0 25H122V170H0Z" fill="#b7c8ca" />
          <path d="M122 25L150 0V150L122 170Z" fill="#607a87" />
          <rect x="15" y="45" width="80" height="70" rx="4" fill="#253e50" />
          <path
            d="M25 95L45 65L65 90L85 57"
            stroke="#71b5c5"
            fill="none"
            strokeWidth="3"
          />
          <rect x="101" y="65" width="8" height="30" rx="2" fill="#5b889d" />
          <rect x="20" y="135" width="75" height="9" rx="3" fill="#93aeb7" />
          <rect x="65" y="-21" width="5" height="23" fill="#7f9caa" />
          <circle
            cx="67"
            cy="-22"
            r="7"
            fill={i === 2 && camera.line === "A" ? "#e7b45b" : "#69c6a1"}
          />
        </g>
      ))}
      <path
        d="M0 370L800 315"
        stroke="#e9c14f"
        strokeWidth="3"
        strokeDasharray="20 15"
      />
      <g className="camera-demo-amr">
        <rect x="80" y="365" width="55" height="27" rx="9" fill="#6f9edb" />
        <rect x="91" y="370" width="32" height="9" rx="4" fill="#b7d8ee" />
        <circle cx="92" cy="394" r="5" fill="#071320" />
        <circle cx="125" cy="394" r="5" fill="#071320" />
      </g>
      <path
        d="M0 70H800M130 0V150M405 0V135M670 0V119"
        stroke="#365566"
        strokeWidth="7"
      />
      <path d="M0 73L800 32" stroke="#accfd1" strokeWidth="2" opacity=".25" />
      <text
        x="400"
        y="420"
        fill="#a0bbcb"
        textAnchor="middle"
        fontSize="15"
        letterSpacing="4"
      >
        SIMULATED FACTORY VIEW · {ui(camera.line)} LINE
      </text>
    </svg>
  );
}
function CameraTile({
  camera,
  onMaximize,
  onUseDevice,
  interactive = true,
}: {
  camera: Camera;
  onMaximize?: () => void;
  onUseDevice?: () => void;
  interactive?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("loading");
  const [retry, setRetry] = useState(0);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  useEffect(() => {
    let disposed = false,
      hls: Hls | undefined;
    const element = video.current;
    setAutoplayBlocked(false);
    setStatus(
      !camera.enabled
        ? "disabled"
        : ["demo", "device"].includes(camera.source_type)
          ? "simulated"
          : "loading",
    );
    if (
      !camera.enabled ||
      ["demo", "device"].includes(camera.source_type) ||
      camera.source_type === "mjpeg" ||
      !element
    )
      return;
    const play = () =>
      element.play().catch(() => {
        if (!disposed) setAutoplayBlocked(true);
      });
    if (camera.source_type === "hls") {
      import("hls.js")
        .then(({ default: Hls }) => {
          if (disposed) return;
          if (Hls.isSupported()) {
            hls = new Hls({ enableWorker: true, lowLatencyMode: true });
            hls.on(Hls.Events.ERROR, (_, data) => {
              if (data.fatal && !disposed) setStatus("error");
            });
            hls.on(Hls.Events.MANIFEST_PARSED, play);
            hls.loadSource(camera.url);
            hls.attachMedia(element);
          } else if (element.canPlayType("application/vnd.apple.mpegurl")) {
            element.src = camera.url;
            play();
          } else setStatus("unsupported");
        })
        .catch(() => {
          if (!disposed) setStatus("error");
        });
    } else {
      element.src = camera.url;
      element.load();
      play();
    }
    const timeout = setTimeout(() => {
      if (!disposed && element.readyState < 2) setStatus("error");
    }, 15000);
    return () => {
      disposed = true;
      clearTimeout(timeout);
      hls?.destroy();
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, [camera.id, camera.url, camera.source_type, camera.enabled, retry]);
  const failure = ["error", "unsupported", "disabled"].includes(status);
  return (
    <article className={`camera-tile ${failure ? "camera-error" : ""}`}>
      <div
        className="camera-image"
        style={{ "--camera-fit": camera.fit } as React.CSSProperties}
      >
        {camera.enabled &&
          (camera.source_type === "device" ? (
            <DeviceCameraView id={camera.id} interactive={interactive} />
          ) : camera.source_type === "demo" ? (
            <DemoScene camera={camera} />
          ) : camera.source_type === "mjpeg" ? (
            <img
              key={retry}
              src={camera.url}
              alt={ui(camera.name)}
              onLoad={() => setStatus("playing")}
              onError={() => setStatus("error")}
            />
          ) : (
            <video
              ref={video}
              muted
              autoPlay
              playsInline
              loop={camera.source_type === "mp4"}
              onPlaying={() => {
                setStatus("playing");
                setAutoplayBlocked(false);
              }}
              onError={() => setStatus("error")}
              aria-label={ui(`${camera.name} 영상`)}
            />
          ))}
        {camera.source_type !== "device" &&
          (failure || status === "loading" || autoplayBlocked) && (
            <div className="camera-state">
              <CameraIcon size={24} />
              <b>
                {ui(
                  status === "disabled"
                    ? "사용 중지"
                    : status === "unsupported"
                      ? "재생 형식 미지원"
                      : failure
                        ? "영상 연결 실패"
                        : autoplayBlocked
                          ? "재생 버튼을 눌러주세요"
                          : "영상 연결 중",
                )}
              </b>
              {failure && camera.enabled && (
                <small>
                  {ui("재생 주소 · 네트워크 · CORS · HTTPS를 확인하세요.")}
                </small>
              )}
              {interactive && autoplayBlocked && (
                <button
                  onClick={() =>
                    video.current?.play().catch(() => setStatus("error"))
                  }
                >
                  <Play size={14} />
                  {ui("재생")}
                </button>
              )}
              {interactive && failure && camera.enabled && (
                <button onClick={() => setRetry((v) => v + 1)}>
                  <RefreshCw size={13} />
                  {ui("재연결")}
                </button>
              )}
            </div>
          )}
        {interactive && failure && camera.enabled && onUseDevice && (
          <button className="camera-device-fallback" onClick={onUseDevice}>
            {ui("기기 카메라로 보기")}
          </button>
        )}
        <div className="camera-osd">
          <span
            className={camera.source_type === "demo" ? "simulated" : "stream"}
          >
            <i />
            {ui(
              camera.source_type === "device"
                ? "기기 카메라"
                : camera.source_type === "demo"
                  ? "모의 화면"
                  : camera.source_type.toUpperCase(),
            )}{" "}
            {ui(status === "playing" ? "· 재생 중" : "")}
          </span>
          {interactive && onMaximize && (
            <button
              aria-label={ui(`${camera.name} 최대화`)}
              onClick={onMaximize}
            >
              <Maximize2 size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="camera-caption">
        <span>
          <b>{ui(camera.name)}</b>
          <small>{ui(camera.location)}</small>
        </span>
        <span className="camera-line">{ui(camera.line)} LINE</span>
      </div>
    </article>
  );
}
export function CctvWidget({
  cameras,
  layout = "grid",
  minimized = false,
  onLayoutChange,
  onMinimizedChange,
  interactive = true,
  title = "라인 CCTV",
  onSettings,
}: {
  cameras: Camera[];
  layout?: "single" | "grid";
  minimized?: boolean;
  onLayoutChange?: (layout: "single" | "grid") => void;
  onMinimizedChange?: (min: boolean) => void;
  interactive?: boolean;
  title?: string;
  onSettings?: () => void;
}) {
  const [deviceView, setDeviceView] = useState(false);
  const displayed = deviceView
    ? [
        {
          id: "LOCAL-" + (cameras[0]?.line || "A"),
          name: "기기 카메라",
          line: cameras[0]?.line || "A",
          location: "현재 브라우저 · 로컬 영상",
          source_type: "device",
          url: "",
          enabled: true,
          fit: "contain",
          revision: 1,
        } as Camera,
      ]
    : cameras;
  const [localLayout, setLocalLayout] = useState(layout),
    [localMin, setLocalMin] = useState(minimized),
    [expanded, setExpanded] = useState(false),
    [focus, setFocus] = useState<string | null>(null);
  const expandedRef = useRef<HTMLDivElement>(null);
  useEffect(() => setLocalLayout(layout), [layout]);
  useEffect(() => setLocalMin(minimized), [minimized]);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement as HTMLElement;
    expandedRef.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const nodes = expandedRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        );
        if (nodes?.length) {
          const first = nodes[0],
            last = nodes[nodes.length - 1];
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === expandedRef.current)
          ) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
      if (event.key === "Escape") {
        setExpanded(false);
        setFocus(null);
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [expanded]);
  const changeLayout = (value: "single" | "grid") => {
    setLocalLayout(value);
    onLayoutChange?.(value);
    setFocus(null);
  };
  const changeMin = (value: boolean) => {
    setLocalMin(value);
    onMinimizedChange?.(value);
  };
  const content = (full = false) => (
    <div className={`cctv-widget ${localMin && !full ? "cctv-minimized" : ""}`}>
      <header>
        <div>
          <Video size={17} />
          <h2>{ui(title)}</h2>
          <span>{ui(displayed.length)} CAM</span>
        </div>
        {interactive && (
          <div className="cctv-controls">
            <button
              aria-label={ui(
                deviceView ? "등록된 CCTV 보기" : "기기 카메라 보기",
              )}
              title={ui(deviceView ? "등록된 CCTV 보기" : "기기 카메라 보기")}
              className={deviceView ? "selected" : ""}
              onClick={() => {
                setDeviceView((v) => !v);
                setFocus(null);
              }}
            >
              <CameraIcon size={16} />
            </button>
            <button
              className={localLayout === "single" ? "selected" : ""}
              aria-label={ui("CCTV 단일 보기")}
              onClick={() => changeLayout("single")}
            >
              <Square size={15} />
            </button>
            <button
              className={localLayout === "grid" ? "selected" : ""}
              aria-label={ui("CCTV 멀티뷰")}
              onClick={() => changeLayout("grid")}
            >
              <Grid2X2 size={16} />
            </button>
            {onSettings && !full && (
              <button aria-label={ui("CCTV 위젯 설정")} onClick={onSettings}>
                <Settings2 size={16} />
              </button>
            )}
            {!full && (
              <button
                aria-label={ui(localMin ? "CCTV 펼치기" : "CCTV 최소화")}
                onClick={() => changeMin(!localMin)}
              >
                {localMin ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
              </button>
            )}
            <button
              aria-label={ui(full ? "CCTV 최대화 닫기" : "CCTV 최대화")}
              onClick={() => {
                setExpanded(!full);
                if (full) setFocus(null);
              }}
            >
              {full ? <X size={19} /> : <Maximize2 size={16} />}
            </button>
          </div>
        )}
      </header>
      {interactive &&
        !deviceView &&
        !localMin &&
        !cameras.some((c) => c.enabled && c.source_type !== "demo") && (
          <div className="cctv-device-banner">
            <span>
              {ui("실제 CCTV 대신 기기 카메라를 사용할 수 있습니다.")}
            </span>
            <button
              onClick={() => {
                setDeviceView(true);
                setFocus(null);
              }}
            >
              {ui("기기 카메라로 보기")}
            </button>
          </div>
        )}
      {(full || !expanded) &&
        (!localMin || full) &&
        (displayed.length ? (
          <>
            <div
              className={`cctv-grid ${focus || localLayout === "single" || displayed.length === 1 ? "single-camera" : ""}`}
            >
              {(focus
                ? displayed.filter((c) => c.id === focus)
                : localLayout === "single"
                  ? displayed.slice(0, 1)
                  : displayed
              ).map((c) => (
                <CameraTile
                  key={c.id}
                  camera={c}
                  interactive={interactive}
                  onUseDevice={() => {
                    setDeviceView(true);
                    setFocus(null);
                  }}
                  onMaximize={() => {
                    setFocus(c.id);
                    setExpanded(true);
                  }}
                />
              ))}
            </div>
            {(localLayout === "single" || focus) && displayed.length > 1 && (
              <div className="camera-switcher">
                {displayed.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setFocus(c.id);
                    }}
                    className={
                      c.id === (focus || displayed[0].id) ? "selected" : ""
                    }
                  >
                    {ui(c.name)}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="cctv-empty">
            <EyeOff size={25} />
            <b>{ui("표시할 카메라가 없습니다.")}</b>
            <p>{ui("같은 라인의 활성 카메라를 설정하세요.")}</p>
          </div>
        ))}
    </div>
  );
  return (
    <>
      {ui(content())}
      {ui(
        expanded &&
          createPortal(
            <div
              ref={expandedRef}
              tabIndex={-1}
              className="cctv-expanded"
              role="dialog"
              aria-modal="true"
              aria-label={ui("CCTV 최대화 보기")}
            >
              {ui(content(true))}
            </div>,
            document.body,
          ),
      )}
    </>
  );
}
export function DashboardCctv() {
  const [cameras, setCameras] = useState<Camera[]>([]),
    [layout, setLayout] = useState<CctvLayout | null>(null),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<CctvLayout | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([api<Camera[]>("/cameras"), api<CctvLayout>("/cctv/layout")])
      .then(([c, l]) => {
        if (active) {
          setCameras(c);
          setLayout(l);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(next: CctvLayout) {
    try {
      const result = await api<CctvLayout>("/cctv/layout", next);
      setLayout(result);
      setError("");
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!layout)
    return error ? <div className="form-error">{ui(error)}</div> : null;
  return (
    <section className="dashboard-cctv">
      <div className="field-section-heading">
        <div>
          <span className="eyebrow">SHOPFLOOR VISIBILITY</span>
          <h2>{ui("현장 영상 모니터링")}</h2>
          <p>{ui("라인별 영상과 기기 카메라를 통합 조회합니다.")}</p>
        </div>
        {!layout.enabled && (
          <button
            className="btn"
            onClick={() => {
              setDraft(layout);
              setEditing(true);
            }}
          >
            <Settings2 size={14} />
            {ui("CCTV 위젯 켜기")}
          </button>
        )}
      </div>
      {error && <div className="form-error">{ui(error)}</div>}
      {layout.enabled && (
        <CctvWidget
          cameras={cameras.filter(
            (c) => c.enabled && layout.camera_ids.includes(c.id),
          )}
          layout={layout.layout}
          minimized={layout.minimized}
          onLayoutChange={(value) => save({ ...layout, layout: value })}
          onMinimizedChange={(value) => save({ ...layout, minimized: value })}
          onSettings={() => {
            setDraft(structuredClone(layout));
            setEditing(true);
          }}
        />
      )}
      {editing && draft && (
        <FieldDialog
          title={ui("대시보드 CCTV 위젯 설정")}
          onClose={() => setEditing(false)}
        >
          <form
            className="form-body"
            onSubmit={(e) => {
              e.preventDefault();
              void save(draft);
            }}
          >
            <label className="check-row">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) =>
                  setDraft({ ...draft, enabled: e.target.checked })
                }
              />
              {ui("대시보드에 CCTV 위젯 표시")}
            </label>
            <label>
              {ui("기본 보기")}
              <select
                value={draft.layout}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    layout: e.target.value as "single" | "grid",
                  })
                }
              >
                <option value="grid">{ui("멀티뷰")}</option>
                <option value="single">{ui("단일 보기")}</option>
              </select>
            </label>
            <CameraPicker
              cameras={cameras.filter((c) => c.enabled)}
              selected={draft.camera_ids}
              onChange={(ids) => setDraft({ ...draft, camera_ids: ids })}
            />
            <button className="btn primary">{ui("위젯 설정 저장")}</button>
          </form>
        </FieldDialog>
      )}
    </section>
  );
}
export function CameraPicker({
  cameras,
  selected,
  onChange,
}: {
  cameras: Camera[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="camera-picker">
      <span>{ui("표시할 카메라 · 최대 4개")}</span>
      {cameras.length ? (
        cameras.map((c) => (
          <label className="check-row" key={c.id}>
            <input
              type="checkbox"
              checked={selected.includes(c.id)}
              disabled={!selected.includes(c.id) && selected.length >= 4}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, c.id]
                    : selected.filter((id) => id !== c.id),
                )
              }
            />
            <CameraIcon size={14} />
            <span>
              {ui(c.name)}
              <small>
                {ui(c.line)}
                {ui("라인 ·")}
                {ui(c.location)}
              </small>
            </span>
          </label>
        ))
      ) : (
        <p>{ui("이 라인에 활성 카메라가 없습니다.")}</p>
      )}
    </div>
  );
}
export function CamerasPage({ write }: { write: boolean }) {
  const [cameras, setCameras] = useState<Camera[]>([]),
    [line, setLine] = useState("all"),
    [error, setError] = useState(""),
    [edit, setEdit] = useState<Camera | null>(null),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false);
  const load = () =>
    api<Camera[]>("/cameras")
      .then(setCameras)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  const visible = cameras.filter((c) => line === "all" || c.line === line);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CCTV OPERATIONS</div>
          <h1>{ui("라인의 모든 시야를 연결하세요.")}</h1>
          <p>{ui("카메라 설정부터 멀티뷰, 대시보드와 현장 패널 위젯까지.")}</p>
        </div>
        <button
          className="btn primary"
          disabled={!write}
          onClick={() => setCreating(true)}
        >
          <Plus size={16} />
          {ui("카메라 등록")}
        </button>
      </div>
      <div className="field-toolbar">
        <div className="segmented">
          {[
            ["all", "전체 라인"],
            ["A", lineLabel("A")],
            ["B", lineLabel("B")],
          ].map(([id, name]) => (
            <button
              key={id}
              className={line === id ? "selected" : ""}
              onClick={() => setLine(id)}
            >
              {ui(name)}
            </button>
          ))}
        </div>
        <span className="muted small">
          {ui(visible.length)}
          {ui("개 카메라 · 모의 화면은 실제 영상이 아닙니다.")}
        </span>
      </div>
      {error && <div className="form-error">{ui(error)}</div>}
      <CctvWidget
        cameras={visible.filter((c) => c.enabled)}
        title={ui(line === "all" ? "전체 라인 CCTV" : `${line}라인 CCTV`)}
      />
      <section className="panel camera-registry">
        <div className="panel-header">
          <div>
            <h2>{ui("카메라 연결 설정")}</h2>
            <p>
              {ui(
                "HLS · MP4 · MJPEG 재생 주소 지원. RTSP 카메라는 스트리밍 게이트웨이에서 변환합니다.",
              )}
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{ui("카메라")}</th>
                <th>{ui("라인 / 설치 위치")}</th>
                <th>{ui("소스")}</th>
                <th>{ui("설정")}</th>
                <th>{ui("관리")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{ui(c.name)}</b>
                    <small className="block muted">{ui(c.id)}</small>
                  </td>
                  <td>
                    {ui(c.line)}
                    {ui("라인 ·")}
                    {ui(c.location)}
                  </td>
                  <td>
                    <span className="code-tag">
                      {ui(
                        c.source_type === "demo"
                          ? "모의 CCTV"
                          : c.source_type.toUpperCase(),
                      )}
                    </span>
                  </td>
                  <td>{ui(c.enabled ? "사용" : "중지")}</td>
                  <td>
                    <button
                      className="btn small-btn"
                      disabled={!write}
                      onClick={() => setEdit(c)}
                    >
                      <Settings2 size={13} />
                      {ui("설정")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {(edit || creating) && (
        <FieldDialog
          title={ui(edit ? "카메라 설정" : "카메라 등록")}
          onClose={() => {
            setEdit(null);
            setCreating(false);
          }}
        >
          <CameraForm
            camera={edit}
            busy={busy}
            onSave={async (config) => {
              setBusy(true);
              try {
                validateCamera(config);
                await api(
                  edit ? `/cameras/${edit.id}` : "/cameras",
                  edit ? { expected_revision: edit.revision, config } : config,
                );
                await load();
                setEdit(null);
                setCreating(false);
                setError("");
              } catch (e) {
                setError((e as Error).message);
                throw e;
              } finally {
                setBusy(false);
              }
            }}
          />
        </FieldDialog>
      )}
      <div className="info-banner">
        <Video size={18} />
        <p>
          {ui(
            "영상 연결 상태는 실제 재생 결과로 표시합니다. 브라우저가 접근할 수 있는 주소와 CORS 설정이 필요하며 HTTPS 페이지에서는 HTTPS 영상을 사용하세요.",
          )}
        </p>
      </div>
    </>
  );
}
function CameraForm({
  camera,
  busy,
  onSave,
}: {
  camera: Camera | null;
  busy: boolean;
  onSave: (config: Omit<Camera, "id" | "revision">) => Promise<void>;
}) {
  const [config, setConfig] = useState<Omit<Camera, "id" | "revision">>(
      camera
        ? {
            name: camera.name,
            line: camera.line,
            location: camera.location,
            source_type: camera.source_type,
            url: camera.url,
            enabled: camera.enabled,
            fit: camera.fit,
          }
        : {
            name: "",
            line: "A",
            location: "",
            source_type: "demo",
            url: "",
            enabled: true,
            fit: "cover",
          },
    ),
    [error, setError] = useState("");
  const patch = (value: Partial<typeof config>) =>
    setConfig((c) => ({ ...c, ...value }));
  return (
    <form
      className="form-body"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await onSave(config);
        } catch (error) {
          setError((error as Error).message);
        }
      }}
    >
      <label>
        {ui("카메라 이름")}
        <input
          required
          minLength={2}
          maxLength={80}
          value={config.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder={ui("예: A라인 입구 카메라")}
        />
      </label>
      <div className="form-row">
        <label>
          {ui("생산 라인")}
          <select
            value={config.line}
            onChange={(e) => patch({ line: e.target.value as "A" | "B" })}
          >
            <option>A</option>
            <option>B</option>
          </select>
        </label>
        <label>
          {ui("영상 소스")}
          <select
            value={config.source_type}
            onChange={(e) =>
              patch({
                source_type: e.target.value as Camera["source_type"],
                url: ["demo", "device"].includes(e.target.value)
                  ? ""
                  : config.url,
              })
            }
          >
            <option value="demo">{ui("모의 CCTV")}</option>
            <option value="device">
              {ui("기기 카메라 · Mac / iPhone / 웹캠")}
            </option>
            <option value="hls">{ui("HLS 스트림")}</option>
            <option value="mp4">{ui("MP4 영상")}</option>
            <option value="mjpeg">{ui("MJPEG 스트림")}</option>
          </select>
        </label>
      </div>
      <label>
        {ui("설치 위치")}
        <input
          required
          minLength={2}
          maxLength={80}
          value={config.location}
          onChange={(e) => patch({ location: e.target.value })}
          placeholder={ui("예: 생산동 A-01")}
        />
      </label>
      {!["demo", "device"].includes(config.source_type) && (
        <label>
          {ui("HTTP(S) 재생 주소")}
          <input
            required
            type="url"
            maxLength={1500}
            value={config.url}
            onChange={(e) => patch({ url: e.target.value })}
            placeholder="https://stream.example.com/line-a/index.m3u8"
          />
          <small>{ui("계정·암호가 포함된 주소는 저장할 수 없습니다.")}</small>
        </label>
      )}
      {config.source_type === "device" && (
        <p className="field-dialog-description">
          {ui(
            "카메라는 화면을 여는 기기에서 선택합니다. iPad는 iPad의 브라우저에서 직접 접속하거나 시스템에 웹캠으로 등록한 경우 사용할 수 있습니다. HTTPS 또는 localhost가 필요합니다.",
          )}
        </p>
      )}
      <label>
        {ui("화면 맞춤")}
        <select
          value={config.fit}
          onChange={(e) => patch({ fit: e.target.value as Camera["fit"] })}
        >
          <option value="cover">{ui("영역 채우기")}</option>
          <option value="contain">{ui("전체 영상 보기")}</option>
        </select>
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        {ui("카메라 사용")}
      </label>
      {error && (
        <div role="alert" className="form-error">
          {ui(error)}
        </div>
      )}
      <button className="btn primary" disabled={busy}>
        {ui(busy ? "저장 중…" : "카메라 설정 저장")}
      </button>
    </form>
  );
}
