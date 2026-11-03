import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
export const run: AgentHandler = (s, p) => {
  const a = [...s.assets].sort((a, b) => b.cycle_time - a.cycle_time)[0],
    baseline = Math.floor(((p.hours * 3600) / a.cycle_time) * 0.9 * 0.98),
    scenario = Math.floor(
      ((p.hours * 3600) / (a.cycle_time * (1 - p.cycle_reduction / 100))) *
        0.95 *
        0.985,
    );
  return fact(
    `${p.hours}시간·주기 ${p.cycle_reduction}% 단축 가정의 생산 용량은 ${scenario}ea입니다.`,
    {
      baseline_ea: baseline,
      scenario_ea: scenario,
      hours: p.hours,
      cycle_reduction: p.cycle_reduction,
    },
    [a.id],
    [
      "직렬 공정 용량 계산입니다. 새 실험 리소스를 저장하거나 실제 공정을 변경하지 않습니다.",
    ],
  );
};
