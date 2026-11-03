import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
export const run: AgentHandler = (s) => {
  const x = s.supply,
    skus = x?.skus || [],
    bad = (x?.balances || []).filter((b) => {
      const l = x!.lots.find((l) => l.id === b.lot_id)!,
        sku = skus.find((k) => k.id === l.sku_id)!;
      return (
        Number(b.quantity) > 0 &&
        !x!.locations
          .find((l) => l.id === b.location_id)!
          .allowed_categories.includes(sku.category)
      );
    });
  return fact(
    `품목 분류와 로케이션 적치 규칙 불일치 ${bad.length}건입니다.`,
    { classified_skus: skus.length, misplaced_stock: bad.length },
    bad.length ? [...new Set(bad.map((b) => b.lot_id))] : skus.map((k) => k.id),
    ["마스터 분류·창고 규칙에 따른 점검입니다. 영상/AI 자동 분류가 아닙니다."],
  );
};
