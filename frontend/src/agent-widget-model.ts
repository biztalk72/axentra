import type { AgentFact } from "./agent-model.ts";
export type AgentWidgetResult = {
  id: string;
  name: string;
  status: string;
  captured_at: string;
  line: string;
  module_revision: number;
  fact?: AgentFact;
  message?: string;
};
export type WidgetLayout = {
  enabled: boolean;
  line: string;
  module_ids: string[];
};
export const defaults: WidgetLayout = {
  enabled: true,
  line: "A",
  module_ids: ["inventory", "warehouse", "lot", "bom"],
};
export const metricLabels: Record<string, string> = {
  transfers: "창고 이동",
  skus: "관리 품목",
  low_stock_skus: "재고 부족 품목",
  stock_lines: "LOT·위치 재고",
  classified_skus: "분류 품목",
  misplaced_stock: "적치 불일치",
  warehouses: "창고",
  locations: "로케이션",
  occupied_bins: "적치 로케이션",
  stocked_lots: "재고 LOT",
  held_lots: "보류·차단 LOT",
  expired_lots: "기한 경과 LOT",
  expiring_lots: "기한 임박 LOT",
  boms: "BOM",
  shortage_boms: "소요량 부족 BOM",
  bom_components: "구성품",
  process_assets: "공정 설비",
  active_orders: "진행 작업",
  assets: "설비",
  events: "수집 이벤트",
  cameras: "카메라",
  active_cameras: "활성 카메라",
  demo_cameras: "모의 소스",
  quality: "양품률 (%)",
  target_quality: "목표 양품률 (%)",
  warnings: "주의 설비",
  good: "양품",
  rejected: "불량",
  baseline_ea: "기준 생산량 (ea)",
  scenario_ea: "가정 생산량 (ea)",
  cycle_time: "병목 주기 (s)",
  idle_robots: "대기 AMR",
  unpublished_panels: "미게시 패널",
  requests: "현장 요청",
  models: "통계 모델",
  deployed_models: "배포 모델",
  robots: "가상 로봇",
  low_battery: "저전압 로봇",
  jobs: "작업",
  datasets: "데이터셋",
  simulations: "실험",
  connectors: "커넥터",
  draft_panels: "변경 패널",
  panels: "현장 패널",
  hours: "분석 시간 (h)",
  cycle_reduction: "주기 단축 (%)",
};
