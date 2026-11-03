import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
export const run: AgentHandler = (s) => {
  const warning = s.assets.filter((a) => a.status === "warning").length;
  return fact(
    `2D 설비 맵 ${s.assets.length}대 중 주의 상태 ${warning}대입니다.`,
    { assets: s.assets.length, warnings: warning },
    s.assets.map((a) => a.id),
    ["현재 설비 상태를 확인합니다. 3D 물리 시뮬레이션은 실행하지 않습니다."],
  );
};
