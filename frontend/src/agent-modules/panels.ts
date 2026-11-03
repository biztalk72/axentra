import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
export const run: AgentHandler = (s) => {
  const pending = s.panels.filter(
    (r) => !r.published || r.revision !== r.published_revision,
  ).length;
  return fact(
    `라인 패널 ${s.panels.length}개, 미게시 또는 변경 초안 ${pending}개입니다.`,
    { panels: s.panels.length, draft_panels: pending },
    s.panels.map((r) => r.id),
    ["게시 설정을 확인합니다. 실제 장치 연결은 하트비트로 별도 확인합니다."],
  );
};
