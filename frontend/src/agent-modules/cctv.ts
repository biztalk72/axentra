import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
export const run: AgentHandler = (s) => {
  const active = s.cameras.filter((r) => r.enabled),
    demo = active.filter((r) => r.source_type === "demo").length;
  return fact(
    `활성 카메라 ${active.length}개 중 모의 소스 ${demo}개입니다.`,
    {
      cameras: s.cameras.length,
      active_cameras: active.length,
      demo_cameras: demo,
    },
    s.cameras.map((r) => r.id),
    [
      "소스 설정만 분석합니다. 영상 AI 분석이나 실제 재생 연결 확인은 수행하지 않습니다.",
    ],
  );
};
