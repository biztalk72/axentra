import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
export const run: AgentHandler = (s) => {
  const deployed = s.models.filter((r) => r.status === "deployed").length;
  return fact(
    `라인 관련 통계 모델 ${s.models.length}건, 배포 모델 ${deployed}건입니다.`,
    { models: s.models.length, deployed_models: deployed },
    s.models.map((r) => r.id),
    [
      "모델 메타데이터 진단입니다. 학습·배포를 자동 실행하거나 예측 성능을 주장하지 않습니다.",
    ],
  );
};
