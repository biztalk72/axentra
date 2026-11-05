import { ui } from "./i18n/locale";
import { LanguageSelector, useLocale } from "./i18n/react";
import { syncDocumentLocale } from "./i18n/locale";
import { PanelViewerPage } from "./panel-viewer";
import { IntegrationsPage } from "./integrations/page";
import { SupplyPage } from "./supply/page";
import { DashboardAgentWidgets } from "./agent-widgets";
import { useIndustry, loadIndustry, lineLabel } from "./industry-context";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Monitor,
  Video,
  Eye,
  EyeOff,
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Box,
  Boxes,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Cpu,
  Database,
  Factory,
  FlaskConical,
  Gauge,
  GitBranch,
  Layers3,
  LayoutDashboard,
  LogOut,
  Maximize2,
  Network,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Truck,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, download, num, time, date, setToken, STATIC_DEMO } from "./api";
import type { Asset, Overview, Resource, User } from "./api";
import {
  ADMIN_EMAIL,
  PASSWORD_HINT,
  normalizeEmail,
  validateRegistration,
} from "./auth";
import { AgentWorkspace } from "./agent-workspace";
import { PanelsPage } from "./panels-page";
import { CamerasPage, DashboardCctv } from "./cctv";
import { PanelPlayer, panelRoute } from "./panel-player";
import "./styles.css";

type Page =
  | "panel-view"
  | "supply"
  | "integrations"
  | "panels"
  | "cctv"
  | "overview"
  | "edge"
  | "data"
  | "twin"
  | "simulator"
  | "ai"
  | "agent"
  | "robot"
  | "physical"
  | "orders"
  | "settings";
type Notice = { message: string; error?: boolean };
const nav: {
  id: Page;
  label: string;
  en: string;
  icon: LucideIcon;
  group: string;
}[] = [
  {
    id: "overview",
    label: "운영 대시보드",
    en: "Overview",
    icon: LayoutDashboard,
    group: "WORKSPACE",
  },
  {
    id: "orders",
    label: "생산 관리",
    en: "Manufacturing",
    icon: Boxes,
    group: "WORKSPACE",
  },
  {
    id: "supply",
    label: "공정·재고·창고",
    en: "Supply Chain",
    icon: Boxes,
    group: "WORKSPACE",
  },
  {
    id: "edge",
    label: "엣지 커넥트",
    en: "Edge",
    icon: Radio,
    group: "CONNECT & UNDERSTAND",
  },
  {
    id: "data",
    label: "데이터 허브",
    en: "Data Hub",
    icon: Database,
    group: "CONNECT & UNDERSTAND",
  },
  {
    id: "twin",
    label: "디지털 트윈",
    en: "Twin",
    icon: Layers3,
    group: "CONNECT & UNDERSTAND",
  },
  {
    id: "simulator",
    label: "시뮬레이터",
    en: "Simulator",
    icon: Workflow,
    group: "SIMULATE & DECIDE",
  },
  {
    id: "ai",
    label: "AI 모델 허브",
    en: "AI Hub",
    icon: Cpu,
    group: "SIMULATE & DECIDE",
  },
  {
    id: "agent",
    label: "멀티 AI 에이전트",
    en: "Agentic AI",
    icon: Sparkles,
    group: "SIMULATE & DECIDE",
  },
  {
    id: "robot",
    label: "로봇 오케스트레이션",
    en: "Robot Hub",
    icon: Truck,
    group: "ACT & OPTIMIZE",
  },
  {
    id: "physical",
    label: "피지컬 AI 랩",
    en: "Physical AI",
    icon: FlaskConical,
    group: "ACT & OPTIMIZE",
  },
  {
    id: "panels",
    label: "현장 패널 스튜디오",
    en: "Field Panels",
    icon: Monitor,
    group: "SHOPFLOOR EXPERIENCE",
  },
  {
    id: "panel-view",
    label: "현장 패널 뷰",
    en: "Panel Viewer",
    icon: Monitor,
    group: "SHOPFLOOR EXPERIENCE",
  },
  {
    id: "cctv",
    label: "라인 CCTV",
    en: "Line CCTV",
    icon: Video,
    group: "SHOPFLOOR EXPERIENCE",
  },
  {
    id: "integrations",
    label: "데이터 카탈로그·연동",
    en: "Data Products",
    icon: Database,
    group: "SYSTEM",
  },
  {
    id: "settings",
    label: "관리 및 감사로그",
    en: "Administration",
    icon: Settings2,
    group: "SYSTEM",
  },
];
const statusLabel: Record<string, string> = {
  running: "가동 중",
  warning: "주의",
  idle: "대기",
  busy: "작업 중",
  planned: "대기",
  completed: "완료",
  connected: "연결됨",
  configured: "설정 대기",
  pending: "승인 대기",
  approved: "승인됨",
  rejected: "반려됨",
  open: "미확인",
  acknowledged: "확인됨",
  trained: "학습 완료",
  deployed: "배포 중",
  archived: "보관됨",
  ready: "준비 완료",
  maintenance: "점검 중",
};
const Status = ({ value }: { value: string }) => (
  <span className={`status status-${value}`}>
    <i />
    {ui(statusLabel[value] || value)}
  </span>
);
const Empty = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <div className="empty">
    <Box size={28} />
    <strong>{ui(title)}</strong>
    <p>{ui(description)}</p>
  </div>
);
const SectionTitle = ({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) => (
  <div className="page-heading">
    <div>
      <div className="eyebrow">{ui(eyebrow)}</div>
      <h1>{ui(title)}</h1>
      <p>{ui(description)}</p>
    </div>
    {ui(action)}
  </div>
);
function Chart({ series }: { series: Overview["series"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640,
    height = 160,
    pad = 8;
  if (!series.length)
    return (
      <Empty
        title={ui("수집된 데이터가 없습니다")}
        description={ui("엣지 커넥트에서 데이터를 수집하세요.")}
      />
    );
  const max = Math.max(...series.map((s) => s.good), 1) * 1.2;
  const points = series.map((s, i) => [
    pad + (i * (width - pad * 2)) / Math.max(series.length - 1, 1),
    height - pad - (s.good / max) * (height - 24),
  ]);
  const line = points.map((p) => p.join(",")).join(" ");
  return (
    <div className="chart">
      <div className="chart-top">
        <span>
          <i className="legend blue" />
          {ui("이벤트 구간별 양품 수")}
        </span>
        <strong>
          {ui(
            hover !== null
              ? `${time(series[hover].time)} · ${num(series[hover].good)} ea`
              : "최근 24개 수집 구간",
          )}
        </strong>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ui("최근 수집 구간별 설비 양품 수 추이")}
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3364f5" stopOpacity=".17" />
            <stop offset="100%" stopColor="#3364f5" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((v) => (
          <line
            key={v}
            x1="0"
            y1={height - v * (height - 24)}
            x2={width}
            y2={height - v * (height - 24)}
            stroke="#e9edf3"
            strokeDasharray="4 5"
          />
        ))}
        <polygon
          points={`${pad},${height} ${line} ${width - pad},${height}`}
          fill="url(#chart-fill)"
        />
        <polyline
          points={line}
          fill="none"
          stroke="#3969ee"
          strokeWidth="2.8"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <g
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <rect
              x={p[0] - width / series.length / 2}
              y="0"
              width={width / series.length}
              height={height}
              fill="transparent"
            />
            {hover === i && (
              <>
                <line
                  x1={p[0]}
                  y1="0"
                  x2={p[0]}
                  y2={height}
                  stroke="#9eb7ff"
                  strokeDasharray="3 3"
                />
                <circle
                  cx={p[0]}
                  cy={p[1]}
                  r="5"
                  fill="#3969ee"
                  stroke="white"
                  strokeWidth="3"
                />
              </>
            )}
          </g>
        ))}
      </svg>
      <div className="axis">
        <span>{ui(time(series[0].time))}</span>
        <span>{ui(time(series[Math.floor(series.length / 2)].time))}</span>
        <span>{ui(time(series[series.length - 1].time))}</span>
      </div>
    </div>
  );
}
function FactoryMap({
  assets,
  onSelect,
  selected,
  large = false,
}: {
  assets: Asset[];
  onSelect: (a: Asset) => void;
  selected?: string;
  large?: boolean;
}) {
  const positions: Record<string, [number, number]> = {
    "NDL-MIX": [128, 126],
    "NDL-SHEET": [254, 126],
    "NDL-STEAM": [380, 126],
    "NDL-PACK": [506, 126],
    "SUP-BLEND": [128, 276],
    "SUP-SIEVE": [254, 276],
    "SUP-FILL": [380, 276],
    "SUP-PACK": [506, 276],
  };
  return (
    <div className={`factory-map ${large ? "large" : ""}`}>
      <svg
        viewBox="0 0 680 420"
        role="img"
        aria-label={ui(
          "FORGE 라면 스마트팩토리 8개 설비 배치도. 설비를 선택하면 상태가 표시됩니다.",
        )}
      >
        <defs>
          <pattern
            id="grid"
            width="25"
            height="25"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 25 0 L 0 0 0 25"
              fill="none"
              stroke="#dfe6ee"
              strokeWidth=".7"
            />
          </pattern>
          <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow
              dx="0"
              dy="7"
              stdDeviation="6"
              floodColor="#29426e"
              floodOpacity=".10"
            />
          </filter>
        </defs>
        <rect
          x="30"
          y="22"
          width="620"
          height="365"
          rx="13"
          fill="#edf2f7"
          stroke="#dbe3ed"
        />
        <rect
          x="30"
          y="22"
          width="620"
          height="365"
          rx="13"
          fill="url(#grid)"
        />
        <path d="M52 215 H628" stroke="white" strokeWidth="34" />
        <path
          d="M55 215 H625"
          stroke="#c3cddc"
          strokeWidth="1.2"
          strokeDasharray="7 7"
        />
        <path
          d="M82 90 H590 V180 H82 Z M82 240 H590 V330 H82 Z"
          fill="none"
          stroke="#ccd9e7"
          strokeWidth="2"
        />
        <text
          x="62"
          y="61"
          fontSize="10"
          fontWeight="700"
          fill="#8091a7"
          letterSpacing="2"
        >
          A LINE · {ui(lineLabel("A"))}
        </text>
        <text
          x="62"
          y="366"
          fontSize="10"
          fontWeight="700"
          fill="#8091a7"
          letterSpacing="2"
        >
          B LINE · {ui(lineLabel("B"))}
        </text>
        <g transform="translate(300 202)">
          <rect width="28" height="25" rx="7" fill="#3b65ed" />
          <rect x="6" y="5" width="16" height="11" rx="3" fill="#bdd0ff" />
          <circle cx="7" cy="24" r="3" fill="#344761" />
          <circle cx="22" cy="24" r="3" fill="#344761" />
          <text x="39" y="17" fontSize="10" fill="#71839e">
            {ui("AMR 물류 동선")}
          </text>
        </g>
        {ui(
          assets.map((a) => {
            const [x, y] = positions[a.id] || [128, 126];
            const warn = a.status === "warning";
            const chosen = selected === a.id;
            return (
              <g
                key={a.id}
                role="button"
                tabIndex={0}
                aria-label={ui(`${a.name} ${statusLabel[a.status]}`)}
                onClick={() => onSelect(a)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(a);
                  }
                }}
                className="machine"
                transform={`translate(${x} ${y})`}
              >
                <rect
                  x="-46"
                  y="-34"
                  width="95"
                  height="82"
                  rx="9"
                  fill={chosen ? "#dce6ff" : warn ? "#fff1d9" : "#e2e9f1"}
                  stroke={chosen ? "#406bea" : warn ? "#e6ad48" : "#d5dfe9"}
                  strokeWidth={chosen ? "2" : "1"}
                />
                <g filter="url(#shadow)">
                  <path
                    d="M-33 -12 L-16 -24 L32 -24 L32 22 L17 33 L-33 33Z"
                    fill="#c3cfdc"
                  />
                  <path d="M-33 -12 H17 V33 H-33Z" fill="#f9fbfe" />
                  <path d="M17 -12 L32 -24 V22 L17 33Z" fill="#afbdcf" />
                  <path d="M-33 -12 L-16 -24 H32 L17 -12Z" fill="#e4ebf3" />
                  <rect
                    x="-25"
                    y="-4"
                    width="29"
                    height="24"
                    rx="2"
                    fill={a.kind === "QC" ? "#95b4d1" : "#476184"}
                  />
                  <rect
                    x="-22"
                    y="-1"
                    width="23"
                    height="18"
                    rx="1"
                    fill="#2b405c"
                  />
                  <path
                    d="M-20 13 L-14 5 L-9 10 L-3 2"
                    stroke="#88afd7"
                    strokeWidth="1.2"
                    fill="none"
                  />
                  <rect
                    x="8"
                    y="0"
                    width="5"
                    height="8"
                    rx="1"
                    fill="#92a7c4"
                  />
                  <circle
                    cx="10"
                    cy="14"
                    r="2"
                    fill={warn ? "#edaf35" : "#29b591"}
                  />
                  <rect
                    x="-25"
                    y="24"
                    width="30"
                    height="3"
                    rx="1"
                    fill="#d6e0eb"
                  />
                  <rect
                    x="-1"
                    y="-37"
                    width="4"
                    height="13"
                    rx="1"
                    fill="#9babc0"
                  />
                  <circle
                    cx="1"
                    cy="-38"
                    r="4"
                    fill={warn ? "#f2b343" : "#38b998"}
                    className={warn ? "warning-light" : ""}
                  />
                </g>
                <rect
                  x="-37"
                  y="52"
                  width="78"
                  height="21"
                  rx="5"
                  fill={warn ? "#fff6e6" : "white"}
                  stroke={warn ? "#f3dba7" : "#e0e6ef"}
                />
                <circle
                  cx="-25"
                  cy="62"
                  r="2.5"
                  fill={warn ? "#e3a630" : "#2aaf8c"}
                />
                <text
                  x="-17"
                  y="65.5"
                  fill="#4b5d74"
                  fontSize="9.5"
                  fontWeight="600"
                >
                  {ui(a.id)}
                </text>
              </g>
            );
          }),
        )}
        <g transform="translate(565 349)">
          <path d="M13 0 L20 20 L13 16 L6 20Z" fill="#90a2b9" />
          <text x="10" y="32" fontSize="9" fill="#90a2b9">
            N
          </text>
        </g>
      </svg>
    </div>
  );
}
function Login({
  onLogin,
}: {
  onLogin: (user: User, registered?: boolean) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(STATIC_DEMO);
  useEffect(() => {
    if (STATIC_DEMO) return;
    let active = true;
    fetch("/health")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((r) => {
        if (active) setRegistrationEnabled(r.registration_enabled === true);
      })
      .catch(() => {
        if (active)
          setError("서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.");
      });
    return () => {
      active = false;
    };
  }, []);
  function changeMode(next: "login" | "register") {
    setMode(next);
    setError("");
    setPassword("");
    setConfirm("");
    setShowPassword(false);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError("");
    try {
      const body =
        mode === "register"
          ? validateRegistration({
              name,
              email,
              password,
              password_confirm: confirm,
            })
          : { email: normalizeEmail(email), password };
      setLoading(true);
      const result = await api<{ access_token: string; user: User }>(
        mode === "register" ? "/auth/register" : "/auth/login",
        body,
      );
      setToken(result.access_token);
      onLogin(result.user, mode === "register");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="login-screen">
      <div className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Layers3 size={24} />
          </span>
          <b>
            FORGE<span>AX</span>
          </b>
        </div>
        <div className="login-copy">
          <span className="eyebrow">THE CONNECTED FACTORY</span>
          <h1>
            {ui("데이터에서 실행까지.")}
            <br />
            {ui("제조의 다음을 연결하다.")}
          </h1>
          <p>
            {ui("현장과 디지털, 인사이트와 실행.")}
            <br />
            {ui("제조 전주기를 하나로 연결하는 AX 운영 플랫폼.")}
          </p>
          <div className="login-flow">
            CONNECT <ArrowRight size={16} /> SIMULATE <ArrowRight size={16} />{" "}
            ACT
          </div>
        </div>
        <div className="login-orbit">
          <div />
          <div />
          <div />
          <Factory size={80} />
        </div>
        <span className="login-footer">
          FORGE AX · Manufacturing intelligence, connected.
        </span>
      </div>
      <div className="login-form">
        <LanguageSelector />
        <span className="subtle-label">
          {mode === "register"
            ? "CREATE YOUR WORKSPACE ACCOUNT"
            : "WORKSPACE LOGIN"}
        </span>
        <h2>
          {ui(
            mode === "register"
              ? "제조 AX, 직접 체험해 보세요."
              : "워크스페이스에 오신 것을 환영합니다.",
          )}
        </h2>
        <p>
          {ui(
            mode === "register"
              ? "계정을 만들면 바로 가상 제조라인으로 입장합니다."
              : "관리자 또는 직접 만든 체험 계정으로 로그인하세요.",
          )}
        </p>
        {registrationEnabled && (
          <div
            className="auth-tabs"
            role="tablist"
            aria-label={ui("계정 시작 방식")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              disabled={loading}
              onClick={() => changeMode("login")}
            >
              {ui("로그인")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              disabled={loading}
              onClick={() => changeMode("register")}
            >
              {ui("체험 계정 만들기")}
            </button>
          </div>
        )}
        <form
          onSubmit={submit}
          aria-label={ui(
            mode === "register" ? "체험 계정 가입" : "계정 로그인",
          )}
        >
          <fieldset disabled={loading} className="auth-fields">
            {mode === "register" && (
              <label>
                {ui("이름")}
                <input
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={60}
                  value={name}
                  placeholder={ui("표시할 이름을 입력하세요")}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            <label>
              {ui("이메일")}
              <input
                type="email"
                required
                autoComplete={mode === "register" ? "email" : "username"}
                maxLength={200}
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              {ui("비밀번호")}
              <div className="password-input">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  minLength={mode === "register" ? 8 : 1}
                  maxLength={mode === "register" ? 128 : 256}
                  placeholder={ui(
                    mode === "register"
                      ? "영문·숫자를 포함해 8자 이상"
                      : "비밀번호 입력",
                  )}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={ui(
                    showPassword ? "비밀번호 숨기기" : "비밀번호 표시",
                  )}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {mode === "register" && (
                <small className="password-hint">{ui(PASSWORD_HINT)}</small>
              )}
            </label>
            {mode === "register" && (
              <label>
                {ui("비밀번호 확인")}
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  maxLength={128}
                  placeholder={ui("비밀번호를 한 번 더 입력하세요")}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
            )}
            {error && (
              <div className="form-error" role="alert">
                {ui(error)}
              </div>
            )}
            <button className="btn primary wide" disabled={loading}>
              {ui(
                loading
                  ? mode === "register"
                    ? "가입 및 입장 중…"
                    : "로그인 중…"
                  : mode === "register"
                    ? "체험 계정 만들고 시작하기"
                    : "워크스페이스 로그인",
              )}
              <ArrowRight size={16} />
            </button>
          </fieldset>
        </form>
        {mode === "register" ? (
          <div className="registration-note">
            <ShieldCheck size={17} />
            <div>
              <b>{ui("일반 사용자 · 체험 운영자")}</b>
              <p>
                {ui(
                  "데이터 수집, 시뮬레이션, 모델 학습, 생산·가상 로봇 작업을 체험할 수 있습니다. 승인·모델 배포는 관리자에게 요청하세요.",
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="demo-login">
            <span>
              {ui("관리자 계정:")}
              <b>{ui(ADMIN_EMAIL)}</b>
            </span>
            <button
              type="button"
              onClick={() => {
                setEmail(ADMIN_EMAIL);
                setError("");
              }}
            >
              {ui("관리자 이메일 입력")}
              <ArrowUpRight size={14} />
            </button>
          </div>
        )}
        <p className="auth-storage-note">
          {ui(
            STATIC_DEMO
              ? "브라우저 체험 모드 · 가입 계정은 이 브라우저에만 저장됩니다. 다른 기기에서는 별도로 가입하세요."
              : "서버 연결 모드 · 가입 계정은 워크스페이스 데이터베이스에 저장됩니다.",
          )}
        </p>
        <div className="secure-note">
          <ShieldCheck size={15} />
          {ui("비밀번호 해시 저장 · 역할별 권한 · 8시간 세션")}
        </div>
      </div>
    </div>
  );
}
function App() {
  const industry = useIndustry();
  const [user, setUser] = useState<User | null>(null);
  const [boot, setBoot] = useState(true);
  const [page, setPage] = useState<Page>(() => {
    const initial = location.hash.slice(1) as Page;
    return nav.some((n) => n.id === initial) ? initial : "overview";
  });
  const [overview, setOverview] = useState<Overview | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [modal, setModal] = useState<"connector" | "order" | "help" | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const toast = (message: string, error = false) =>
    setNotice({ message, error });
  const go = (p: Page) => {
    setPage(p);
    location.hash = p;
    setSearchOpen(false);
  };
  const refresh = () => setRevision((x) => x + 1);
  const write = user?.role !== "viewer";
  const admin = user?.role === "admin";
  useEffect(() => {
    const expired = () => {
      setUser(null);
      toast("세션이 만료되었습니다. 다시 로그인하세요.", true);
    };
    const hash = () => {
      const p = location.hash.slice(1) as Page;
      setPage(nav.some((n) => n.id === p) ? p : "overview");
    };
    window.addEventListener("session-expired", expired);
    window.addEventListener("hashchange", hash);
    api<User>("/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setBoot(false));
    return () => {
      window.removeEventListener("session-expired", expired);
      window.removeEventListener("hashchange", hash);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!user) return;
    void loadIndustry().catch(() => {});
    let alive = true;
    const load = () =>
      api<Overview>("/overview")
        .then((v) => {
          if (alive) {
            setOverview(v);
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    load();
    const interval = setInterval(load, 6000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [user, revision]);
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setSearchOpen(false);
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, []);
  async function action(path: string, body: unknown, message: string) {
    setBusy(true);
    try {
      const r = await api<Resource>(path, body);
      refresh();
      toast(message);
      return r;
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function file(path: string, name: string) {
    try {
      await download(path, name);
      toast("파일을 내려받았습니다.");
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  if (boot)
    return (
      <div className="boot">
        <span className="brand-mark">
          <Layers3 />
        </span>
        <p>{ui("워크스페이스 연결 중…")}</p>
      </div>
    );
  if (!user)
    return (
      <>
        <Login
          onLogin={(next, registered) => {
            setUser(next);
            go("overview");
            toast(
              registered
                ? "체험 계정이 생성되었습니다. 제조 AX 체험을 시작하세요."
                : `${next.name}님, 환영합니다.`,
            );
          }}
        />
        {notice && (
          <div className={`toast ${notice.error ? "error" : ""}`} role="status">
            {ui(notice.message)}
          </div>
        )}
      </>
    );
  const current = nav.find((n) => n.id === page) || nav[0];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label={ui("FORGE AX 홈")}>
          <span className="brand-mark">
            <Layers3 size={23} />
          </span>
          <b>
            FORGE<span>AX</span>
          </b>
        </a>
        <div className="workspace-label">
          <span className="workspace-icon">
            <Factory size={16} />
          </span>
          <div>
            <b>{ui(industry.config.plant_name)}</b>
            <small>Manufacturing workspace</small>
          </div>
          <span className="workspace-dot" />
        </div>
        <nav>
          {nav.map((item, i) => (
            <React.Fragment key={item.id}>
              {(!i || nav[i - 1].group !== item.group) && (
                <div className="nav-group">{ui(item.group)}</div>
              )}
              <button
                title={ui(item.label)}
                aria-label={ui(item.label)}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => go(item.id)}
              >
                <item.icon size={17} />
                <span>{ui(item.label)}</span>
                {item.id === "agent" && !!overview?.kpis.pending && (
                  <small>{ui(overview.kpis.pending)}</small>
                )}
                {page === item.id && <span className="active-dot" />}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="platform-state">
            <i />
            <span>
              {ui(
                STATIC_DEMO
                  ? "브라우저 체험 모드"
                  : error
                    ? "서버 연결 확인 필요"
                    : "플랫폼 정상 운영",
              )}
            </span>
            <small>v0.1</small>
          </div>
          <button
            className="user-profile"
            onClick={async () => {
              try {
                await api("/auth/logout", {});
              } catch {
                /* local session can always be cleared */
              }
              setToken("");
              setUser(null);
              setOverview(null);
            }}
            title={ui("로그아웃")}
          >
            <span className="avatar">{ui(user.name.slice(0, 1))}</span>
            <span>
              <b>{ui(user.name)}</b>
              <small>
                {ui(
                  user.role === "admin"
                    ? "워크스페이스 관리자"
                    : user.role === "operator"
                      ? "현장 운영자"
                      : "조회 사용자",
                )}
              </small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>{ui("워크스페이스")}</span>
            <ChevronRight size={13} />
            <b>{ui(current.label)}</b>
          </div>
          <div className="topbar-actions">
            <LanguageSelector />
            <div className="global-search" ref={searchRef}>
              <Search size={15} />
              <input
                aria-label={ui("메뉴 및 설비 검색")}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                placeholder={ui("메뉴, 설비 검색")}
              />
              {searchOpen && (
                <div className="search-results">
                  {nav
                    .filter((n) =>
                      (ui(n.label) + " " + n.label + " " + n.en)
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((n) => (
                      <button key={n.id} onClick={() => go(n.id)}>
                        <n.icon size={15} />
                        {ui(n.label)}
                        <span>{ui(n.en)}</span>
                      </button>
                    ))}
                  {overview?.assets
                    .filter((a) =>
                      (a.id + a.name + ui(a.name))
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          go("twin");
                          setQuery(a.id);
                        }}
                      >
                        <Factory size={15} />
                        {ui(a.id)}
                        <span>{ui(a.name)}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
            <span className="header-divider" />
            <button
              className="icon-button"
              aria-label={ui("사용 안내")}
              onClick={() => setModal("help")}
            >
              <CircleHelp size={19} />
            </button>
            <button
              className="icon-button notification-button"
              aria-label={ui("미확인 알림 보기")}
              onClick={() => go("agent")}
            >
              <Bell size={19} />
              {!!overview?.alerts.length && <i />}
            </button>
            <span className="mini-avatar">{ui(user.name.slice(0, 1))}</span>
          </div>
        </header>
        <main>
          {error && (
            <div className="connection-error" role="alert">
              {ui("데이터 갱신 실패:")}
              {ui(error)}
              <button onClick={refresh}>{ui("다시 연결")}</button>
            </div>
          )}
          {!overview ? (
            <div className="loading-state">
              <RefreshCw className="spin" />
              {ui("제조 데이터 불러오는 중…")}
            </div>
          ) : (
            <>
              <div className="context-bar">
                <span>
                  <Factory size={14} />
                  {ui(industry.config.name)}
                  {ui("1공장")}
                  <ChevronRight size={11} />
                  {ui("전체 라인")}
                </span>
                <div>
                  {overview.demo && (
                    <span className="demo-pill">
                      {ui(
                        STATIC_DEMO
                          ? "브라우저 체험 · 로컬 저장"
                          : "가상 제조라인 · DEMO",
                      )}
                    </span>
                  )}
                  <span className="live-label">
                    <i />
                    {ui("6초마다 갱신")}
                  </span>
                  <span className="update-time">
                    {ui(time(overview.server_time))}
                    {ui("기준")}
                  </span>
                </div>
              </div>
              {page === "overview" ? (
                <>
                  <OverviewPage data={overview} go={go} refresh={refresh} />
                  <DashboardAgentWidgets />
                  <DashboardCctv />
                </>
              ) : page === "integrations" ? (
                <IntegrationsPage admin={admin} />
              ) : page === "supply" ? (
                <SupplyPage admin={admin} write={write} />
              ) : page === "panel-view" ? (
                <PanelViewerPage />
              ) : page === "panels" ? (
                <PanelsPage write={write} admin={admin} />
              ) : page === "cctv" ? (
                <CamerasPage write={write} />
              ) : page === "twin" ? (
                <TwinPage data={overview} query={query} />
              ) : page === "data" ? (
                <DataPage data={overview} file={file} revision={revision} />
              ) : page === "edge" ? (
                <EdgePage
                  revision={revision}
                  write={write}
                  admin={admin}
                  busy={busy}
                  action={action}
                  open={() => setModal("connector")}
                  events={overview.kpis.events}
                  demo={overview.demo}
                />
              ) : page === "simulator" ? (
                <SimulatorPage
                  write={write}
                  busy={busy}
                  action={action}
                  revision={revision}
                />
              ) : page === "ai" ? (
                <AIPage
                  data={overview}
                  write={write}
                  admin={admin}
                  busy={busy}
                  action={action}
                  revision={revision}
                  toast={toast}
                />
              ) : page === "agent" ? (
                <AgentWorkspace
                  write={write}
                  admin={admin}
                  revision={revision}
                  action={action}
                  approvalContent={
                    <AgentPage
                      admin={admin}
                      write={write}
                      busy={busy}
                      action={action}
                      revision={revision}
                    />
                  }
                />
              ) : page === "robot" ? (
                <RobotPage
                  write={write}
                  busy={busy}
                  action={action}
                  revision={revision}
                  demo={overview.demo}
                />
              ) : page === "physical" ? (
                <PhysicalPage
                  write={write}
                  busy={busy}
                  action={action}
                  revision={revision}
                  file={file}
                  go={go}
                />
              ) : page === "orders" ? (
                <OrdersPage
                  write={write}
                  busy={busy}
                  action={action}
                  revision={revision}
                  open={() => setModal("order")}
                />
              ) : (
                <SettingsPage admin={admin} user={user} revision={revision} />
              )}
              <footer className="main-footer">
                <span>
                  FORGE AX <i />
                  {ui(
                    STATIC_DEMO
                      ? "공개 데모 · 실제 서버·설비와 연결되지 않습니다."
                      : "제조의 모든 연결, 더 나은 실행.",
                  )}
                </span>
                <span>{ui("데이터 → 가상화 → 판단 → 실행")}</span>
              </footer>
            </>
          )}
        </main>
      </div>
      {notice && (
        <div className={`toast ${notice.error ? "error" : ""}`} role="status">
          {notice.error ? <X size={18} /> : <Check size={18} />}
          <span>{ui(notice.message)}</span>
          <button aria-label={ui("알림 닫기")} onClick={() => setNotice(null)}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={ui(
            modal === "connector"
              ? "새 커넥터 구성"
              : modal === "order"
                ? "새 생산 작업지시"
                : "FORGE AX 사용 안내",
          )}
          onClose={() => setModal(null)}
        >
          {modal === "help" ? (
            <div className="help-content">
              <p>
                {ui(
                  "가상 제조라인에서 데이터 수집부터 운영 의사결정까지 경험할 수 있습니다.",
                )}
              </p>
              <ol>
                <li>{ui("엣지 커넥트에서 샘플 데이터를 수집합니다.")}</li>
                <li>{ui("시뮬레이터에서 공정 조건을 비교합니다.")}</li>
                <li>{ui("AI 모델 허브에서 통계 모델을 학습·배포합니다.")}</li>
                <li>{ui("AX 에이전트에서 점검 제안을 승인합니다.")}</li>
                <li>{ui("로봇 허브에서 가상 운반 작업을 실행합니다.")}</li>
              </ol>
              <div className="info-banner">
                {ui(
                  "OPC-UA·MQTT 어댑터, 실장비 제어, LLM 에이전트 및 로봇 학습은 후속 연동 범위입니다.",
                )}
              </div>
            </div>
          ) : (
            <CreateForm
              type={modal}
              busy={busy}
              onSubmit={async (body) => {
                const r = await action(
                  modal === "connector" ? "/connectors" : "/orders",
                  body,
                  modal === "connector"
                    ? "커넥터 설정을 저장했습니다."
                    : "작업지시를 생성했습니다.",
                );
                if (r) setModal(null);
              }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
function useResources(category: string, revision: number) {
  const [rows, setRows] = useState<Resource[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api<Resource[]>("/resources/" + category)
      .then((v) => {
        if (alive) {
          setRows(v);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [category, revision]);
  return { rows, error };
}
function LoadError({ message }: { message: string }) {
  return message ? (
    <div className="form-error" role="alert">
      {ui(message)}
    </div>
  ) : null;
}
function OverviewPage({
  data,
  go,
  refresh,
}: {
  data: Overview;
  go: (p: Page) => void;
  refresh: () => void;
}) {
  const k = data.kpis;
  const [selected, setSelected] = useState<Asset | null>(null);
  return (
    <>
      <SectionTitle
        eyebrow="OPERATIONS OVERVIEW"
        title={ui("제조 운영 현황")}
        description={ui(
          "생산·품질·설비 상태와 주요 운영 이슈를 통합 모니터링합니다.",
        )}
        action={
          <button className="btn" onClick={refresh}>
            <RefreshCw size={15} />
            {ui("새로고침")}
          </button>
        }
      />
      <div className="metric-grid">
        <Metric
          icon={Gauge}
          title={ui("설비 운영 지수")}
          value={k.equipment_health.toFixed(1)}
          unit="%"
          note="가동 설비 비율 × 누적 양품률"
          accent="blue"
        />
        <Metric
          icon={Boxes}
          title={ui("설비 누적 양품")}
          value={num(k.produced)}
          unit="ea"
          note="전체 설비 처리 수량 합계"
          accent="violet"
        />
        <Metric
          icon={ShieldCheck}
          title={ui("누적 양품률")}
          value={k.quality.toFixed(1)}
          unit="%"
          note={`불량 ${num(k.rejected)} ea · 전체 설비 기준`}
          accent="teal"
        />
        <Metric
          icon={Activity}
          title={ui("운영 중인 설비")}
          value={`${k.running}`}
          unit={`/ ${k.total_assets}`}
          note={`주의 설비 ${data.assets.filter((a) => a.status === "warning").length}대 · 가동 설비에 포함`}
          accent="orange"
        />
      </div>
      <div className="overview-main">
        <section className="panel twin-panel">
          <div className="panel-header">
            <div>
              <h2>
                <span className="tiny-icon">
                  <Layers3 size={16} />
                </span>
                {ui("설비 운영 맵")}
                <span className="label neutral">2D TWIN</span>
              </h2>
              <p>
                {ui("라인별 설비 배치와 가동 상태를 실시간으로 확인합니다.")}
              </p>
            </div>
            <button
              className="icon-button"
              title={ui("디지털 트윈 열기")}
              onClick={() => go("twin")}
            >
              <Maximize2 size={16} />
            </button>
          </div>
          <div className="map-toolbar">
            <span>
              <i className="legend teal" />
              {ui("정상 가동")}
            </span>
            <span>
              <i className="legend amber" />
              {ui("주의")}
            </span>
            <span className="map-location">1F · PRODUCTION FLOOR</span>
          </div>
          <FactoryMap
            assets={data.assets}
            selected={selected?.id}
            onSelect={setSelected}
          />
          <div className="map-bottom">
            <span>
              {selected ? (
                <>
                  <b>{ui(selected.id)}</b>
                  {ui("온도")}
                  {ui(selected.temperature.toFixed(1))}
                  {ui("°C · 진동")}
                  {ui(selected.vibration.toFixed(1))} mm/s
                </>
              ) : (
                <>
                  <span className="live-dot" />
                  {ui("설비를 선택해 상세 상태를 확인하세요.")}
                </>
              )}
            </span>
            <button className="text-button" onClick={() => go("twin")}>
              {ui("상세 관제")}
              <ArrowRight size={13} />
            </button>
          </div>
        </section>
        <section className="panel intelligence-panel">
          <div className="panel-header">
            <div>
              <h2>
                <span className="ai-icon">
                  <Sparkles size={16} />
                </span>
                {ui("운영 진단 및 조치")}
              </h2>
              <p>
                {ui("이상 징후와 개선 제안을 근거 데이터와 함께 검토합니다.")}
              </p>
            </div>
            <span className="label blue-label">RULE ENGINE</span>
          </div>
          <div className="insight-summary">
            <span>{ui("지금 확인할 인사이트")}</span>
            <strong>
              {ui(k.pending)}
              <small>{ui("건의 승인 대기")}</small>
            </strong>
            <div className="insight-progress">
              <i style={{ width: `${Math.min(k.pending * 25, 100)}%` }} />
            </div>
          </div>
          {data.alerts.length ? (
            <div className="insight-item">
              <div className="insight-item-top">
                <span className="warning-tag">{ui("설비 이상 감지")}</span>
                <span>{ui("운영 임계값")}</span>
              </div>
              <h3>{ui(data.alerts[0].name)}</h3>
              <p>{ui(data.alerts[0].message)}</p>
              <div className="recommendation-mini">
                <Zap size={15} />
                <span>{ui("예방 점검 작업 생성 권장")}</span>
              </div>
              <button className="btn primary wide" onClick={() => go("agent")}>
                {ui("제안 검토하기")}
                <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <div className="all-clear">
              <ShieldCheck size={34} />
              <h3>{ui("확인할 알림이 없습니다.")}</h3>
              <p>{ui("엣지 데이터의 임계값을 감시하고 있습니다.")}</p>
            </div>
          )}
          <div className="insight-foot">
            <ShieldCheck size={13} />
            {ui("작업 생성은 담당자 승인 후 진행됩니다.")}
          </div>
        </section>
      </div>
      <div className="overview-bottom">
        <section className="panel production-panel">
          <div className="panel-header">
            <div>
              <h2>{ui("생산 실적 추이")}</h2>
              <p>{ui("수집 구간별 양품 생산량과 실적 변화를 확인합니다.")}</p>
            </div>
            <span className="label neutral">LIVE DATA</span>
          </div>
          <Chart series={data.series} />
        </section>
        <section className="panel line-panel">
          <div className="panel-header">
            <div>
              <h2>{ui("라인 성과 요약")}</h2>
              <p>{ui("라인별 생산량, 가동 설비 및 이상 상태를 비교합니다.")}</p>
            </div>
            <button className="text-button" onClick={() => go("orders")}>
              {ui("생산 관리")}
              <ChevronRight size={14} />
            </button>
          </div>
          {ui(
            ["A", "B"].map((line) => {
              const assets = data.assets.filter((a) => a.line === line);
              const warn = assets.filter((a) => a.status === "warning").length;
              return (
                <div className="line-row" key={line}>
                  <span className={`line-symbol ${line === "B" ? "teal" : ""}`}>
                    {ui(line)}
                  </span>
                  <div className="line-detail">
                    <strong>{ui(lineLabel(line))}</strong>
                    <small>
                      {ui(assets.length)}
                      {ui("개 설비 ·")}
                      {ui(lineLabel(line))}
                    </small>
                  </div>
                  <div className="line-count">
                    <strong>
                      {ui(num(assets.reduce((s, a) => s + a.produced, 0)))}
                      <small> ea</small>
                    </strong>
                    <span className={warn ? "text-amber" : "text-teal"}>
                      {ui(warn ? `${warn}대 주의` : "정상 가동")}
                    </span>
                  </div>
                </div>
              );
            }),
          )}
          <button className="connection-note" onClick={() => go("edge")}>
            <Network size={17} />
            <span>
              <b>{ui(num(k.events))}</b>
              {ui("개 이벤트 수집 완료")}
            </span>
            <ArrowUpRight size={15} />
          </button>
        </section>
      </div>
      <div className="journey">
        <div>
          <GitBranch size={18} />
          <b>{ui("하나로 이어지는 제조 전주기")}</b>
        </div>
        {[
          { p: "edge" as Page, n: "데이터 연결" },
          { p: "twin" as Page, n: "디지털 가시화" },
          { p: "simulator" as Page, n: "시나리오 검증" },
          { p: "ai" as Page, n: "AI 분석" },
          { p: "robot" as Page, n: "실행 · 최적화" },
        ].map((s, i) => (
          <React.Fragment key={s.p}>
            <button onClick={() => go(s.p)}>
              <span>0{ui(i + 1)}</span>
              {ui(s.n)}
            </button>
            {i < 4 && <ChevronRight size={13} />}
          </React.Fragment>
        ))}
      </div>
    </>
  );
}
function Metric({
  icon: Icon,
  title,
  value,
  unit,
  note,
  accent,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  unit: string;
  note: string;
  accent: string;
}) {
  return (
    <div className={`metric ${accent}`}>
      <div className="metric-top">
        <span>{ui(title)}</span>
        <span className="metric-icon">
          <Icon size={17} />
        </span>
      </div>
      <div className="metric-value">
        {ui(value)}
        <span>{ui(unit)}</span>
      </div>
      <div className="metric-note">
        <i />
        {ui(note)}
      </div>
    </div>
  );
}
function TwinPage({ data, query }: { data: Overview; query: string }) {
  const [selected, setSelected] = useState(
    data.assets.find((a) => a.id === query) || data.assets[0],
  );
  const a = data.assets.find((a) => a.id === selected?.id) || data.assets[0];
  return (
    <>
      <SectionTitle
        eyebrow="DIGITAL TWIN"
        title={ui("현장과 연결된 설비 운영 맵")}
        description={ui(
          "공간 위에서 설비를 선택하고, 현재 상태와 운전 데이터를 확인하세요.",
        )}
        action={
          <span className="label neutral">
            {ui("2D 설비 트윈 · 물리 시뮬레이션 미포함")}
          </span>
        }
      />
      <div className="twin-layout">
        <section className="panel">
          <div className="panel-header">
            <h2>{ui("라면 1공장 · 생산동 1F")}</h2>
            <span className="live-label">
              <i />
              LIVE
            </span>
          </div>
          <FactoryMap
            assets={data.assets}
            onSelect={setSelected}
            selected={a?.id}
            large
          />
          <div className="map-key">
            <span>
              <i className="legend teal" />
              {ui("정상 가동")}
            </span>
            <span>
              <i className="legend amber" />
              {ui("주의 설비")}
            </span>
            <span>{ui("설비 상태는 수집 이벤트로 갱신됩니다.")}</span>
          </div>
        </section>
        {a && (
          <section className="panel asset-detail">
            <div className="asset-detail-icon">
              <Factory size={30} />
            </div>
            <span className="subtle-label">ASSET DETAILS</span>
            <h2>{ui(a.name)}</h2>
            <div className="asset-id">
              {ui(a.id)}
              <Status value={a.status} />
            </div>
            <div className="asset-reading">
              <span>{ui("현재 온도")}</span>
              <strong className={a.temperature > 75 ? "text-amber" : ""}>
                {ui(a.temperature.toFixed(1))}
                <small>°C</small>
              </strong>
              <div className="reading-bar">
                <i
                  className={a.temperature > 75 ? "amber" : ""}
                  style={{ width: `${Math.min(a.temperature, 100)}%` }}
                />
              </div>
              <small>{ui("운영 임계값 75°C")}</small>
            </div>
            <div className="asset-reading">
              <span>{ui("진동 속도")}</span>
              <strong>
                {ui(a.vibration.toFixed(2))}
                <small>mm/s</small>
              </strong>
              <div className="reading-bar">
                <i
                  style={{
                    width: `${Math.min((a.vibration / 5) * 100, 100)}%`,
                  }}
                />
              </div>
              <small>{ui("운영 임계값 3.5 mm/s")}</small>
            </div>
            <dl>
              <div>
                <dt>{ui("생산 라인")}</dt>
                <dd>
                  {ui(a.line)}
                  {ui("라인")}
                </dd>
              </div>
              <div>
                <dt>{ui("설정 주기")}</dt>
                <dd>{ui(a.cycle_time)}s</dd>
              </div>
              <div>
                <dt>{ui("누적 양품")}</dt>
                <dd>{ui(num(a.produced))} ea</dd>
              </div>
              <div>
                <dt>{ui("마지막 수집")}</dt>
                <dd>{ui(date(a.updated_at))}</dd>
              </div>
            </dl>
          </section>
        )}
      </div>
    </>
  );
}
function EdgePage({
  revision,
  write,
  admin,
  busy,
  action,
  open,
  events,
  demo,
}: {
  revision: number;
  write: boolean;
  admin: boolean;
  busy: boolean;
  action: Action;
  open: () => void;
  events: number;
  demo: boolean;
}) {
  const { rows, error } = useResources("connector", revision);
  return (
    <>
      <SectionTitle
        eyebrow="EDGE CONNECT"
        title={ui("현장의 데이터를 연결하세요.")}
        description={ui(
          "수집 게이트웨이와 기업 시스템의 연결 설정을 관리합니다.",
        )}
        action={
          <button className="btn primary" disabled={!admin} onClick={open}>
            <Plus size={16} />
            {ui("커넥터 추가")}
          </button>
        }
      />
      <LoadError message={error} />
      <div className="three-metrics">
        <Metric
          icon={Radio}
          title={ui("연결된 커넥터")}
          value={String(rows.filter((r) => r.status === "connected").length)}
          unit="개"
          note="REST 데모 게이트웨이"
          accent="blue"
        />
        <Metric
          icon={Database}
          title={ui("누적 수집 이벤트")}
          value={num(events)}
          unit="건"
          note="source + event_id로 중복 방지"
          accent="teal"
        />
        <Metric
          icon={ShieldCheck}
          title={ui("수집 데이터 검증")}
          value="ON"
          unit=""
          note="온도·진동·시간·설비 ID 검증"
          accent="violet"
        />
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{ui("커넥터 목록")}</h2>
            <p>{ui("설정 저장과 실제 연결 상태를 구분하여 표시합니다.")}</p>
          </div>
          {demo && (
            <button
              className="btn"
              disabled={!write || busy}
              onClick={() =>
                action(
                  "/demo/tick",
                  {},
                  "8개 설비의 샘플 데이터를 수집했습니다.",
                )
              }
            >
              <RefreshCw size={15} />
              {ui("샘플 데이터 수집")}
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{ui("커넥터")}</th>
                <th>{ui("프로토콜")}</th>
                <th>{ui("엔드포인트")}</th>
                <th>{ui("상태")}</th>
                <th>{ui("최근 수집")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="table-name">
                      <Radio size={17} />
                      <span>
                        <b>{ui(r.name)}</b>
                        <small>{ui(r.id)}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="code-tag">{ui(r.protocol)}</span>
                  </td>
                  <td className="mono small">{ui(r.endpoint)}</td>
                  <td>
                    <Status value={r.status} />
                  </td>
                  <td>{ui(r.last_seen ? date(r.last_seen) : "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="info-banner">
        <Network size={18} />
        <div>
          <strong>{ui("연동 인터페이스")}</strong>
          <p>
            {ui(
              "REST 수집 API가 동작합니다. MQTT·OPC-UA·Modbus는 구성 정보를 저장하며, 현장별 드라이버는 별도 구현 범위입니다.",
            )}
          </p>
          <code>POST /api/telemetry/batch</code>
        </div>
      </div>
    </>
  );
}
type Action = (
  path: string,
  body: unknown,
  message: string,
) => Promise<Resource | undefined>;
function DataPage({
  data,
  file,
  revision,
}: {
  data: Overview;
  file: (p: string, n: string) => void;
  revision: number;
}) {
  const [events, setEvents] = useState<Resource[]>([]);
  const [asset, setAsset] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api<Resource[]>(`/telemetry?limit=100${asset ? "&asset_id=" + asset : ""}`)
      .then(setEvents)
      .catch((e) => setError(e.message));
  }, [asset, revision, data.server_time]);
  return (
    <>
      <SectionTitle
        eyebrow="DATA HUB"
        title={ui("신뢰할 수 있는 제조 데이터")}
        description={ui(
          "표준화된 설비 이벤트를 탐색하고 분석용 데이터를 내려받으세요.",
        )}
        action={
          <button
            className="btn"
            onClick={() => file("/telemetry/export", "forge-telemetry.csv")}
          >
            <ArrowDownToLine size={16} />
            {ui("CSV 내보내기")}
          </button>
        }
      />
      <div className="data-pipeline">
        <div>
          <Radio />
          <b>{ui("수집")}</b>
          <span>REST Gateway</span>
        </div>
        <ArrowRight />
        <div>
          <ShieldCheck />
          <b>{ui("검증 · 중복 제거")}</b>
          <span>Typed schema + Event ID</span>
        </div>
        <ArrowRight />
        <div>
          <Database />
          <b>{ui("통합 저장")}</b>
          <span>{ui("관계형 데이터베이스")}</span>
        </div>
        <ArrowRight />
        <div>
          <GitBranch />
          <b>{ui("설비 맥락 연결")}</b>
          <span>{ui("공장 → 라인 → 설비")}</span>
        </div>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>
              {ui("설비 이벤트 탐색기")}
              <span className="label neutral">{ui("최근 100건")}</span>
            </h2>
            <p>
              {ui(num(data.kpis.events))}
              {ui("개 누적 이벤트 · 지연 이벤트는 이력에 보존")}
            </p>
          </div>
          <select
            aria-label={ui("이벤트 설비 필터")}
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
          >
            <option value="">{ui("전체 설비")}</option>
            {data.assets.map((a) => (
              <option key={a.id}>{ui(a.id)}</option>
            ))}
          </select>
        </div>
        <LoadError message={error} />
        <div className="table-wrap max-height">
          <table>
            <thead>
              <tr>
                <th>{ui("수집 시각")}</th>
                <th>{ui("설비 ID")}</th>
                <th>{ui("소스")}</th>
                <th>{ui("온도")}</th>
                <th>{ui("진동")}</th>
                <th>{ui("양품 / 불량")}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="mono small">{ui(date(e.timestamp))}</td>
                  <td>
                    <span className="asset-link">{ui(e.asset_id)}</span>
                  </td>
                  <td>
                    <span className="code-tag">{ui(e.source)}</span>
                  </td>
                  <td className={e.temperature > 75 ? "text-amber" : ""}>
                    {ui(e.temperature.toFixed(1))} °C
                  </td>
                  <td>{ui(e.vibration.toFixed(2))} mm/s</td>
                  <td>
                    {ui(e.good)}{" "}
                    <span className="muted">/ {ui(e.rejected)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!events.length && (
            <Empty
              title={ui("표시할 이벤트가 없습니다")}
              description={ui(
                "설비 필터를 변경하거나 엣지에서 데이터를 수집하세요.",
              )}
            />
          )}
        </div>
      </section>
    </>
  );
}
function SimulatorPage({
  write,
  busy,
  action,
  revision,
}: {
  write: boolean;
  busy: boolean;
  action: Action;
  revision: number;
}) {
  const [reduction, setReduction] = useState(15);
  const [downtime, setDowntime] = useState(5);
  const [defect, setDefect] = useState(1.5);
  const [line, setLine] = useState("A");
  const [hours, setHours] = useState(8);
  const [result, setResult] = useState<Resource | null>(null);
  const { rows, error } = useResources("simulation", revision);
  const r = result || rows[0];
  return (
    <>
      <SectionTitle
        eyebrow="PROCESS SIMULATOR"
        title={ui("실행 전에, 더 나은 선택을 검증하세요.")}
        description={ui(
          "라인의 병목 주기와 운영 조건으로 생산량 변화를 비교합니다.",
        )}
        action={
          <span className="label neutral">{ui("결정론적 용량 모델 v1")}</span>
        }
      />
      <div className="simulation-layout">
        <section className="panel simulation-controls">
          <div className="panel-header">
            <div>
              <h2>{ui("What-if 시나리오")}</h2>
              <p>{ui("변수를 바꾸고 운영 결과를 비교하세요.")}</p>
            </div>
            <Workflow size={20} />
          </div>
          <div className="form-body">
            <label>
              {ui("생산 라인")}
              <select value={line} onChange={(e) => setLine(e.target.value)}>
                <option value="A">{ui(lineLabel("A"))}</option>
                <option value="B">{ui(lineLabel("B"))}</option>
              </select>
            </label>
            <label>
              {ui("가동 시간")}
              <select
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
              >
                {[4, 8, 12, 24].map((v) => (
                  <option key={v} value={v}>
                    {ui(v)}
                    {ui("시간")}
                  </option>
                ))}
              </select>
            </label>
            <Range
              label={ui("병목 주기 단축")}
              value={reduction}
              onChange={setReduction}
              max={40}
              unit="%"
            />
            <Range
              label={ui("예상 비가동 비율")}
              value={downtime}
              onChange={setDowntime}
              max={40}
              unit="%"
            />
            <Range
              label={ui("예상 불량률")}
              value={defect}
              onChange={setDefect}
              max={20}
              step={0.5}
              unit="%"
            />
            <button
              className="btn primary wide"
              disabled={!write || busy}
              onClick={async () => {
                const response = await action(
                  "/simulations",
                  {
                    name: `${line} 라인 · 주기 ${reduction}% 단축`,
                    line,
                    cycle_reduction: reduction,
                    downtime,
                    hours,
                    defect_rate: defect,
                  },
                  "시나리오 계산을 완료했습니다.",
                );
                if (response) setResult(response);
              }}
            >
              <Play size={15} />
              {ui(busy ? "계산 중…" : "시나리오 실행")}
            </button>
          </div>
        </section>
        <section className="panel simulation-result">
          <div className="panel-header">
            <div>
              <h2>{ui("시나리오 비교 결과")}</h2>
              <p>
                {ui(
                  r
                    ? `${r.name} · ${r.hours}시간 기준`
                    : "시나리오를 실행하면 결과가 표시됩니다.",
                )}
              </p>
            </div>
            {r && <Status value="completed" />}
          </div>
          {r ? (
            <>
              <div className="result-hero">
                <span>{ui("기준 대비 예상 생산량 변화")}</span>
                <strong className={r.improvement < 0 ? "text-amber" : ""}>
                  {r.improvement > 0 ? "+" : ""}
                  {ui(r.improvement)}
                  <small>%</small>
                </strong>
                <p>
                  {ui("병목 설비")}
                  <b>{ui(r.bottleneck)}</b>
                  {ui("· 시뮬레이션 추정치")}
                </p>
              </div>
              <div className="comparison-bars">
                {[
                  {
                    title: "기준 시나리오",
                    value: r.baseline,
                    fill: "baseline",
                  },
                  {
                    title: "변경 시나리오",
                    value: r.optimized,
                    fill: "optimized",
                  },
                ].map((b) => (
                  <div key={b.title}>
                    <div>
                      <span>{ui(b.title)}</span>
                      <b>
                        {ui(num(b.value))} <small>ea</small>
                      </b>
                    </div>
                    <div className="compare-track">
                      <i
                        className={b.fill}
                        style={{
                          width: `${(b.value / Math.max(r.baseline, r.optimized)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="result-details">
                <span>
                  {ui("병목 주기")}
                  <b>
                    {ui(r.baseline_cycle)}s → {ui(r.optimized_cycle)}s
                  </b>
                </span>
                <span>
                  {ui("실행 라인")}
                  <b>{ui(r.line)} LINE</b>
                </span>
                <span>
                  {ui("검증 모델")}
                  <b>Capacity v1</b>
                </span>
              </div>
              <div className="model-note">
                {ui(r.assumptions)}
                {ui(". 실제 현장 성능을 보장하지 않습니다.")}
              </div>
            </>
          ) : (
            <Empty
              title={ui("첫 번째 시나리오를 실행하세요")}
              description={ui(
                "현재 조건과 변경 조건을 비교해 개선 가능성을 살펴보세요.",
              )}
            />
          )}
        </section>
      </div>
      <section className="panel">
        <div className="panel-header">
          <h2>{ui("실험 이력")}</h2>
          <span className="label neutral">
            {ui(rows.length)}
            {ui("개 실험")}
          </span>
        </div>
        <LoadError message={error} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{ui("시나리오")}</th>
                <th>{ui("라인")}</th>
                <th>{ui("기준 생산량")}</th>
                <th>{ui("변경 생산량")}</th>
                <th>{ui("변화율")}</th>
                <th>{ui("실행 시각")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  className="clickable"
                  key={s.id}
                  onClick={() => setResult(s)}
                >
                  <td>
                    <b>{ui(s.name)}</b>
                  </td>
                  <td>{ui(s.line)}</td>
                  <td>{ui(num(s.baseline))} ea</td>
                  <td>{ui(num(s.optimized))} ea</td>
                  <td
                    className={s.improvement >= 0 ? "text-teal" : "text-amber"}
                  >
                    {s.improvement > 0 ? "+" : ""}
                    {ui(s.improvement)}%
                  </td>
                  <td>{ui(date(s.created_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <Empty
              title={ui("아직 실행한 실험이 없습니다")}
              description={ui(
                "실험 결과는 서버에 저장되어 다음 세션에서도 확인할 수 있습니다.",
              )}
            />
          )}
        </div>
      </section>
    </>
  );
}
function Range({
  label,
  value,
  onChange,
  max,
  unit,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max: number;
  unit: string;
  step?: number;
}) {
  return (
    <label className="range-label">
      <span>
        {ui(label)}
        <b>
          {ui(value)}
          <small>{ui(unit)}</small>
        </b>
      </span>
      <input
        type="range"
        min="0"
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="range-ticks">
        <small>0{ui(unit)}</small>
        <small>
          {ui(max)}
          {ui(unit)}
        </small>
      </span>
    </label>
  );
}
function AIPage({
  data,
  write,
  admin,
  busy,
  action,
  revision,
  toast,
}: {
  data: Overview;
  write: boolean;
  admin: boolean;
  busy: boolean;
  action: Action;
  revision: number;
  toast: (m: string, e?: boolean) => void;
}) {
  const { rows, error } = useResources("model", revision);
  const [asset, setAsset] = useState("NDL-STEAM");
  const [metric, setMetric] = useState("temperature");
  const [inferences, setInferences] = useState<Record<string, Resource>>({});
  return (
    <>
      <SectionTitle
        eyebrow="AI MODEL HUB"
        title={ui("현장 데이터를 운영 인텔리전스로.")}
        description={ui(
          "설비별 통계 모델을 학습하고, 배포한 모델로 현재 이상 여부를 확인합니다.",
        )}
      />
      <div className="info-banner">
        <Cpu size={19} />
        <div>
          <strong>{ui("Gaussian z-score 이상감지")}</strong>
          <p>
            {ui(
              "최근 최대 500개 이벤트를 시간순으로 80:20 분할합니다. 학습 평균·표준편차 대비 3σ 초과를 이상으로 판정합니다. 라벨 기반 정확도 또는 고장 예측 모델이 아닙니다.",
            )}
          </p>
        </div>
      </div>
      <section className="panel training-panel">
        <div>
          <span className="subtle-label">NEW EXPERIMENT</span>
          <h2>{ui("새 이상감지 모델 학습")}</h2>
          <p>{ui("최소 20개 이벤트가 필요합니다.")}</p>
        </div>
        <label>
          {ui("대상 설비")}
          <select value={asset} onChange={(e) => setAsset(e.target.value)}>
            {data.assets.map((a) => (
              <option key={a.id}>{ui(a.id)}</option>
            ))}
          </select>
        </label>
        <label>
          {ui("분석 지표")}
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            <option value="temperature">{ui("온도 (°C)")}</option>
            <option value="vibration">{ui("진동 (mm/s)")}</option>
          </select>
        </label>
        <button
          className="btn primary"
          disabled={!write || busy}
          onClick={() =>
            action(
              "/models/train",
              {
                name: `${asset} · ${metric === "temperature" ? "온도" : "진동"} 이상감지`,
                asset_id: asset,
                metric,
              },
              "통계 모델 학습을 완료했습니다.",
            )
          }
        >
          <Play size={15} />
          {ui("모델 학습")}
        </button>
      </section>
      <LoadError message={error} />
      <div className="model-grid">
        {rows.map((m) => (
          <section className="panel model-card" key={m.id}>
            <div className="model-card-head">
              <span className="model-symbol">
                <Cpu size={24} />
              </span>
              <Status value={m.status} />
            </div>
            <h2>{ui(m.name)}</h2>
            <p>
              {ui(m.algorithm)} · {ui(m.version)}
            </p>
            <dl>
              <div>
                <dt>{ui("학습 / 검증 데이터")}</dt>
                <dd>
                  {ui(m.train_samples)} / {ui(m.holdout_samples)}
                  {ui("건")}
                </dd>
              </div>
              <div>
                <dt>{ui("학습 평균 / 표준편차")}</dt>
                <dd>
                  {ui(m.mean.toFixed(2))} / {ui(m.std.toFixed(2))}
                </dd>
              </div>
              <div>
                <dt>{ui("검증 구간 이상 비율")}</dt>
                <dd>{ui(m.holdout_anomaly_rate)}%</dd>
              </div>
              <div>
                <dt>{ui("데이터 출처")}</dt>
                <dd>
                  {ui(
                    m.data_source === "synthetic"
                      ? "가상 설비 데이터"
                      : "수집 이벤트",
                  )}
                </dd>
              </div>
            </dl>
            {inferences[m.id] && (
              <div
                className={`inference-result ${inferences[m.id].anomaly ? "anomaly" : ""}`}
              >
                <b>
                  {ui(inferences[m.id].anomaly ? "이상 감지" : "정상 범위")}
                </b>
                <span>
                  {ui("현재값")}
                  {ui(inferences[m.id].value)} · z=
                  {ui(inferences[m.id].z_score)}
                </span>
              </div>
            )}
            <div className="model-actions">
              {m.status === "trained" ? (
                <button
                  className="btn primary wide"
                  disabled={!admin || busy}
                  onClick={() =>
                    action(
                      `/models/${m.id}/deploy`,
                      {},
                      "모델을 배포했습니다. 동일 설비·지표의 이전 모델은 보관됩니다.",
                    )
                  }
                >
                  <Zap size={15} />
                  {ui("모델 배포")}
                </button>
              ) : m.status === "deployed" ? (
                <button
                  className="btn wide"
                  onClick={async () => {
                    try {
                      const r = await api<Resource>(
                        `/models/${m.id}/inference`,
                      );
                      setInferences((p) => ({ ...p, [m.id]: r }));
                    } catch (e) {
                      toast((e as Error).message, true);
                    }
                  }}
                >
                  <Activity size={15} />
                  {ui("현재 데이터 추론")}
                </button>
              ) : (
                <span className="muted small">
                  {ui("새 버전 배포로 보관된 모델")}
                </span>
              )}
            </div>
          </section>
        ))}
      </div>
      {!rows.length && (
        <section className="panel">
          <Empty
            title={ui("운영을 이해하는 첫 모델을 만들어보세요.")}
            description={ui("설비와 지표를 선택하고 모델 학습을 시작하세요.")}
          />
        </section>
      )}
    </>
  );
}
function AgentPage({
  admin,
  write,
  busy,
  action,
  revision,
}: {
  admin: boolean;
  write: boolean;
  busy: boolean;
  action: Action;
  revision: number;
}) {
  const rec = useResources("recommendation", revision);
  const alerts = useResources("alert", revision);
  const maintenance = useResources("maintenance", revision);
  return (
    <>
      <SectionTitle
        eyebrow="AGENTIC OPERATIONS"
        title={ui("인사이트를 안전한 실행으로.")}
        description={ui(
          "규칙 엔진이 제안하고, 담당자가 검토한 뒤 점검 작업을 생성합니다.",
        )}
        action={
          <span className="label blue-label">
            <ShieldCheck size={13} />
            Human in the loop
          </span>
        }
      />
      <div className="agent-steps">
        <div>
          <span>01</span>
          <div>
            <b>{ui("현장 이벤트 감지")}</b>
            <small>{ui("온도·진동 임계값 분석")}</small>
          </div>
        </div>
        <ArrowRight />
        <div>
          <span>02</span>
          <div>
            <b>{ui("규칙 기반 작업 제안")}</b>
            <small>{ui("근거와 실행 내용 명시")}</small>
          </div>
        </div>
        <ArrowRight />
        <div>
          <span>03</span>
          <div>
            <b>{ui("관리자 승인")}</b>
            <small>{ui("권한 검사 · 이중 처리 방지")}</small>
          </div>
        </div>
        <ArrowRight />
        <div>
          <span>04</span>
          <div>
            <b>{ui("점검 작업 생성")}</b>
            <small>{ui("감사로그에 처리 이력 저장")}</small>
          </div>
        </div>
      </div>
      <LoadError message={rec.error || alerts.error || maintenance.error} />
      <div className="agent-layout">
        <section>
          <div className="section-inline">
            <h2>{ui("운영 제안")}</h2>
            <span className="label neutral">
              {ui(rec.rows.filter((r) => r.status === "pending").length)}
              {ui("개 승인 대기")}
            </span>
          </div>
          {rec.rows.map((r) => (
            <article className="panel recommendation-card" key={r.id}>
              <div className="rec-header">
                <span className="ai-icon">
                  <Sparkles size={19} />
                </span>
                <Status value={r.status} />
              </div>
              <h2>{ui(r.name)}</h2>
              <p>{ui(r.reason)}</p>
              <div className="rec-evidence">
                <span>
                  {ui("판단 엔진")}
                  <b>{ui(r.engine)}</b>
                </span>
                <span>
                  {ui("대상 설비")}
                  <b>{ui(r.asset_id)}</b>
                </span>
                <span>
                  {ui("실행 내용")}
                  <b>{ui(r.impact)}</b>
                </span>
              </div>
              {r.status === "pending" ? (
                <div className="rec-actions">
                  <span>
                    <ShieldCheck size={14} />
                    {ui(
                      admin
                        ? "승인 시 점검 작업이 생성됩니다."
                        : "관리자만 승인할 수 있습니다.",
                    )}
                  </span>
                  <button
                    className="btn"
                    disabled={!admin || busy}
                    onClick={() =>
                      action(
                        `/recommendations/${r.id}/decision`,
                        { decision: "reject" },
                        "제안을 반려했습니다.",
                      )
                    }
                  >
                    {ui("반려")}
                  </button>
                  <button
                    className="btn primary"
                    disabled={!admin || busy}
                    onClick={() =>
                      action(
                        `/recommendations/${r.id}/decision`,
                        { decision: "approve" },
                        "제안을 승인하고 점검 작업을 생성했습니다.",
                      )
                    }
                  >
                    <CheckCheck size={15} />
                    {ui("승인 및 작업 생성")}
                  </button>
                </div>
              ) : (
                <div className="decided-note">
                  <Check size={14} />
                  {ui(r.decided_by)} · {ui(r.decided_at && date(r.decided_at))}
                  {ui(r.task_id && ` · ${r.task_id}`)}
                </div>
              )}
            </article>
          ))}
          {!rec.rows.length && (
            <section className="panel">
              <Empty
                title={ui("검토할 제안이 없습니다")}
                description={ui(
                  "설비에서 이상 이벤트가 발생하면 규칙 기반 제안이 생성됩니다.",
                )}
              />
            </section>
          )}
          <section className="panel">
            <div className="panel-header">
              <h2>{ui("예방 점검 작업")}</h2>
              <span className="label neutral">
                {ui(maintenance.rows.length)}
                {ui("건")}
              </span>
            </div>
            {maintenance.rows.length ? (
              maintenance.rows.map((t) => (
                <div className="maintenance-row" key={t.id}>
                  <ShieldCheck size={18} />
                  <div>
                    <b>{ui(t.name)}</b>
                    <small>{ui(t.id)}</small>
                  </div>
                  <Status value={t.status} />
                </div>
              ))
            ) : (
              <Empty
                title={ui("등록된 점검 작업이 없습니다")}
                description={ui(
                  "운영 제안을 승인하면 이곳에 작업이 생성됩니다.",
                )}
              />
            )}
          </section>
        </section>
        <section className="panel alert-list">
          <div className="panel-header">
            <h2>{ui("이벤트 알림")}</h2>
            <Bell size={17} />
          </div>
          {alerts.rows.map((a) => (
            <div className="alert-item" key={a.id}>
              <div>
                <span className="warning-tag">{ui(a.asset_id)}</span>
                <small>{ui(date(a.created_at))}</small>
              </div>
              <h3>{ui(a.name)}</h3>
              <p>{ui(a.message)}</p>
              {a.status === "open" ? (
                <button
                  className="text-button"
                  disabled={!write || busy}
                  onClick={() =>
                    action(
                      `/alerts/${a.id}/ack`,
                      {},
                      "알림을 확인 처리했습니다.",
                    )
                  }
                >
                  <Check size={14} />
                  {ui("알림 확인")}
                </button>
              ) : (
                <Status value={a.status} />
              )}
            </div>
          ))}
        </section>
      </div>
      <div className="info-banner">
        <Sparkles size={18} />
        <p>
          {ui(
            "MVP는 설명 가능한 규칙 엔진으로 동작합니다. LLM·MCP 에이전트와 설비 자동 제어는 연결되어 있지 않습니다.",
          )}
        </p>
      </div>
    </>
  );
}
function RobotPage({
  write,
  busy,
  action,
  revision,
  demo,
}: {
  write: boolean;
  busy: boolean;
  action: Action;
  revision: number;
  demo: boolean;
}) {
  const robots = useResources("robot", revision);
  const jobs = useResources("job", revision);
  const [robot, setRobot] = useState("AMR-001");
  const [destination, setDestination] = useState("제면 A라인");
  return (
    <>
      <SectionTitle
        eyebrow="ROBOT ORCHESTRATION"
        title={ui("물류의 흐름까지, 하나의 운영으로.")}
        description={ui(
          "가상 AMR에 운반 작업을 배정하고 작업 상태를 관리합니다.",
        )}
        action={<span className="label neutral">VIRTUAL ROBOTS ONLY</span>}
      />
      <LoadError message={robots.error || jobs.error} />
      <div className="robot-grid">
        {robots.rows.map((r) => (
          <section className="panel robot-card" key={r.id}>
            <div className="robot-card-top">
              <span className="robot-drawing">
                <Truck size={42} />
              </span>
              <Status value={r.status} />
            </div>
            <h2>{ui(r.name)}</h2>
            <p>Virtual AMR · {ui(r.location)}</p>
            <div className="battery">
              <span>
                {ui("배터리")}
                <b>{ui(r.battery)}%</b>
              </span>
              <div>
                <i style={{ width: `${r.battery}%` }} />
              </div>
            </div>
            <div className="robot-stats">
              <span>
                {ui("누적 완료 작업")}
                <b>
                  {ui(r.jobs)}
                  {ui("회")}
                </b>
              </span>
              <span>
                {ui("제어 모드")}
                <b>{ui("가상 실행")}</b>
              </span>
            </div>
          </section>
        ))}
      </div>
      <section className="panel dispatch-form">
        <div>
          <span className="subtle-label">NEW TRANSPORT TASK</span>
          <h2>{ui("운반 작업 배정")}</h2>
        </div>
        <label>
          {ui("대상 로봇")}
          <select value={robot} onChange={(e) => setRobot(e.target.value)}>
            {robots.rows.map((r) => (
              <option key={r.id}>{ui(r.name)}</option>
            ))}
          </select>
        </label>
        <label>
          {ui("목적지")}
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          >
            {["자재 창고", "제면 A라인", "스프 B라인", "출하 구역"].map((d) => (
              <option key={d}>{ui(d)}</option>
            ))}
          </select>
        </label>
        <button
          className="btn primary"
          disabled={!demo || !write || busy || !robots.rows.length}
          onClick={() =>
            action(
              "/robot-jobs",
              { robot_id: robot, destination },
              "가상 운반 작업을 배정했습니다.",
            )
          }
        >
          <Play size={15} />
          {ui("가상 작업 실행")}
        </button>
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>{ui("운반 작업 이력")}</h2>
          <span className="label neutral">
            {ui(jobs.rows.length)}
            {ui("건")}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{ui("작업")}</th>
                <th>{ui("로봇")}</th>
                <th>{ui("목적지")}</th>
                <th>{ui("상태")}</th>
                <th>{ui("작업 관리")}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.rows.map((j) => (
                <tr key={j.id}>
                  <td>
                    <b>{ui(j.id)}</b>
                    <small className="block muted">
                      {ui(date(j.created_at))}
                    </small>
                  </td>
                  <td>{ui(j.robot_id)}</td>
                  <td>{ui(j.destination)}</td>
                  <td>
                    <Status value={j.status} />
                  </td>
                  <td>
                    {j.status === "running" ? (
                      <button
                        className="btn small-btn"
                        disabled={!write || busy}
                        onClick={() =>
                          action(
                            `/robot-jobs/${j.id}/complete`,
                            {},
                            "운반 작업을 완료했습니다. 로봇 상태가 갱신되었습니다.",
                          )
                        }
                      >
                        <Check size={13} />
                        {ui("가상 완료 처리")}
                      </button>
                    ) : (
                      <span className="text-teal small">{ui("작업 완료")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!jobs.rows.length && (
            <Empty
              title={ui("아직 배정된 운반 작업이 없습니다")}
              description={ui(
                "대기 중인 로봇을 선택해 가상 작업을 실행하세요.",
              )}
            />
          )}
        </div>
      </section>
    </>
  );
}
function PhysicalPage({
  write,
  busy,
  action,
  revision,
  file,
  go,
}: {
  write: boolean;
  busy: boolean;
  action: Action;
  revision: number;
  file: (p: string, n: string) => void;
  go: (p: Page) => void;
}) {
  const simulations = useResources("simulation", revision);
  const datasets = useResources("dataset", revision);
  const [sim, setSim] = useState("");
  const [samples, setSamples] = useState(200);
  return (
    <>
      <SectionTitle
        eyebrow="PHYSICAL AI LAB"
        title={ui("가상 실험을 학습의 재료로.")}
        description={ui(
          "시나리오 조건을 기반으로 합성 운전 데이터를 생성하고 내려받습니다.",
        )}
        action={<span className="label neutral">PARAMETRIC DATA SANDBOX</span>}
      />
      <div className="info-banner">
        <FlaskConical size={20} />
        <div>
          <strong>{ui("Physical AI 확장을 위한 데이터 준비 단계")}</strong>
          <p>
            {ui(
              "주기·온도·진동의 합성 표 데이터를 생성합니다. 물리 엔진, 카메라 이미지, 강화학습, 로봇 정책 학습은 MVP에 포함되지 않습니다.",
            )}
          </p>
        </div>
      </div>
      <LoadError message={simulations.error || datasets.error} />
      <section className="panel dataset-form">
        <div>
          <span className="subtle-label">SYNTHETIC DATA GENERATION</span>
          <h2>{ui("합성 운전 데이터 생성")}</h2>
          <p>{ui("실행한 시뮬레이션 결과를 선택하세요.")}</p>
        </div>
        {simulations.rows.length ? (
          <>
            <label>
              {ui("기반 시나리오")}
              <select
                value={sim || simulations.rows[0]?.id}
                onChange={(e) => setSim(e.target.value)}
              >
                {simulations.rows.map((s) => (
                  <option value={s.id} key={s.id}>
                    {ui(s.name)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {ui("샘플 수")}
              <input
                type="number"
                min="10"
                max="2000"
                value={samples}
                onChange={(e) => setSamples(Number(e.target.value))}
              />
            </label>
            <button
              className="btn primary"
              disabled={!write || busy || samples < 10 || samples > 2000}
              onClick={() =>
                action(
                  "/datasets",
                  { simulation_id: sim || simulations.rows[0]?.id, samples },
                  "합성 데이터셋을 생성했습니다.",
                )
              }
            >
              <Plus size={15} />
              {ui("데이터 생성")}
            </button>
          </>
        ) : (
          <button className="btn" onClick={() => go("simulator")}>
            {ui("시뮬레이션 먼저 실행하기")}
            <ArrowRight size={15} />
          </button>
        )}
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>{ui("데이터셋 레지스트리")}</h2>
          <span className="label neutral">
            {ui(datasets.rows.length)}
            {ui("개 데이터셋")}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{ui("데이터셋")}</th>
                <th>{ui("샘플 수")}</th>
                <th>{ui("생성 방식")}</th>
                <th>{ui("상태")}</th>
                <th>{ui("내려받기")}</th>
              </tr>
            </thead>
            <tbody>
              {datasets.rows.map((d) => (
                <tr key={d.id}>
                  <td>
                    <b>{ui(d.name)}</b>
                    <small className="block muted">{ui(d.id)}</small>
                  </td>
                  <td>
                    {ui(num(d.samples))}
                    {ui("건")}
                  </td>
                  <td>
                    <span className="code-tag">{ui("파라미터 합성")}</span>
                  </td>
                  <td>
                    <Status value={d.status} />
                  </td>
                  <td>
                    <button
                      className="btn small-btn"
                      onClick={() =>
                        file(`/datasets/${d.id}/download`, d.id + ".csv")
                      }
                    >
                      <ArrowDownToLine size={14} />
                      CSV
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!datasets.rows.length && (
            <Empty
              title={ui("가상 실험을 데이터로 연결해보세요.")}
              description={ui(
                "생성한 데이터셋은 서버에 기록되며 CSV로 내려받을 수 있습니다.",
              )}
            />
          )}
        </div>
      </section>
    </>
  );
}
function OrdersPage({
  write,
  busy,
  action,
  revision,
  open,
}: {
  write: boolean;
  busy: boolean;
  action: Action;
  revision: number;
  open: () => void;
}) {
  const { rows, error } = useResources("order", revision);
  return (
    <>
      <SectionTitle
        eyebrow="MANUFACTURING EXECUTION"
        title={ui("계획에서 생산 실적까지.")}
        description={ui(
          "라인별 작업지시와 최종 공정에서 집계한 양품 실적을 관리합니다.",
        )}
        action={
          <button className="btn primary" disabled={!write} onClick={open}>
            <Plus size={16} />
            {ui("작업지시 생성")}
          </button>
        }
      />
      <LoadError message={error} />
      <div className="three-metrics">
        <Metric
          title={ui("전체 작업지시")}
          icon={Boxes}
          value={String(rows.length)}
          unit="건"
          note="계획 · 진행 · 완료 작업"
          accent="blue"
        />
        <Metric
          title={ui("현재 진행 중")}
          icon={Play}
          value={String(rows.filter((r) => r.status === "running").length)}
          unit="건"
          note="라인별 한 개의 활성 작업"
          accent="teal"
        />
        <Metric
          title={ui("누적 생산 실적")}
          icon={CheckCheck}
          value={num(rows.reduce((s, r) => s + r.completed, 0))}
          unit="ea"
          note="A: 비전 검사 / B: 패키징 완료 수량"
          accent="violet"
        />
      </div>
      <section className="panel">
        <div className="panel-header">
          <h2>{ui("생산 작업지시")}</h2>
          <span className="label neutral">MES CORE</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{ui("작업지시 / 제품")}</th>
                <th>{ui("라인")}</th>
                <th>{ui("상태")}</th>
                <th>{ui("생산 진척")}</th>
                <th>{ui("실행")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <b>{ui(o.name)}</b>
                    <small className="block muted">
                      {ui(o.id)} · {ui(o.product)}
                    </small>
                  </td>
                  <td>
                    <span className="line-tag">{ui(o.line)}</span>
                  </td>
                  <td>
                    <Status value={o.status} />
                  </td>
                  <td>
                    <div className="order-progress">
                      <span>
                        {ui(num(o.completed))}{" "}
                        <small>/ {ui(num(o.quantity))} ea</small>
                        <b>
                          {ui(((o.completed / o.quantity) * 100).toFixed(1))}%
                        </b>
                      </span>
                      <div>
                        <i
                          style={{
                            width: `${Math.min(100, (o.completed / o.quantity) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td>
                    {o.status === "planned" ? (
                      <button
                        className="btn small-btn"
                        disabled={!write || busy}
                        onClick={() =>
                          action(
                            `/orders/${o.id}/start`,
                            {},
                            "생산 작업을 시작했습니다.",
                          )
                        }
                      >
                        <Play size={13} />
                        {ui("시작")}
                      </button>
                    ) : (
                      <span className="muted small">
                        {ui(o.status === "running" ? "실적 자동 집계" : "완료")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="info-banner">
        <Boxes size={18} />
        <p>
          {ui(
            "최종 공정 이벤트를 완제품 실적에 반영하고 동일 라인의 중복 작업 시작을 방지합니다. 자재·LOT·BOM은 공정·재고·창고 화면에서 관리합니다.",
          )}
        </p>
      </div>
    </>
  );
}
function SettingsPage({
  admin,
  user,
  revision,
}: {
  admin: boolean;
  user: User;
  revision: number;
}) {
  const [members, setMembers] = useState<User[]>([]);
  const [logs, setLogs] = useState<Resource[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (admin)
      Promise.all([api<Resource[]>("/audit"), api<User[]>("/users")])
        .then(([audit, members]) => {
          setLogs(audit);
          setMembers(members);
        })
        .catch((e) => setError(e.message));
  }, [admin, revision]);
  return (
    <>
      <SectionTitle
        eyebrow="PLATFORM ADMINISTRATION"
        title={ui("신뢰할 수 있는 운영의 기반")}
        description={ui(
          "현재 사용자 권한과 주요 작업의 감사 이력을 확인합니다.",
        )}
      />
      <div className="admin-cards">
        <section className="panel">
          <ShieldCheck size={26} />
          <h2>{ui("역할 기반 접근 제어")}</h2>
          <p>
            {ui("현재 사용자")}
            <b>{ui(user.email)}</b>
          </p>
          <div className="role-list">
            <span>
              <b>{ui("관리자")}</b>
              {ui("연결 설정 · 모델 배포 · 제안 승인 · 감사 조회")}
            </span>
            <span>
              <b>{ui("운영자")}</b>
              {ui("데이터 수집 · 실험 · 학습 · 생산 / 가상 로봇 작업")}
            </span>
            <span>
              <b>{ui("조회자")}</b>
              {ui("현황 · 데이터 · 결과 조회 및 CSV 내려받기")}
            </span>
          </div>
        </section>
        <section className="panel">
          <Database size={26} />
          <h2>{ui("기업형 확장 아키텍처")}</h2>
          <p>React / TypeScript + FastAPI / SQLAlchemy</p>
          <div className="role-list">
            <span>
              <b>{ui("핵심")}</b>
              {ui("PostgreSQL · Nginx · 세션 인증 · Alembic")}
            </span>
            <span>
              <b>{ui("선택 인프라")}</b>
              {ui("Redis · MQTT Broker · S3 호환 객체 저장소")}
            </span>
            <span>
              <b>{ui("운영")}</b>OpenAPI · Health check · Prometheus metrics
            </span>
          </div>
        </section>
      </div>
      {admin && (
        <section className="panel account-panel">
          <div className="panel-header">
            <div>
              <h2>
                {ui("사용자 계정")}
                <span className="label neutral">
                  {ui(members.length)}
                  {ui("명")}
                </span>
              </h2>
              <p>
                {ui(
                  STATIC_DEMO
                    ? "현재 브라우저에 등록된 체험 계정"
                    : "이 워크스페이스에 등록된 계정",
                )}{" "}
                {ui("· 직접 가입한 사용자는 체험 운영자 권한입니다.")}
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{ui("이름")}</th>
                  <th>{ui("이메일")}</th>
                  <th>{ui("권한")}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.email}>
                    <td>
                      <b>{ui(member.name)}</b>
                    </td>
                    <td>{ui(member.email)}</td>
                    <td>
                      <span className="code-tag">
                        {ui(
                          member.role === "admin"
                            ? "관리자"
                            : member.role === "operator"
                              ? "일반 사용자 · 체험 운영자"
                              : "조회 사용자",
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-header">
          <h2>{ui("감사로그")}</h2>
          <span className="label neutral">{ui("최근 200개 작업")}</span>
        </div>
        <LoadError message={error} />
        {!admin ? (
          <Empty
            title={ui("관리자 권한이 필요합니다")}
            description={ui(
              "감사로그는 워크스페이스 관리자만 조회할 수 있습니다.",
            )}
          />
        ) : (
          <div className="table-wrap max-height">
            <table>
              <thead>
                <tr>
                  <th>{ui("시각")}</th>
                  <th>{ui("수행자")}</th>
                  <th>{ui("작업")}</th>
                  <th>{ui("대상")}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="mono small">{ui(date(l.created_at))}</td>
                    <td>{ui(l.actor)}</td>
                    <td>
                      <span className="code-tag">{ui(l.action)}</span>
                    </td>
                    <td className="mono small">{ui(l.target)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button,input,select,[tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={ui(title)}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-header">
          <h2>{ui(title)}</h2>
          <button
            className="icon-button"
            aria-label={ui("닫기")}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {ui(children)}
      </div>
    </div>
  );
}
function CreateForm({
  type,
  busy,
  onSubmit,
}: {
  type: "connector" | "order";
  busy: boolean;
  onSubmit: (body: unknown) => void;
}) {
  return (
    <form
      className="form-body"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const body = Object.fromEntries(f);
        onSubmit(
          type === "order"
            ? { ...body, quantity: Number(body.quantity) }
            : body,
        );
      }}
    >
      <label>
        {ui(type === "order" ? "작업지시명" : "커넥터 이름")}
        <input
          name="name"
          required
          minLength={2}
          maxLength={80}
          placeholder={ui(
            type === "order"
              ? "예: 모터 하우징 추가 생산"
              : "예: 제면 A라인 게이트웨이",
          )}
        />
      </label>
      {type === "connector" ? (
        <>
          <label>
            {ui("프로토콜")}
            <select name="protocol">
              {["REST", "MQTT", "OPC-UA", "Modbus"].map((p) => (
                <option key={p}>{ui(p)}</option>
              ))}
            </select>
          </label>
          <label>
            {ui("엔드포인트")}
            <input
              name="endpoint"
              required
              minLength={3}
              maxLength={200}
              placeholder={ui("예: opc.tcp://gateway:4840")}
            />
          </label>
          <div className="info-banner small">
            {ui(
              "구성 정보만 저장됩니다. 프로토콜 어댑터를 별도로 연결해야 실제 데이터가 수집됩니다.",
            )}
          </div>
        </>
      ) : (
        <>
          <label>
            {ui("제품명")}
            <input
              name="product"
              required
              minLength={2}
              maxLength={100}
              placeholder={ui("예: 순한맛 봉지라면 120g")}
            />
          </label>
          <div className="form-row">
            <label>
              {ui("생산 라인")}
              <select name="line">
                <option>A</option>
                <option>B</option>
              </select>
            </label>
            <label>
              {ui("계획 수량")}
              <input
                name="quantity"
                type="number"
                defaultValue={1000}
                required
                min={1}
                max={1000000}
              />
            </label>
          </div>
        </>
      )}
      <button className="btn primary wide" disabled={busy}>
        <Plus size={16} />
        {ui(busy ? "저장 중…" : "생성하기")}
      </button>
    </form>
  );
}

export function ExperienceRoot() {
  useLocale();
  useEffect(syncDocumentLocale, []);
  const [route, setRoute] = useState(panelRoute);
  useEffect(() => {
    const change = () => setRoute(panelRoute());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  return route ? (
    <PanelPlayer
      key={`${route.id}:${route.monitor ? "monitor" : "device"}`}
      id={route.id}
      initialKey={route.key}
      readOnly={route.monitor}
    />
  ) : (
    <App />
  );
}
if (!import.meta.env.SSR)
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ExperienceRoot />
    </React.StrictMode>,
  );
