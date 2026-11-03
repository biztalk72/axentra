import type { Asset, Resource } from "./api";
export const TEMPLATES = [
  {
    id: "production",
    name: "생산 현황",
    description: "목표·실적·달성률과 라인 흐름",
    color: "#42d4ae",
  },
  {
    id: "equipment",
    name: "설비 모니터링",
    description: "온도·진동·운전 상태 한눈에",
    color: "#59a8ff",
  },
  {
    id: "quality",
    name: "품질 현황",
    description: "누적 양품률과 설비별 불량",
    color: "#a696ff",
  },
  {
    id: "work-order",
    name: "작업지시",
    description: "품번·계획·작업 안내·확인 입력",
    color: "#66d7ec",
  },
  {
    id: "andon",
    name: "현장 지원 요청",
    description: "설비·자재·품질 지원 요청",
    color: "#ffb866",
  },
  {
    id: "logistics",
    name: "물류 현황",
    description: "공용 AMR 위치·배터리·작업",
    color: "#84b7f5",
  },
  {
    id: "notice",
    name: "현장 공지",
    description: "라인별 안내와 전달 사항",
    color: "#e9d27d",
  },
  {
    id: "cctv",
    name: "라인 CCTV",
    description: "카메라 단일 보기·멀티뷰",
    color: "#f49ebc",
  },
] as const;
export type Template = (typeof TEMPLATES)[number]["id"];
export type Camera = {
  id: string;
  name: string;
  line: "A" | "B";
  location: string;
  source_type: "demo" | "hls" | "mp4" | "mjpeg";
  url: string;
  enabled: boolean;
  fit: "cover" | "contain";
  revision: number;
};
export type Screen = {
  id: string;
  template: Template;
  title: string;
  duration: number;
  message: string;
};
export type CameraWidgetConfig = {
  enabled: boolean;
  camera_ids: string[];
  layout: "single" | "grid";
  position: "right" | "bottom";
};
export type PanelConfig = {
  name: string;
  line: "A" | "B";
  location: string;
  mode: "tv" | "touch";
  resolution: "1920x1080" | "1366x768" | "1280x800" | "1080x1920";
  theme: "dark" | "light";
  refresh_interval: number;
  rotation_enabled: boolean;
  screens: Screen[];
  camera_widget: CameraWidgetConfig;
};
export type PanelRecord = {
  id: string;
  draft: PanelConfig;
  published: PanelConfig | null;
  revision: number;
  published_revision: number;
  published_at: string | null;
  last_seen: string | null;
  active_screen_id?: string;
  runtime_revision?: number;
  connection: "online" | "offline" | "unpaired";
  has_device_key: boolean;
  device_expires_at?: string;
};
export type PanelSnapshot = {
  panel_id: string;
  config: PanelConfig;
  revision: number;
  source: "preview" | "published";
  assets: Asset[];
  orders: Resource[];
  alerts: Resource[];
  robots: Resource[];
  jobs: Resource[];
  events: Resource[];
  series: { time: string; good: number; rejected: number }[];
  cameras: Camera[];
  server_time: string;
  last_data_at: string | null;
};
export type CctvLayout = {
  enabled: boolean;
  minimized: boolean;
  camera_ids: string[];
  layout: "single" | "grid";
};
export type ManufacturingSource = {
  assets: Asset[];
  events: {
    asset_id: string;
    timestamp: string;
    good: number;
    rejected: number;
  }[];
  resources: Record<string, Resource[]>;
};
export const makeScreen = (template: Template): Screen => ({
  id: crypto.randomUUID(),
  template,
  title: TEMPLATES.find((t) => t.id === template)!.name,
  duration: 20,
  message: "",
});
export function makeConfig(line: "A" | "B" = "A"): PanelConfig {
  return {
    name: `${line}라인 신규 패널`,
    line,
    location: `생산동 ${line}라인`,
    mode: "tv",
    resolution: "1920x1080",
    theme: "dark",
    refresh_interval: 6,
    rotation_enabled: true,
    screens: [makeScreen("production")],
    camera_widget: {
      enabled: false,
      camera_ids: [],
      layout: "grid",
      position: "right",
    },
  };
}
export function validatePanelConfig(config: PanelConfig, cameras: Camera[]) {
  if (
    config.name.trim().length < 2 ||
    config.name.length > 80 ||
    config.location.trim().length < 2 ||
    config.location.length > 80
  )
    throw new Error("패널 이름과 위치는 2~80자로 입력하세요.");
  if (
    !["A", "B"].includes(config.line) ||
    !["tv", "touch"].includes(config.mode) ||
    !["dark", "light"].includes(config.theme) ||
    !["1920x1080", "1366x768", "1280x800", "1080x1920"].includes(
      config.resolution,
    )
  )
    throw new Error("패널 유형·라인·해상도를 확인하세요.");
  if (
    !Number.isInteger(config.refresh_interval) ||
    config.refresh_interval < 5 ||
    config.refresh_interval > 60
  )
    throw new Error("갱신 주기는 5~60초입니다.");
  if (
    !config.screens.length ||
    config.screens.length > 12 ||
    new Set(config.screens.map((s) => s.id)).size !== config.screens.length
  )
    throw new Error("화면을 1~12개, 중복 ID 없이 구성하세요.");
  for (const screen of config.screens)
    if (
      !TEMPLATES.some((t) => t.id === screen.template) ||
      !screen.title.trim() ||
      screen.title.length > 60 ||
      screen.message.length > 1000 ||
      !Number.isInteger(screen.duration) ||
      screen.duration < 10 ||
      screen.duration > 300
    )
      throw new Error("화면 제목·유형·노출 시간(10~300초)을 확인하세요.");
  const widget = config.camera_widget;
  if (widget.enabled && !widget.camera_ids.length)
    throw new Error("CCTV 카메라를 하나 이상 선택하세요.");
  if (
    widget.camera_ids.length > 4 ||
    new Set(widget.camera_ids).size !== widget.camera_ids.length ||
    widget.camera_ids.some(
      (id) =>
        !cameras.some(
          (c) => c.id === id && c.line === config.line && c.enabled,
        ),
    )
  )
    throw new Error("패널과 같은 라인의 활성 카메라만 선택하세요.");
}
export function validateCamera(camera: Omit<Camera, "id" | "revision">) {
  if (
    camera.name.trim().length < 2 ||
    camera.location.trim().length < 2 ||
    camera.name.length > 80 ||
    camera.location.length > 80
  )
    throw new Error("카메라 이름과 위치는 2~80자입니다.");
  if (
    !["demo", "hls", "mp4", "mjpeg"].includes(camera.source_type) ||
    !["A", "B"].includes(camera.line) ||
    !["cover", "contain"].includes(camera.fit)
  )
    throw new Error("카메라 유형·라인·화면 맞춤을 확인하세요.");
  if (camera.source_type !== "demo") {
    let url: URL;
    try {
      url = new URL(camera.url);
    } catch {
      throw new Error("올바른 HTTP(S) 재생 주소를 입력하세요.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      /\s/.test(camera.url) ||
      camera.url.length > 1500
    )
      throw new Error("사용자명·암호 없는 HTTP(S) 재생 주소를 사용하세요.");
  }
}
export function buildPanelSnapshot(
  source: ManufacturingSource,
  config: PanelConfig,
  panel_id: string,
  revision: number,
  kind: "preview" | "published",
  cameras: Camera[],
): PanelSnapshot {
  const assets = source.assets.filter((a) => a.line === config.line),
    ids = new Set(assets.map((a) => a.id));
  const finalIds = new Set(
    assets.filter((a) => ["QC", "Packaging"].includes(a.kind)).map((a) => a.id),
  );
  const buckets: Record<
    string,
    { time: string; good: number; rejected: number }
  > = {};
  for (const e of source.events
    .filter((e) => ids.has(e.asset_id))
    .slice(-300)) {
    if (!finalIds.has(e.asset_id)) continue;
    const key = e.timestamp.slice(0, 16);
    const b =
      buckets[key] ||
      (buckets[key] = { time: e.timestamp, good: 0, rejected: 0 });
    b.good += e.good;
    b.rejected += e.rejected;
  }
  return {
    panel_id,
    config: structuredClone(config),
    revision,
    source: kind,
    assets,
    orders: (source.resources.order || []).filter(
      (o) => o.line === config.line,
    ),
    alerts: (source.resources.alert || []).filter(
      (a) => ids.has(a.asset_id) && a.status === "open",
    ),
    robots: source.resources.robot || [],
    jobs: (source.resources.job || []).filter(
      (j) =>
        j.destination === (config.line === "A" ? "가공 A라인" : "조립 B라인"),
    ),
    events: (source.resources.panel_event || [])
      .filter((e) => e.line === config.line)
      .slice(0, 10),
    series: Object.values(buckets).slice(-24),
    cameras: cameras.filter(
      (c) =>
        c.line === config.line &&
        c.enabled &&
        config.camera_widget.camera_ids.includes(c.id),
    ),
    server_time: new Date().toISOString(),
    last_data_at: assets.length
      ? assets
          .map((a) => a.updated_at)
          .sort()
          .at(-1)!
      : null,
  };
}
