import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
export const run: AgentHandler = (s) => {
  return fact(
    `라인 실험 기반 합성 데이터셋 ${s.datasets.length}건을 확인했습니다.`,
    { datasets: s.datasets.length, simulations: s.simulations.length },
    s.datasets.map((r) => r.id),
    [
      "합성 표 데이터 메타데이터입니다. 물리 엔진·정책 학습을 실행하지 않습니다.",
    ],
  );
};
