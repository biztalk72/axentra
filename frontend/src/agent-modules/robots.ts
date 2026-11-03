import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
export const run: AgentHandler = (s, p) => {
  const low = s.robots.filter(
    (r) => Number(r.battery || 0) < p.min_battery,
  ).length;
  return fact(
    `공용 가상 AMR ${s.robots.length}대 중 배터리 ${p.min_battery}% 미만 ${low}대입니다.`,
    { robots: s.robots.length, low_battery: low, jobs: s.jobs.length },
    s.robots.map((r) => r.id),
    ["공용 가상 로봇 기준. 배정·이동·충전 명령은 실행하지 않습니다."],
  );
};
