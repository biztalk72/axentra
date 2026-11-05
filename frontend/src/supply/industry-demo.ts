import { brandStorageKey, brandPlantName } from "../brand.ts";
import profiles from "./profiles.json" with { type: "json" };
import assets from "./assets.json" with { type: "json" };
import type { BrowserDemoAuth } from "../demo-auth.ts";
export type IndustryProfile = {
  id: "ramen" | "general";
  name: string;
  plant_name: string;
  description: string;
  lines: { id: string; name: string; description: string; stages: string[] }[];
};
export type IndustryState = {
  revision: number;
  config: IndustryProfile;
  templates: IndustryProfile[];
};
export const industryTemplates = profiles as IndustryProfile[];
const KEY = brandStorageKey("axentra-industry-v1");
export function readIndustry(): IndustryState {
  const s = localStorage.getItem(KEY);
  const saved = s ? JSON.parse(s) : null;
  if (saved?.config) {
    const name = brandPlantName(saved.config.plant_name);
    if (name !== saved.config.plant_name) {
      saved.config.plant_name = name;
      saved.revision += 1;
      localStorage.setItem(KEY, JSON.stringify(saved));
    }
  }
  return {
    ...(saved
      ? saved
      : { revision: 1, config: structuredClone(industryTemplates[0]) }),
    templates: structuredClone(industryTemplates),
  };
}
export function industryDemo(body: any, auth: BrowserDemoAuth): IndustryState {
  auth.current();
  const current = readIndustry();
  if (body === undefined) return current;
  auth.requireRole("admin");
  if (body.expected_revision !== current.revision)
    throw new Error("업종 설정이 변경되었습니다. 새로고침하세요.");
  const p = body.config as IndustryProfile;
  if (
    !["ramen", "general"].includes(p.id) ||
    p.name.trim().length < 2 ||
    p.name.length > 60 ||
    p.plant_name.trim().length < 2 ||
    p.plant_name.length > 80 ||
    p.description.length > 500 ||
    p.lines.length !== 2 ||
    new Set(p.lines.map((l) => l.id)).size !== 2 ||
    p.lines.some(
      (l) =>
        !["A", "B"].includes(l.id) ||
        l.name.trim().length < 2 ||
        l.name.length > 60 ||
        l.description.length > 200 ||
        !l.stages.length ||
        l.stages.length > 10 ||
        l.stages.some((s) => !s.trim() || s.length > 40),
    )
  )
    throw new Error("업종 이름·공정 구성 범위를 확인하세요.");
  const next = { revision: current.revision + 1, config: structuredClone(p) };
  localStorage.setItem(KEY, JSON.stringify(next));
  return { ...next, templates: structuredClone(industryTemplates) };
}
export function migrateRamenDemo(state: any) {
  if (state.industry_version === 1) return state;
  const mapping = Object.fromEntries(assets.map((a) => [a.legacy_id, a.id]));
  const convert = (v: any): any =>
    typeof v === "string"
      ? Object.entries(mapping)
          .reduce((s, [a, b]) => s.replaceAll(a, b), v)
          .replaceAll("가공 A라인", "제면 A라인")
          .replaceAll("조립 B라인", "스프 B라인")
          .replaceAll("스핀들", "구동부")
      : Array.isArray(v)
        ? v.map(convert)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v).map(([k, x]) => [k, convert(x)]),
            )
          : v;
  state.assets = state.assets.map((a: any) => {
    const template = assets.find((t) => t.legacy_id === a.id);
    return template
      ? { ...a, id: template.id, name: template.name, kind: template.kind }
      : a;
  });
  state.events = convert(state.events);
  for (const category of [
    "order",
    "model",
    "alert",
    "recommendation",
    "maintenance",
    "job",
  ])
    if (state.resources[category])
      state.resources[category] = convert(state.resources[category]);
  const orders: Record<string, [string, string]> = {
    "11월 모터 하우징 생산": ["순한맛 봉지라면 생산", "순한맛 봉지라면 120g"],
    "배터리 모듈 브래킷": ["분말스프 소포장 생산", "분말스프 10g 소포장"],
    "정밀 기어 샤프트": ["건면 라면 생산 준비", "건면 라면 100g"],
  };
  for (const order of state.resources.order || [])
    if (orders[order.name]) {
      const [name, product] = orders[order.name];
      Object.assign(order, { name, product });
    }
  state.industry_version = 1;
  return state;
}
