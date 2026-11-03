import { readIndustry } from "../supply/industry-demo.ts";
import catalog from "./catalog.json" with { type: "json" };
import type { AgentModule, AgentModuleConfig } from "./contracts.ts";
const KEY = "forge-ax-agent-modules-v1";
export const builtinModules = catalog.map((m) => ({
  ...m,
  builtin: true,
  revision: 1,
  history: [],
})) as unknown as AgentModule[];
export function readModules(): AgentModule[] {
  const overrides = JSON.parse(
    localStorage.getItem(KEY) || "[]",
  ) as AgentModule[];
  const map = new Map(builtinModules.map((m) => [m.id, structuredClone(m)]));
  overrides.forEach((m) => {
    const template = builtinModules.find((t) => t.tool === m.tool);
    map.set(
      m.id,
      template
        ? {
            ...m,
            version: template.version,
            category: template.category,
            parameter_specs: structuredClone(template.parameter_specs),
            industries: template.industries,
            surfaces: template.surfaces,
            data_products: template.data_products,
          }
        : m,
    );
  });
  const profile = readIndustry().config.id;
  return [...map.values()].map((m) => ({
    ...m,
    compatible:
      (m.industries || ["common"]).includes("common") ||
      m.industries?.includes(profile) ||
      false,
  }));
}
export function editable(m: AgentModule): AgentModuleConfig {
  return {
    name: m.name,
    description: m.description,
    enabled: m.enabled,
    depends: [...m.depends],
    instruction: m.instruction,
    parameters: { ...m.parameters },
  };
}
export function assertConfigKeys(config: object, extra: string[] = []) {
  const keys = [
    "name",
    "description",
    "enabled",
    "depends",
    "instruction",
    "parameters",
    ...extra,
  ];
  if (
    Object.keys(config).some((k) => !keys.includes(k)) ||
    keys.some((k) => !(k in config))
  )
    throw new Error("허용된 구성 필드만 입력하세요.");
}
export function validateModule(candidate: AgentModule, items: AgentModule[]) {
  if (
    candidate.name.trim().length < 2 ||
    candidate.name.length > 80 ||
    candidate.description.length > 500 ||
    candidate.instruction.length > 2000
  )
    throw new Error("이름·설명·지침의 입력 범위를 확인하세요.");
  if (
    candidate.id === "data" &&
    (!candidate.enabled || candidate.depends.length)
  )
    throw new Error(
      "공통 데이터 에이전트는 활성 상태와 빈 의존성을 유지해야 합니다.",
    );
  const specs = candidate.parameter_specs;
  if (
    Object.keys(candidate.parameters).length !== specs.length ||
    specs.some(
      (s) =>
        typeof candidate.parameters[s.key] !== "number" ||
        !Number.isFinite(candidate.parameters[s.key]) ||
        candidate.parameters[s.key] < s.min ||
        candidate.parameters[s.key] > s.max,
    )
  )
    throw new Error("매개변수 허용 범위를 확인하세요.");
  if (new Set(candidate.depends).size !== candidate.depends.length)
    throw new Error("중복 의존성은 허용되지 않습니다.");
  const graph = new Map(items.map((m) => [m.id, m]));
  graph.set(candidate.id, candidate);
  if (graph.size > 32) throw new Error("에이전트는 최대 32개입니다.");
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error("순환 의존성은 허용되지 않습니다.");
    if (visited.has(id)) return;
    visiting.add(id);
    const m = graph.get(id)!;
    for (const dep of m.depends) {
      const parent = graph.get(dep);
      if (!parent) throw new Error("존재하지 않는 의존 에이전트입니다.");
      if (m.enabled && !parent.enabled)
        throw new Error(
          `${m.name}에 필요한 ${parent.name}를 먼저 활성화하세요.`,
        );
      visit(dep);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) visit(id);
  return candidate;
}
export function planModules(
  items: AgentModule[],
  requested?: string[],
): AgentModule[] {
  if (
    requested &&
    (!requested.length || new Set(requested).size !== requested.length)
  )
    throw new Error("실행할 에이전트를 중복 없이 선택하세요.");
  const graph = new Map(items.map((m) => [m.id, m])),
    selected = new Set<string>(),
    visiting = new Set<string>();
  const add = (id: string) => {
    const m = graph.get(id);
    if (!m || !m.enabled || m.compatible === false)
      throw new Error("없거나 비활성화된 에이전트입니다.");
    if (visiting.has(id)) throw new Error("순환 의존성입니다.");
    if (selected.has(id)) return;
    visiting.add(id);
    m.depends.forEach(add);
    visiting.delete(id);
    selected.add(id);
  };
  add("data");
  (
    requested ||
    items.filter((m) => m.enabled && m.compatible !== false).map((m) => m.id)
  ).forEach(add);
  const result: AgentModule[] = [];
  let pending = items.filter((m) => selected.has(m.id));
  while (pending.length) {
    const done = new Set(result.map((m) => m.id)),
      ready = pending.filter((m) => m.depends.every((d) => done.has(d)));
    if (!ready.length) throw new Error("실행 의존성을 구성할 수 없습니다.");
    result.push(...structuredClone(ready));
    pending = pending.filter((m) => !ready.includes(m));
  }
  result.forEach((m) => validateModule(m, items));
  return result;
}
export function saveModule(
  mid: string,
  revision: number,
  config: AgentModuleConfig,
) {
  assertConfigKeys(config);
  const items = readModules(),
    base = items.find((m) => m.id === mid);
  if (!base) throw new Error("에이전트를 찾을 수 없습니다.");
  if (base.revision !== revision)
    throw new Error("다른 변경이 저장되었습니다. 목록을 갱신하세요.");
  const next = validateModule(
    {
      ...base,
      ...structuredClone(config),
      name: config.name.trim(),
      revision: base.revision + 1,
      updated_at: new Date().toISOString(),
      history: [
        ...base.history,
        {
          ...editable(base),
          revision: base.revision,
          saved_at: base.updated_at,
        },
      ].slice(-20),
    },
    items,
  );
  localStorage.setItem(
    KEY,
    JSON.stringify(items.map((m) => (m.id === mid ? next : m))),
  );
  return next;
}
export function createModule(
  body: AgentModuleConfig & { id: string; template_id: string },
) {
  assertConfigKeys(body, ["id", "template_id"]);
  if (
    ["planner", "main", "approval", "constructor", "prototype"].includes(
      body.id,
    )
  )
    throw new Error("실행 제어용 예약 ID는 사용할 수 없습니다.");
  const items = readModules();
  if (items.some((m) => m.id === body.id))
    throw new Error("이미 사용 중인 에이전트 ID입니다.");
  if (!/^[a-z][a-z0-9_-]{1,39}$/.test(body.id))
    throw new Error("에이전트 ID 형식을 확인하세요.");
  const template = builtinModules.find((m) => m.id === body.template_id);
  if (!template) throw new Error("기본 모듈을 선택하세요.");
  const next = validateModule(
    {
      ...structuredClone(template),
      ...body,
      builtin: false,
      revision: 1,
      history: [],
      updated_at: new Date().toISOString(),
    },
    items,
  );
  localStorage.setItem(KEY, JSON.stringify([...items, next]));
  return next;
}
