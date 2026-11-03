import { readModules, planModules } from "./agent-modules/registry.ts";
import { executeModule } from "./agent-modules/index.ts";
import { captureContext } from "./agent-modules/context.ts";
import { defaults } from "./agent-widget-model.ts";
import type { AgentWidgetResult } from "./agent-widget-model.ts";
import type { AgentFact } from "./agent-model.ts";
import type { ManufacturingSource } from "./panel-model.ts";
import type { BrowserDemoAuth } from "./demo-auth.ts";
export function demoWidgetResults(
  source: ManufacturingSource,
  line: string,
  ids: string[],
): AgentWidgetResult[] {
  const items = readModules(),
    snapshot = captureContext(source, line),
    board: Record<string, AgentFact> = {};
  return ids.map((id) => {
    const m = items.find((m) => m.id === id),
      base = {
        id,
        name: m?.name || id,
        captured_at: snapshot.captured_at,
        line,
        module_revision: m?.revision || 0,
      };
    if (!m?.enabled || m.compatible === false)
      return {
        ...base,
        status: "disabled",
        message: "현재 업종에서 사용 중지된 에이전트입니다.",
      };
    try {
      for (const dependency of planModules(items, [id]))
        if (!board[dependency.id])
          board[dependency.id] = executeModule(dependency, snapshot, board);
      return { ...base, status: "ready", fact: board[id] };
    } catch {
      return {
        ...base,
        status: "unavailable",
        message: "구성과 의존성을 확인하세요.",
      };
    }
  });
}
export function widgetDemo(
  path: string,
  body: any,
  auth: BrowserDemoAuth,
  source: ManufacturingSource,
) {
  const user = auth.current(),
    key = "forge-ax-agent-widgets-" + user.email;
  if (path.startsWith("/agent-widgets/results")) {
    const query = new URLSearchParams(path.split("?")[1]);
    const ids = (query.get("ids") || defaults.module_ids.join(",")).split(",");
    if (ids.length > 4 || new Set(ids).size !== ids.length)
      throw new Error("위젯은 최대 4개입니다.");
    return demoWidgetResults(source, query.get("line") || "A", ids);
  }
  if (body === undefined)
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(defaults));
  const items = readModules();
  if (
    !["A", "B"].includes(body.line) ||
    body.module_ids.length > 4 ||
    new Set(body.module_ids).size !== body.module_ids.length ||
    (body.enabled && !body.module_ids.length) ||
    body.module_ids.some(
      (id: string) =>
        !items.some((m) => m.id === id && m.enabled && m.compatible !== false),
    )
  )
    throw new Error("사용 가능한 위젯을 중복 없이 1~4개 선택하세요.");
  localStorage.setItem(key, JSON.stringify(body));
  return body;
}
