import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
import { isEligible } from "../supply/types.ts";
export const run: AgentHandler = (s, p) => {
  const x = s.supply,
    skus = x?.skus || [],
    available = new Map(skus.map((sku) => [sku.id, 0]));
  for (const b of x?.balances || []) {
    const l = x!.lots.find((l) => l.id === b.lot_id)!;
    if (isEligible(l, s.captured_at.slice(0, 10)))
      available.set(
        l.sku_id,
        (available.get(l.sku_id) || 0) + Number(b.quantity),
      );
  }
  const low = skus.filter(
    (sku) =>
      (available.get(sku.id) || 0) + 1e-9 <
      Number(sku.min_stock) * p.coverage_factor,
  );
  return fact(
    `품목 ${skus.length}종 중 사용 가능 재고가 기준 미만인 품목은 ${low.length}종입니다.`,
    {
      skus: skus.length,
      low_stock_skus: low.length,
      stock_lines: (x?.balances || []).filter((b) => Number(b.quantity) > 0)
        .length,
    },
    (low.length ? low : skus).map((x) => x.id),
    [
      ...skus.map(
        (sku) =>
          `${sku.name}: ${(available.get(sku.id) || 0).toFixed(3)} ${sku.unit} / 최소 ${sku.min_stock} ${sku.unit}`,
      ),
      "품목별 단위로 비교합니다. 서로 다른 kg·ea·box 수량을 합산하지 않습니다.",
    ],
  );
};
