import { LanguageSelector } from "./i18n/react";
import { ui } from "./i18n/locale";
import { intlLocale } from "./i18n/locale";
import { AgentWidgetCards } from "./agent-widgets";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  CheckCheck,
  ChevronRight,
  Factory,
  Maximize2,
  Monitor,
  Pause,
  Play,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";
import { api, num, time } from "./api";
import type { PanelSnapshot, Screen, PanelConfig } from "./panel-model";
import { TEMPLATES } from "./panel-model";
import { CctvWidget } from "./cctv";
import "./field.css";
export function PanelViewport({
  snapshot,
  index = 0,
  preview = false,
  fill = false,
  offline = false,
  onEvent,
}: {
  snapshot: PanelSnapshot;
  index?: number;
  preview?: boolean;
  fill?: boolean;
  offline?: boolean;
  onEvent?: (body: Record<string, string>) => Promise<unknown>;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [size, setSize] = useState({ width: 0, height: 0 });
  const [rw, rh] = snapshot.config.resolution.split("x").map(Number);
  const baseWidth = rw < rh ? 1080 : 1920,
    baseHeight = (baseWidth * rh) / rw;
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () =>
      setSize({ width: node.clientWidth, height: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(size.width / baseWidth, size.height / baseHeight) || 0;
  return (
    <div
      ref={ref}
      className={`panel-viewport ${fill ? "fill-viewport" : ""}`}
      style={fill ? undefined : { aspectRatio: `${rw}/${rh}` }}
    >
      <div
        className="panel-scaled-canvas"
        style={{
          width: baseWidth,
          height: baseHeight,
          left: (size.width - baseWidth * scale) / 2,
          top: (size.height - baseHeight * scale) / 2,
          transform: `scale(${scale})`,
        }}
      >
        <FloorBoard
          snapshot={snapshot}
          screen={snapshot.config.screens[index] || snapshot.config.screens[0]}
          preview={preview}
          offline={offline}
          portrait={rw < rh}
          onEvent={onEvent}
        />
      </div>
    </div>
  );
}
function Ring({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="floor-ring"
      style={
        {
          "--progress": `${Math.max(0, Math.min(100, value)) * 3.6}deg`,
        } as React.CSSProperties
      }
    >
      <div>
        <b>
          {ui(value.toFixed(1))}
          <small>%</small>
        </b>
        <span>{ui(label)}</span>
      </div>
    </div>
  );
}
function Stat({
  label,
  value,
  unit,
  accent = "cyan",
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: string;
}) {
  return (
    <div className={`floor-stat ${accent}`}>
      <span>{ui(label)}</span>
      <strong>
        {ui(value)}
        <small>{ui(unit)}</small>
      </strong>
    </div>
  );
}
function FloorChart({ series }: { series: PanelSnapshot["series"] }) {
  const max = Math.max(...series.map((s) => s.good), 1);
  return (
    <div className="floor-trend">
      <div>
        <h3>{ui("최종 공정 양품 추이")}</h3>
        <span>
          {ui("최근")}
          {ui(series.length)}
          {ui("개 수집 구간")}
        </span>
      </div>
      <svg
        viewBox="0 0 900 170"
        role="img"
        aria-label={ui("라인 최종 공정의 구간별 양품 수량")}
      >
        {[30, 75, 120, 165].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="900"
            y2={y}
            stroke="currentColor"
            opacity=".12"
          />
        ))}
        {series.map((s, i) => (
          <rect
            key={s.time}
            x={(i * 900) / Math.max(series.length, 1) + 3}
            y={165 - (s.good / max) * 140}
            width={Math.max(2, 900 / Math.max(series.length, 1) - 7)}
            height={(s.good / max) * 140}
            rx="3"
            fill="#4ccdb4"
          />
        ))}
      </svg>
      <div className="floor-chart-axis">
        <span>{ui(series[0] ? time(series[0].time) : "—")}</span>
        <span>{ui(series.at(-1) ? time(series.at(-1)!.time) : "—")}</span>
      </div>
    </div>
  );
}
export function FloorBoard({
  snapshot,
  screen,
  preview,
  portrait,
  offline,
  onEvent,
}: {
  snapshot: PanelSnapshot;
  screen: Screen;
  preview: boolean;
  portrait: boolean;
  offline: boolean;
  onEvent?: (body: Record<string, string>) => Promise<unknown>;
}) {
  const { config, assets, orders } = snapshot;
  const order = orders.find((o) => o.status === "running") || orders[0];
  const good = assets.reduce((n, a) => n + a.produced, 0),
    bad = assets.reduce((n, a) => n + a.rejected, 0),
    quality = (good / Math.max(good + bad, 1)) * 100,
    progress = order ? (order.completed / order.quantity) * 100 : 0;
  const [feedback, setFeedback] = useState(""),
    [pending, setPending] = useState(false);
  const requestRef = useRef<{ key: string; id: string } | null>(null),
    busyRef = useRef(false);
  async function send(body: Record<string, string>) {
    if (!onEvent || preview || busyRef.current) return;
    busyRef.current = true;
    setPending(true);
    const key = JSON.stringify(body);
    if (requestRef.current?.key !== key)
      requestRef.current = { key, id: crypto.randomUUID() };
    try {
      await onEvent({ ...body, event_id: requestRef.current.id });
      setFeedback(
        body.action === "support.request"
          ? "지원 요청이 접수되었습니다."
          : "작업지시 확인을 기록했습니다.",
      );
      requestRef.current = null;
    } catch (e) {
      setFeedback((e as Error).message);
    } finally {
      busyRef.current = false;
      setPending(false);
    }
  }
  const cameras =
    config.camera_widget.enabled &&
    screen.template !== "cctv" &&
    screen.template !== "agents";
  const view = () => {
    if (screen.template === "production")
      return (
        <>
          <div className="floor-stats">
            <Stat
              label={ui("생산 계획")}
              value={order ? num(order.quantity) : "—"}
              unit="ea"
            />
            <Stat
              label={ui("누적 완제품 실적")}
              value={order ? num(order.completed) : "—"}
              unit="ea"
              accent="green"
            />
            <Stat
              label={ui("누적 양품률 · 전체 설비")}
              value={quality.toFixed(1)}
              unit="%"
              accent="violet"
            />
            <Stat
              label={ui("가동 / 주의 설비")}
              value={`${assets.filter((a) => ["running", "warning"].includes(a.status)).length} / ${assets.length}`}
              unit="대"
              accent="amber"
            />
          </div>
          <div className="floor-production-grid">
            <section className="floor-card floor-plan">
              <span className="floor-kicker">CURRENT PRODUCTION</span>
              <h2>{ui(order?.product || "진행 중인 작업이 없습니다.")}</h2>
              <p>{ui(order?.name || "관리 콘솔에서 작업지시를 확인하세요.")}</p>
              <div className="floor-plan-progress">
                <Ring value={progress} label={ui("계획 달성률")} />
                <div>
                  <span>{ui("남은 계획 수량")}</span>
                  <strong>
                    {ui(
                      order
                        ? num(Math.max(0, order.quantity - order.completed))
                        : "—",
                    )}{" "}
                    <small>ea</small>
                  </strong>
                  <p>{ui(order?.id || "—")}</p>
                </div>
              </div>
            </section>
            <section className="floor-card">
              <FloorChart series={snapshot.series} />
            </section>
          </div>
          <div className="floor-machine-strip">
            {assets.map((a) => (
              <div key={a.id} className={a.status === "warning" ? "warn" : ""}>
                <i />
                <span>{ui(a.id)}</span>
                <b>{ui(a.status === "warning" ? "주의" : "가동 중")}</b>
              </div>
            ))}
          </div>
        </>
      );
    if (screen.template === "agents")
      return snapshot.agent_widgets?.length ? (
        <AgentWidgetCards results={snapshot.agent_widgets} floor />
      ) : (
        <section className="floor-card">
          <h2>{ui("설치된 에이전트가 없습니다.")}</h2>
          <p>{ui("패널 스튜디오에서 위젯 에이전트를 선택하세요.")}</p>
        </section>
      );
    if (screen.template === "equipment")
      return (
        <>
          <div className="floor-section-title">
            <h2>{ui("설비별 운전 상태")}</h2>
            <span>{ui("운영 임계값 · 온도 75°C / 진동 3.5 mm/s")}</span>
          </div>
          <div className="floor-equipment-grid">
            {assets.map((a) => (
              <section
                className={`floor-card floor-equipment ${a.status === "warning" ? "warn" : ""}`}
                key={a.id}
              >
                <div>
                  <span className="floor-asset-icon">
                    <Factory size={38} />
                  </span>
                  <span className="floor-status">
                    {ui(a.status === "warning" ? "주의 필요" : "정상 가동")}
                  </span>
                </div>
                <h2>{ui(a.name)}</h2>
                <span className="floor-kicker">{ui(a.id)}</span>
                <div className="floor-readings">
                  <span>
                    {ui("온도")}
                    <strong>
                      {ui(a.temperature.toFixed(1))}
                      <small>°C</small>
                    </strong>
                  </span>
                  <span>
                    {ui("진동")}
                    <strong>
                      {ui(a.vibration.toFixed(1))}
                      <small>mm/s</small>
                    </strong>
                  </span>
                </div>
                <div className="floor-reading-track">
                  <i style={{ width: `${Math.min(100, a.temperature)}%` }} />
                </div>
                <footer>
                  <span>
                    {ui("설정 주기")}
                    <b>{ui(a.cycle_time)}s</b>
                  </span>
                  <span>
                    {ui("누적 양품")}
                    <b>{ui(num(a.produced))}</b>
                  </span>
                </footer>
              </section>
            ))}
          </div>
        </>
      );
    if (screen.template === "quality")
      return (
        <>
          <div className="floor-stats">
            <Stat
              label={ui("설비 누적 양품")}
              value={num(good)}
              unit="ea"
              accent="green"
            />
            <Stat
              label={ui("설비 누적 불량")}
              value={num(bad)}
              unit="ea"
              accent="amber"
            />
            <Stat
              label={ui("현재 라인 알림")}
              value={String(snapshot.alerts.length)}
              unit="건"
            />
          </div>
          <div className="floor-quality-grid">
            <section className="floor-card floor-quality-ring">
              <Ring value={quality} label={ui("누적 양품률")} />
              <h2>{ui("라인의 품질을 한눈에.")}</h2>
              <p>{ui("전체 설비 처리 수량 기준")}</p>
            </section>
            <section className="floor-card floor-quality-bars">
              <h2>{ui("설비별 불량 수량")}</h2>
              {assets.map((a) => (
                <div key={a.id}>
                  <span>
                    {ui(a.id)}
                    <b>
                      {ui(num(a.rejected))} <small>ea</small>
                    </b>
                  </span>
                  <div>
                    <i
                      style={{
                        width: `${Math.max(2, (a.rejected / Math.max(...assets.map((s) => s.rejected), 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              <p>{ui("불량 원인 코드는 아직 연동되지 않았습니다.")}</p>
            </section>
          </div>
        </>
      );
    if (screen.template === "work-order")
      return (
        <div className="floor-work-grid">
          <section className="floor-card floor-current-order">
            <span className="floor-kicker">WORK INSTRUCTION</span>
            <span className="floor-status">
              {ui(order?.status === "running" ? "생산 진행 중" : "작업 대기")}
            </span>
            <h2>{ui(order?.product || "진행 작업 없음")}</h2>
            <p>{ui(order?.name || "작업지시를 등록하세요.")}</p>
            <div className="floor-order-numbers">
              <span>
                {ui("계획 수량")}
                <strong>
                  {ui(order ? num(order.quantity) : "—")}
                  <small> ea</small>
                </strong>
              </span>
              <span>
                {ui("완료 수량")}
                <strong>
                  {ui(order ? num(order.completed) : "—")}
                  <small> ea</small>
                </strong>
              </span>
            </div>
            <div className="floor-big-progress">
              <i style={{ width: `${Math.min(100, progress)}%` }} />
            </div>
            <p>
              {ui(order?.id || "—")}
              {ui("· 달성률")}
              {ui(progress.toFixed(1))}%
            </p>
            <button
              className="floor-touch-btn"
              disabled={
                !onEvent ||
                preview ||
                config.mode !== "touch" ||
                pending ||
                order?.status !== "running"
              }
              onClick={() =>
                send({ action: "work.acknowledge", order_id: order.id })
              }
            >
              <CheckCheck size={25} />
              {ui(pending ? "기록 중…" : "작업지시 확인")}
            </button>
          </section>
          <section className="floor-card floor-instructions">
            <h2>{ui("작업 안내")}</h2>
            {(
              screen.message ||
              "현재 작업지시와 품번을 확인하세요.\n현장에 승인된 작업서를 확인하세요.\n검사 결과와 생산 실적을 기록하세요."
            )
              .split("\n")
              .filter(Boolean)
              .map((message, i) => (
                <div key={i}>
                  <span>{ui(String(i + 1).padStart(2, "0"))}</span>
                  <p>{ui(message)}</p>
                </div>
              ))}
            <footer>
              <ShieldCheck size={24} />
              {ui("패널의 확인 기록은 장비 운전 명령이 아닙니다.")}
            </footer>
          </section>
        </div>
      );
    if (screen.template === "andon")
      return (
        <>
          <div className="floor-section-title">
            <h2>{ui("필요한 지원을 선택하세요.")}</h2>
            <span>{ui("요청은 현장 이력과 감사로그에 기록됩니다.")}</span>
          </div>
          <div className="floor-andon-actions">
            {[
              {
                reason: "equipment",
                label: "설비 점검 요청",
                text: "설비 이상 · 운전 상태 확인",
                icon: Wrench,
              },
              {
                reason: "material",
                label: "자재 지원 요청",
                text: "부품 · 원자재 보충 요청",
                icon: Box,
              },
              {
                reason: "quality",
                label: "품질 확인 요청",
                text: "검사 · 품질 담당자 확인",
                icon: ShieldCheck,
              },
            ].map((item) => (
              <button
                key={item.reason}
                disabled={
                  preview || !onEvent || config.mode !== "touch" || pending
                }
                onClick={() =>
                  send({ action: "support.request", reason: item.reason })
                }
              >
                <item.icon size={58} />
                <b>{ui(item.label)}</b>
                <span>{ui(item.text)}</span>
                <ChevronRight size={25} />
              </button>
            ))}
          </div>
          <section className="floor-card floor-request-history">
            <h2>{ui("최근 라인 입력")}</h2>
            {snapshot.events.length ? (
              snapshot.events.slice(0, 4).map((e) => (
                <div key={e.id}>
                  <span className="floor-status">{ui("접수")}</span>
                  <b>
                    {ui(e.name)}
                    {ui(
                      e.reason
                        ? ` · ${{ equipment: "설비", material: "자재", quality: "품질" }[e.reason as "equipment" | "material" | "quality"]}`
                        : "",
                    )}
                  </b>
                  <span>{ui(e.panel_id)}</span>
                  <time>{ui(time(e.created_at))}</time>
                </div>
              ))
            ) : (
              <p>{ui("등록된 현장 요청이 없습니다.")}</p>
            )}
          </section>
        </>
      );
    if (screen.template === "logistics")
      return (
        <>
          <div className="floor-section-title">
            <h2>{ui("공용 AMR 운용 현황")}</h2>
            <span>
              {ui(config.line)}
              {ui("라인 운반 작업")}{" "}
              {ui(snapshot.jobs.filter((j) => j.status === "running").length)}
              {ui("건 진행")}
            </span>
          </div>
          <div className="floor-robot-grid">
            {snapshot.robots.map((r) => (
              <section className="floor-card" key={r.id}>
                <div>
                  <Truck size={75} />
                  <span className="floor-status">
                    {ui(r.status === "busy" ? "작업 중" : "대기")}
                  </span>
                </div>
                <h2>{ui(r.name)}</h2>
                <p>
                  {ui("현재 위치 ·")}
                  {ui(r.location)}
                </p>
                <strong>
                  {ui(r.battery)}
                  <small>%</small>
                </strong>
                <div className="floor-big-progress">
                  <i style={{ width: `${r.battery}%` }} />
                </div>
                <footer>
                  {ui("누적 완료 작업")}
                  <b>
                    {ui(r.jobs)}
                    {ui("회")}
                  </b>
                </footer>
              </section>
            ))}
          </div>
          <section className="floor-card floor-request-history">
            <h2>{ui("현재 라인 운반 작업")}</h2>
            {snapshot.jobs.length ? (
              snapshot.jobs.slice(0, 3).map((j) => (
                <div key={j.id}>
                  <span className="floor-status">
                    {ui(j.status === "running" ? "진행" : "완료")}
                  </span>
                  <b>{ui(j.robot_id)}</b>
                  <span>{ui(j.destination)}</span>
                  <time>{ui(time(j.created_at))}</time>
                </div>
              ))
            ) : (
              <p>{ui("이 라인에 배정된 운반 작업이 없습니다.")}</p>
            )}
          </section>
        </>
      );
    if (screen.template === "cctv")
      return (
        <div className="floor-cctv-screen">
          <CctvWidget
            cameras={snapshot.cameras}
            layout={config.camera_widget.layout}
            interactive={!preview}
            title={ui(`${config.line}라인 CCTV`)}
          />
        </div>
      );
    return (
      <section className="floor-notice">
        <span className="floor-kicker">NOTICE TO THE FLOOR</span>
        <h2>{ui(screen.title)}</h2>
        <p>
          {ui(screen.message || "현장 공지 내용을 패널 설정에서 입력하세요.")}
        </p>
        <div>
          <Factory size={25} />
          {ui(config.location)}
        </div>
      </section>
    );
  };
  const stale =
    !!snapshot.last_data_at &&
    Date.now() - Date.parse(snapshot.last_data_at) > 60000;
  return (
    <div
      className={`floor-board theme-${config.theme} ${portrait ? "portrait" : ""}`}
    >
      <header className="floor-header">
        <div className="floor-brand">
          <span>
            <Factory size={34} />
          </span>
          <b>
            FORGE <em>FLOOR</em>
          </b>
        </div>
        <div>
          <span className="floor-kicker">
            {ui(config.line)} LINE ·{" "}
            {config.mode === "tv" ? "PRODUCTION BOARD" : "OPERATOR PANEL"}
          </span>
          <h1>{ui(screen.title)}</h1>
        </div>
        <div className="floor-clock">
          <strong>
            {ui(
              new Date(snapshot.server_time).toLocaleTimeString(intlLocale(), {
                hour12: false,
              }),
            )}
          </strong>
          <span>
            {ui(
              preview
                ? "미리보기 · 입력 저장 안 함"
                : offline
                  ? "연결 지연 · 마지막 수신 화면"
                  : stale
                    ? "수집 지연 · 마지막 데이터 확인 필요"
                    : snapshot.source === "published"
                      ? "게시 화면 · 연결됨"
                      : "PREVIEW",
            )}
          </span>
        </div>
      </header>
      <div
        className={`floor-workspace ${cameras ? "with-cameras camera-" + config.camera_widget.position : ""}`}
      >
        <main className={`floor-content template-${screen.template}`}>
          {ui(view())}
        </main>
        {cameras && (
          <aside className="floor-camera-widget">
            <CctvWidget
              cameras={snapshot.cameras}
              layout={config.camera_widget.layout}
              interactive={!preview}
              title={ui(`${config.line}라인 CCTV`)}
            />
          </aside>
        )}
      </div>
      {feedback && (
        <div className="floor-feedback" role="status">
          {ui(feedback)}
        </div>
      )}
      <footer className="floor-footer">
        <span>
          <i />
          {ui(config.name)}
          <small>{ui(config.location)}</small>
        </span>
        <span>
          {ui(
            screen.message &&
              screen.template !== "notice" &&
              screen.template !== "work-order"
              ? screen.message
              : "데이터를 연결하고, 현장의 실행을 바꿉니다.",
          )}
        </span>
        <b>
          {ui(TEMPLATES.find((t) => t.id === screen.template)?.name)} ·{" "}
          {ui(config.screens.findIndex((s) => s.id === screen.id) + 1)}/
          {ui(config.screens.length)}
        </b>
      </footer>
    </div>
  );
}
export function panelRoute() {
  const match = location.hash.match(/^#panel\/([^?]+)(?:\?(.*))?$/);
  if (!match) return null;
  return {
    id: decodeURIComponent(match[1]),
    key: new URLSearchParams(match[2] || "").get("key") || undefined,
    monitor: new URLSearchParams(match[2] || "").get("view") === "monitor",
  };
}
export function PanelPlayer({
  id,
  initialKey,
  readOnly = false,
}: {
  id: string;
  initialKey?: string;
  readOnly?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<PanelSnapshot | null>(null),
    [error, setError] = useState(""),
    [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    [retry, setRetry] = useState(0);
  const active = useRef(0),
    revision = useRef(0);
  active.current = index;
  const [deviceKey] = useState(() => {
    if (initialKey) {
      sessionStorage.setItem(`forge-panel-${id}`, initialKey);
      history.replaceState(
        null,
        "",
        `${location.pathname}${location.search}#panel/${encodeURIComponent(id)}${readOnly ? "?view=monitor" : ""}`,
      );
      return initialKey;
    }
    return readOnly
      ? undefined
      : sessionStorage.getItem(`forge-panel-${id}`) || undefined;
  });
  useEffect(() => {
    let alive = true,
      timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      let interval = 6000;
      try {
        const data = await api<PanelSnapshot>(
          `/panels/${id}/display`,
          undefined,
          deviceKey,
        );
        if (!alive) return;
        if (revision.current !== data.revision) {
          setIndex(0);
          revision.current = data.revision;
        }
        setSnapshot(data);
        setError("");
        interval = data.config.refresh_interval * 1000;
        if (!readOnly)
          await api(
            `/panels/${id}/heartbeat`,
            {
              screen_id:
                data.config.screens[active.current]?.id ||
                data.config.screens[0].id,
              revision: data.revision,
            },
            deviceKey,
          );
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) timer = setTimeout(load, interval);
      }
    };
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, deviceKey, retry, readOnly]);
  const screen = snapshot?.config.screens[index] || snapshot?.config.screens[0];
  useEffect(() => {
    if (
      !snapshot?.config.rotation_enabled ||
      paused ||
      !screen ||
      snapshot.config.screens.length < 2
    )
      return;
    const timer = setTimeout(
      () => setIndex((i) => (i + 1) % snapshot.config.screens.length),
      screen.duration * 1000,
    );
    return () => clearTimeout(timer);
  }, [
    screen?.id,
    screen?.duration,
    snapshot?.config.rotation_enabled,
    snapshot?.config.screens.length,
    paused,
  ]);
  return (
    <div className="panel-standalone">
      <div className="panel-player-toolbar">
        <a href={readOnly ? "#panel-view" : "#panels"}>
          <ArrowLeft size={15} />
          {ui(readOnly ? "현장 패널 뷰" : "패널 관리")}
        </a>
        <span>
          <Monitor size={15} />
          {ui(snapshot?.config.name || id)}
          <small>
            {ui(snapshot ? `게시 v${snapshot.revision}` : "연결 중")}{" "}
            {readOnly && (
              <b className="monitor-mode-badge">{ui("조회 전용")}</b>
            )}
          </small>
        </span>
        <div>
          <LanguageSelector />
          <button
            title={ui("전체 화면")}
            onClick={() => {
              document.documentElement
                .requestFullscreen?.()
                .catch(() =>
                  setError("브라우저의 전체 화면 메뉴를 사용하세요."),
                );
            }}
          >
            <Maximize2 size={16} />
          </button>
          <button
            aria-label={ui(paused ? "자동 전환 재개" : "자동 전환 일시정지")}
            onClick={() => setPaused((v) => !v)}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button
            aria-label={ui("이전 화면")}
            disabled={!snapshot}
            onClick={() =>
              setIndex(
                (i) =>
                  (i - 1 + snapshot!.config.screens.length) %
                  snapshot!.config.screens.length,
              )
            }
          >
            <ArrowLeft size={16} />
          </button>
          <button
            aria-label={ui("다음 화면")}
            disabled={!snapshot}
            onClick={() =>
              setIndex((i) => (i + 1) % snapshot!.config.screens.length)
            }
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
      {error && (
        <div className="panel-runtime-error" role="alert">
          {ui(error)}
          <button onClick={() => setRetry((v) => v + 1)}>
            {ui("다시 연결")}
          </button>
        </div>
      )}
      {snapshot ? (
        <div className="panel-standalone-stage">
          <PanelViewport
            snapshot={snapshot}
            index={index}
            offline={!!error}
            fill
            onEvent={
              readOnly
                ? undefined
                : (body) => api(`/panels/${id}/events`, body, deviceKey)
            }
          />
        </div>
      ) : (
        <div className="panel-waiting">
          <Monitor size={48} />
          <h1>
            {ui(
              error
                ? "패널 연결을 확인하세요."
                : "게시된 패널 화면을 불러오는 중…",
            )}
          </h1>
          <p>
            {ui("관리 콘솔에서 설정을 게시한 뒤 패널 연결 주소로 접속하세요.")}
          </p>
          <a className="btn" href="#panels">
            {ui("관리 콘솔로 이동")}
          </a>
        </div>
      )}
      {snapshot && (
        <div className="panel-touch-navigation">
          {snapshot.config.screens.map((s, i) => (
            <button
              key={s.id}
              className={index === i ? "selected" : ""}
              onClick={() => setIndex(i)}
            >
              {ui(s.title)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function configAspect(config: PanelConfig) {
  return config.resolution.split("x").map(Number);
}
