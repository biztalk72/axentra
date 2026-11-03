import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
export const run: AgentHandler = (s) => {
  const rows = s.assets.filter((a) => a.id.startsWith("SUP-")),
    orders = rows.length ? s.orders.filter((o) => o.status === "running") : [];
  return fact(
    `선택 라인의 스프 생산·소포장 설비 ${rows.length}대, 진행 작업 ${orders.length}건입니다.`,
    { process_assets: rows.length, active_orders: orders.length },
    rows.map((a) => a.id),
    [
      "스프 배합 → 분쇄·체질 → 정량 충전 → 소포장",
      "설비 상태와 LOT·BOM 배합 이력은 별도 원장으로 확인합니다.",
    ],
  );
};
