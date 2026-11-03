import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
export const run: AgentHandler = (s) => {
  const a = [...s.assets].sort((a, b) => b.cycle_time - a.cycle_time)[0],
    active = s.orders.filter((o) => o.status === "running");
  return fact(
    `병목 주기 설비는 ${a.id}입니다. 진행 중인 작업은 ${active.length}건입니다.`,
    {
      baseline_ea: Math.floor(((8 * 3600) / a.cycle_time) * 0.9 * 0.98),
      scenario_ea: Math.floor(
        ((8 * 3600) / (a.cycle_time * 0.85)) * 0.95 * 0.985,
      ),
      cycle_time: a.cycle_time,
    },
    [a.id, ...active.map((o) => o.id)],
    [
      "8시간·직렬 공정 모델. 기준 비가동 10%/불량 2%, 변경 주기 15% 단축/비가동 5%/불량 1.5%. 실제 성능 보장 아님.",
    ],
  );
};
