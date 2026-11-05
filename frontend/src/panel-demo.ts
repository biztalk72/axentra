import { BrowserDemoAuth, DemoAuthError } from "./demo-auth.ts";
import {
  makeConfig,
  makeScreen,
  validatePanelConfig,
  validateCamera,
  buildPanelSnapshot,
} from "./panel-model.ts";
import type {
  PanelRecord,
  PanelConfig,
  Camera,
  CctvLayout,
  ManufacturingSource,
} from "./panel-model.ts";
type StoredPanel = PanelRecord & { device_token_hash?: string };
type Store = {
  agent_widgets_migrated?: boolean;
  panels: StoredPanel[];
  cameras: Camera[];
  layouts: Record<string, CctvLayout>;
};
const KEY = "forge-ax-field-panels-v1";
const now = () => new Date().toISOString();
function seed(): Store {
  const cameras: Camera[] = (["A", "B"] as const).flatMap((line) =>
    [1, 2].map((i) => ({
      id: `CAM-${line}-0${i}`,
      name: `${line}라인 · ${i === 1 ? (line === "A" ? "제면 구역" : "스프 배합 구역") : "포장·이송 구역"}`,
      line,
      location: `생산동 ${line}-0${i}`,
      source_type: "demo" as const,
      url: "",
      enabled: true,
      fit: "cover" as const,
      revision: 1,
    })),
  );
  const panels: StoredPanel[] = (["A", "B"] as const).flatMap((line) =>
    (["tv", "touch"] as const).map((mode) => {
      const config = makeConfig(line);
      config.mode = mode;
      config.name = `${line}라인 ${mode === "tv" ? "생산 전광판" : "작업자 터치 패널"}`;
      config.location = `생산동 ${line}라인 · ${mode === "tv" ? "입구" : "작업 셀"}`;
      config.resolution = mode === "tv" ? "1920x1080" : "1280x800";
      config.rotation_enabled = mode === "tv";
      config.screens = (
        mode === "tv"
          ? (["production", "equipment", "quality", "agents"] as const)
          : (["work-order", "andon", "logistics"] as const)
      ).map((template) => ({
        ...makeScreen(template),
        id: `screen-${template}`,
      }));
      config.agent_widgets =
        mode === "tv" ? ["inventory", "warehouse", "lot", "bom"] : [];
      config.camera_widget = {
        enabled: mode === "tv",
        camera_ids: [`CAM-${line}-01`, `CAM-${line}-02`],
        layout: "grid",
        position: "right",
      };
      return {
        id: `PANEL-${line}-${mode.toUpperCase()}`,
        draft: config,
        published: structuredClone(config),
        revision: 1,
        published_revision: 1,
        published_at: now(),
        last_seen: null,
        connection: "unpaired",
        has_device_key: false,
      };
    }),
  );
  return { panels, cameras, layouts: {} };
}
function read(): Store {
  try {
    const text = localStorage.getItem(KEY);
    if (text) {
      const store = JSON.parse(text) as Store;
      if (!store.agent_widgets_migrated) {
        for (const panel of store.panels) {
          if (!["PANEL-A-TV", "PANEL-B-TV"].includes(panel.id)) continue;
          for (const kind of ["draft", "published"] as const) {
            const config = panel[kind];
            if (
              config &&
              !config.screens.some((s) => s.template === "agents") &&
              config.screens.length < 12
            ) {
              config.screens.push({
                ...makeScreen("agents"),
                id: "screen-agents",
              });
              config.agent_widgets = ["inventory", "warehouse", "lot", "bom"];
              if (kind === "draft") panel.revision++;
              else panel.published_revision++;
            }
          }
        }
        for (const camera of store.cameras)
          camera.name = camera.name.replace(
            "가공 구역",
            camera.line === "A" ? "제면 구역" : "스프 배합 구역",
          );
        store.agent_widgets_migrated = true;
        localStorage.setItem(KEY, JSON.stringify(store));
      }
      return store;
    }
  } catch {
    throw new Error("현장 설정 저장소를 읽을 수 없습니다.");
  }
  return seed();
}
function save(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}
const digest = async (token: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
const clean = (p: StoredPanel): PanelRecord => {
  const { device_token_hash: _, ...rest } = p;
  return {
    ...rest,
    has_device_key: !!p.device_token_hash,
    connection: p.last_seen
      ? Date.now() - Date.parse(p.last_seen) <=
        Math.max(p.draft.refresh_interval * 3, 30) * 1000
        ? "online"
        : "offline"
      : "unpaired",
  };
};
export async function panelDemoRequest<T>(
  path: string,
  body: any,
  context: {
    auth: BrowserDemoAuth;
    deviceKey?: string;
    source: ManufacturingSource;
    record: (action: string, target: string, actor: string) => void;
    saveSource: () => void;
  },
): Promise<T> {
  const store = read(),
    { auth, deviceKey, source } = context;
  const log = (action: string, target: string, actor?: string) => {
    context.record(action, target, actor || auth.current().email);
    context.saveSource();
  };
  const get = (id: string) => {
    const p = store.panels.find((p) => p.id === id);
    if (!p) throw new Error("패널을 찾을 수 없습니다.");
    return p;
  };
  const parts = path.split("/").filter(Boolean),
    pid = parts[1];
  if (
    deviceKey &&
    !(
      parts[0] === "panels" &&
      ["display", "heartbeat", "events"].includes(parts[2])
    )
  )
    throw new DemoAuthError(
      403,
      "패널 키는 해당 패널의 표시·하트비트·현장 입력에만 사용할 수 있습니다.",
    );
  let result: unknown;
  if (
    parts[0] === "panels" &&
    ["display", "heartbeat", "events"].includes(parts[2])
  ) {
    const panel = get(pid);
    if (deviceKey) {
      if (
        !panel.device_token_hash ||
        (await digest(deviceKey)) !== panel.device_token_hash ||
        !panel.device_expires_at ||
        Date.parse(panel.device_expires_at) <= Date.now()
      )
        throw new DemoAuthError(
          401,
          "패널 연결 키가 유효하지 않거나 만료됐습니다.",
        );
    } else auth.current();
    const config = panel.published;
    if (!config) throw new Error("게시된 화면이 없습니다.");
    if (parts[2] === "display")
      result = buildPanelSnapshot(
        source,
        config,
        pid,
        panel.published_revision,
        "published",
        store.cameras,
      );
    else if (parts[2] === "heartbeat") {
      panel.last_seen = now();
      panel.active_screen_id = body.screen_id;
      panel.runtime_revision = body.revision;
      result = { ok: true };
    } else {
      if (!deviceKey) auth.requireRole("operator", "admin");
      if (config.mode !== "touch")
        throw new DemoAuthError(403, "터치 패널에서만 현장 입력이 가능합니다.");
      const templates = config.screens.map((s) => s.template);
      if (
        body.action === "support.request" &&
        (!templates.includes("andon") ||
          !["equipment", "material", "quality"].includes(body.reason))
      )
        throw new Error("지원 요청 화면과 사유를 확인하세요.");
      if (
        body.action === "work.acknowledge" &&
        (!templates.includes("work-order") ||
          !source.resources.order.some(
            (o) =>
              o.id === body.order_id &&
              o.line === config.line &&
              o.status === "running",
          ))
      )
        throw new Error("이 라인의 진행 중 작업만 확인할 수 있습니다.");
      if (
        !["support.request", "work.acknowledge"].includes(body.action) ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(body.event_id)
      )
        throw new Error("허용되지 않은 현장 입력입니다.");
      const id = `PE-${pid}-${body.event_id}`;
      source.resources.panel_event ||= [];
      const duplicate = source.resources.panel_event.some((e) => e.id === id);
      if (!duplicate) {
        const actor = deviceKey ? `panel:${pid}` : auth.current().email;
        source.resources.panel_event.unshift({
          id,
          name:
            body.action === "support.request"
              ? "현장 지원 요청"
              : "작업지시 확인",
          status: "received",
          created_at: now(),
          ...body,
          panel_id: pid,
          line: config.line,
          actor,
        });
        log(body.action, pid, actor);
      }
      result = { id, duplicate };
    }
  } else {
    const user = auth.current();
    if (
      body !== undefined &&
      path !== "/panels/preview" &&
      path !== "/cctv/layout"
    )
      auth.requireRole("admin", "operator");
    if (path === "/cameras" && body === undefined) result = store.cameras;
    else if (path === "/cameras") {
      validateCamera(body);
      const camera = {
        ...body,
        url: ["demo", "device"].includes(body.source_type)
          ? ""
          : body.url.trim(),
        id: `CAM-${crypto.randomUUID().slice(0, 8)}`,
        revision: 1,
      };
      store.cameras.push(camera);
      result = camera;
      log("camera.create", camera.id);
    } else if (parts[0] === "cameras") {
      const index = store.cameras.findIndex((c) => c.id === pid);
      if (index < 0) throw new Error("카메라를 찾을 수 없습니다.");
      const camera = store.cameras[index];
      if (camera.revision !== body.expected_revision)
        throw new Error("카메라 설정이 변경됐습니다. 새로고침하세요.");
      validateCamera(body.config);
      store.cameras[index] = {
        ...body.config,
        url: ["demo", "device"].includes(body.config.source_type)
          ? ""
          : body.config.url.trim(),
        id: pid,
        revision: camera.revision + 1,
      };
      result = store.cameras[index];
      log("camera.update", pid);
    } else if (path === "/cctv/layout") {
      if (body !== undefined) {
        if (
          body.camera_ids.length > 4 ||
          new Set(body.camera_ids).size !== body.camera_ids.length ||
          body.camera_ids.some(
            (id: string) =>
              !store.cameras.some((c) => c.id === id && c.enabled),
          )
        )
          throw new Error("활성 카메라를 중복 없이 최대 4개 선택하세요.");
        store.layouts[user.email] = body;
      }
      result = store.layouts[user.email] || {
        enabled: true,
        minimized: false,
        camera_ids: store.cameras
          .filter((c) => c.enabled)
          .slice(0, 4)
          .map((c) => c.id),
        layout: "grid",
      };
    } else if (path === "/panels" && body === undefined)
      result = store.panels.map(clean);
    else if (path === "/panels") {
      validatePanelConfig(body, store.cameras);
      const p: StoredPanel = {
        id: `PAN-${crypto.randomUUID().slice(0, 8)}`,
        draft: body,
        published: null,
        revision: 1,
        published_revision: 0,
        published_at: null,
        last_seen: null,
        connection: "unpaired",
        has_device_key: false,
      };
      store.panels.push(p);
      result = clean(p);
      log("panel.create", p.id);
    } else if (path === "/panels/preview") {
      validatePanelConfig(body, store.cameras);
      result = buildPanelSnapshot(
        source,
        body,
        "PREVIEW",
        0,
        "preview",
        store.cameras,
      );
    } else if (path === "/panels/bulk-publish") {
      auth.requireRole("admin");
      if (
        !body.targets.length ||
        new Set(body.targets.map((t: { id: string }) => t.id)).size !==
          body.targets.length
      )
        throw new Error("대상 패널을 확인하세요.");
      const targets = body.targets.map(
        (t: { id: string; expected_revision: number }) => {
          const p = get(t.id);
          if (p.revision !== t.expected_revision)
            throw new Error("초안이 변경되어 전체 게시를 취소했습니다.");
          validatePanelConfig(p.draft, store.cameras);
          return p;
        },
      );
      targets.forEach((p: StoredPanel) => {
        p.published = structuredClone(p.draft);
        p.published_revision = p.revision;
        p.published_at = now();
        log("panel.publish", p.id);
      });
      result = targets.map(clean);
    } else if (path === "/panels/bulk-layout") {
      if (
        !body.targets.length ||
        new Set(body.targets.map((t: { id: string }) => t.id)).size !==
          body.targets.length
      )
        throw new Error("분배할 패널을 중복 없이 선택하세요.");
      const updates = body.targets.map(
        (t: { id: string; expected_revision: number }) => {
          const p = get(t.id);
          if (p.revision !== t.expected_revision)
            throw new Error(
              "대상 패널의 설정이 변경되어 전체 분배를 취소했습니다.",
            );
          const draft = {
            ...p.draft,
            screens: body.screens,
            theme: body.theme,
            refresh_interval: body.refresh_interval,
            rotation_enabled: body.rotation_enabled,
            ...(body.agent_widgets
              ? { agent_widgets: body.agent_widgets }
              : {}),
          };
          validatePanelConfig(draft, store.cameras);
          return { p, draft };
        },
      );
      updates.forEach(
        ({ p, draft }: { p: StoredPanel; draft: PanelConfig }) => {
          p.draft = structuredClone(draft);
          p.revision++;
        },
      );
      result = updates.map(({ p }: { p: StoredPanel }) => clean(p));
      log(
        "panel.bulk_layout",
        body.targets.map((t: { id: string }) => t.id).join(","),
      );
    } else if (parts[0] === "panels") {
      const p = get(pid);
      if (parts[2] === "draft") {
        if (p.revision !== body.expected_revision)
          throw new Error("다른 사용자가 수정했습니다. 새로고침하세요.");
        validatePanelConfig(body.config, store.cameras);
        p.draft = body.config;
        p.revision++;
        result = clean(p);
        log("panel.save_draft", pid);
      } else if (parts[2] === "publish") {
        auth.requireRole("admin");
        if (p.revision !== body.expected_revision)
          throw new Error("초안이 변경되었습니다.");
        validatePanelConfig(p.draft, store.cameras);
        p.published = structuredClone(p.draft);
        p.published_revision = p.revision;
        p.published_at = now();
        result = clean(p);
        log("panel.publish", pid);
      } else if (parts[2] === "access") {
        auth.requireRole("admin");
        if (!p.published) throw new Error("설정을 먼저 게시하세요.");
        const token = crypto.randomUUID() + crypto.randomUUID();
        p.device_token_hash = await digest(token);
        p.device_expires_at = new Date(
          Date.now() + 30 * 86400000,
        ).toISOString();
        result = {
          panel_id: pid,
          access_token: token,
          expires_at: p.device_expires_at,
        };
        log("panel.issue_access", pid);
      } else throw new Error("지원하지 않는 패널 작업입니다.");
    } else throw new Error("현장 설정 요청을 확인하세요.");
  }
  save(store);
  return structuredClone(result) as T;
}
export function panelDemoInventory() {
  const store = read();
  return { panels: store.panels.map(clean), cameras: store.cameras };
}
