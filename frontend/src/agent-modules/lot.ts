import { fact } from "./contracts.ts";
import type { AgentHandler } from "./contracts.ts";
export const run: AgentHandler = (s, p) => {
  const x = s.supply,
    today = s.captured_at.slice(0, 10),
    until = new Date(Date.parse(today) + p.expiry_days * 86400000)
      .toISOString()
      .slice(0, 10),
    stocked = new Set(
      (x?.balances || [])
        .filter((b) => Number(b.quantity) > 0)
        .map((b) => b.lot_id),
    ),
    rows = (x?.lots || []).filter((l) => stocked.has(l.id)),
    held = rows.filter((l) => l.status !== "released"),
    expired = rows.filter((l) => l.expires_on && l.expires_on < today),
    soon = rows.filter(
      (l) => l.expires_on && l.expires_on >= today && l.expires_on <= until,
    ),
    ids = [...new Set([...held, ...expired, ...soon].map((l) => l.id))];
  return fact(
    `재고 LOT ${rows.length}개: 보류/차단 ${held.length}개, 기한 경과 ${expired.length}개, 임박 ${soon.length}개입니다.`,
    {
      stocked_lots: rows.length,
      held_lots: held.length,
      expired_lots: expired.length,
      expiring_lots: soon.length,
    },
    ids.length ? ids : [...stocked],
    [
      "등록된 상태·기한에 따른 점검입니다. 사용 승인은 담당자의 별도 판단입니다.",
    ],
  );
};
