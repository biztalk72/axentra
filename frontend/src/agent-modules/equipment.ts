import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
export const run: AgentHandler = (s, p) => {
  const warnings = s.assets.filter(
    (a) =>
      a.temperature > p.temperature_threshold ||
      a.vibration > p.vibration_threshold,
  );
  return {
    ...fact(
      `운영 임계값을 초과한 설비가 ${warnings.length}대입니다.`,
      { warnings: warnings.length },
      (warnings.length ? warnings : s.assets).map((a) => a.id),
      [
        `기준: 온도 ${p.temperature_threshold}°C / 진동 ${p.vibration_threshold} mm/s`,
        ...s.assets.map(
          (a) =>
            `${a.id}: ${a.temperature.toFixed(1)}°C / ${a.vibration.toFixed(2)} mm/s`,
        ),
      ],
    ),
    maintenance_assets: warnings.map((a) => a.id),
  };
};
