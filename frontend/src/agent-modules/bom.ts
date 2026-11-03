import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
import { productionPlan } from "../supply/engine.ts";
export const run: AgentHandler = (s) => {
  const x = s.supply,
    rows = x?.boms || [],
    plans = x
      ? rows.map((b) =>
          productionPlan(
            x,
            {
              bom_id: b.id,
              bom_revision: b.revision,
              quantity: b.output_quantity,
            },
            s.captured_at.slice(0, 10),
          ),
        )
      : [],
    short = plans.filter((p) => !p.ready);
  return fact(
    `BOM ${rows.length}종 중 기준 배치의 가용 자재가 부족한 BOM은 ${short.length}종입니다.`,
    {
      boms: rows.length,
      shortage_boms: short.length,
      bom_components: rows.reduce((n, b) => n + b.components.length, 0),
    },
    short.length ? short.map((p) => p.bom_id) : rows.map((b) => b.id),
    [
      "각 BOM의 기준 생산량으로 독립 계산합니다. 여러 생산 계획의 동시 예약·납기 MRP는 수행하지 않습니다.",
    ],
  );
};
