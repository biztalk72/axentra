import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
export const run: AgentHandler = (s, p) => {
  const good = s.assets.reduce((n, a) => n + a.produced, 0),
    bad = s.assets.reduce((n, a) => n + a.rejected, 0),
    quality = Number(((good / Math.max(good + bad, 1)) * 100).toFixed(2));
  return fact(
    `설비 누적 양품률은 ${quality}%입니다. 목표 ${p.target_quality}% 대비 ${quality >= p.target_quality ? "충족" : "미달"}입니다.`,
    { good, rejected: bad, quality, target_quality: p.target_quality },
    s.assets.map((a) => a.id),
    [
      "전체 설비 처리 수량 기준. 완제품 합산 실적이나 고장 예측 정확도가 아닙니다.",
    ],
  );
};
