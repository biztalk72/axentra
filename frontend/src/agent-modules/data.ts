import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
export const run: AgentHandler = (s) => {
  return fact(
    `${s.line}라인 설비 ${s.assets.length}대, 최근 이벤트 ${s.events.length}건의 공통 스냅샷을 확인했습니다.`,
    { assets: s.assets.length, events: s.events.length },
    s.assets.map((a) => a.id),
    [
      `기준 시각 ${s.captured_at}`,
      "모든 워커가 같은 시점의 스냅샷을 사용합니다.",
    ],
  );
};
