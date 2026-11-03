import catalog from "./catalog.json" with { type: "json" };
import type { AgentHandler, AgentModule, AgentContext } from "./contracts.ts";
import type { AgentFact } from "../agent-model";
import { run as data } from "./data.ts";
import { run as equipment } from "./equipment.ts";
import { run as production } from "./production.ts";
import { run as quality } from "./quality.ts";
import { run as logistics } from "./logistics.ts";
import { run as edge } from "./edge.ts";
import { run as twin } from "./twin.ts";
import { run as simulation } from "./simulation.ts";
import { run as models } from "./models.ts";
import { run as robots } from "./robots.ts";
import { run as physical } from "./physical.ts";
import { run as panels } from "./panels.ts";
import { run as cctv } from "./cctv.ts";
const handlers: Record<string, AgentHandler> = {
  "data.inspect": data,
  "equipment.assess": equipment,
  "production.inspect": production,
  "quality.assess": quality,
  "floor.inspect": logistics,
  "edge.inspect": edge,
  "twin.inspect": twin,
  "simulation.inspect": simulation,
  "models.inspect": models,
  "robots.inspect": robots,
  "physical.inspect": physical,
  "panels.inspect": panels,
  "cctv.inspect": cctv,
};
export function executeModule(
  module: AgentModule,
  source: AgentContext,
  board: Record<string, AgentFact>,
) {
  if (module.version !== catalog.find((m) => m.tool === module.tool)?.version)
    throw new Error("모듈 코드 버전이 달라 새 진단을 시작해야 합니다.");
  const handler = handlers[module.tool];
  if (!handler) throw new Error("허용되지 않은 모듈입니다.");
  return handler(
    structuredClone(source),
    structuredClone(module.parameters),
    structuredClone(board),
  );
}
