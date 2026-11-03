import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
export const run: AgentHandler = (s) => {
  const idle = s.robots.filter((r) => r.status === "idle").length,
    pending = s.panels.filter((r) => !r.published).length;
  return fact(
    `공용 AMR ${idle}대 대기, 미게시 패널 ${pending}개, 현장 입력 ${s.floor_events.length}건을 확인했습니다.`,
    {
      idle_robots: idle,
      unpublished_panels: pending,
      cameras: s.cameras.length,
      requests: s.floor_events.length,
    },
    [...s.panels.map((r) => r.id), ...s.cameras.map((r) => r.id)],
    ["공용 가상 AMR 기준. 실제 장비 명령을 실행하지 않습니다."],
  );
};
