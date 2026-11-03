import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
export const run: AgentHandler = (s) => {
  const rows = s.assets.filter((a) => a.id.startsWith("NDL-")),
    orders = rows.length ? s.orders.filter((o) => o.status === "running") : [];
  return fact(
    `선택 라인의 제면·포장 설비 ${rows.length}대, 진행 작업 ${orders.length}건입니다.`,
    { process_assets: rows.length, active_orders: orders.length },
    rows.map((a) => a.id),
    [
      s.industry?.lines[0]?.description ||
        "배합·반죽 → 압연·절출 → 증숙·건조 → 포장",
      "합성 설비 상태 진단이며 공정 제어·식품 안전 판정은 수행하지 않습니다.",
    ],
  );
};
