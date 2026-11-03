import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
export const run: AgentHandler = (s) => {
  const x = s.supply,
    locations = x?.locations || [],
    warehouses = new Set(locations.map((l) => l.warehouse)),
    occupied = new Set(
      (x?.balances || [])
        .filter((b) => Number(b.quantity) > 0)
        .map((b) => b.location_id),
    );
  return fact(
    `창고 ${warehouses.size}개, 로케이션 ${locations.length}개 중 ${occupied.size}개에 재고가 있습니다.`,
    {
      warehouses: warehouses.size,
      locations: locations.length,
      occupied_bins: occupied.size,
    },
    locations.map((l) => l.id),
    [
      "적치 로케이션 수 기준입니다. 부피·중량 수용능력이나 랙 적재율을 의미하지 않습니다.",
    ],
  );
};
