import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
export const run: AgentHandler = (s) => {
  return fact(
    `커넥터 구성 ${s.connectors.length}건, 라인 수집 이력 ${s.events.length}건을 확인했습니다.`,
    { connectors: s.connectors.length, events: s.events.length },
    s.connectors.map((r) => r.id),
    ["커넥터 구성 등록은 현장 프로토콜 연결 성공을 의미하지 않습니다."],
  );
};
