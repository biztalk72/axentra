export const categoryLabels: Record<string, string> = {
  raw: "원재료",
  wip: "반제품",
  finished: "완제품",
  packaging: "포장재",
};
export const statusLabels: Record<string, string> = {
  released: "사용 승인",
  quarantine: "검사 대기",
  blocked: "사용 차단",
};
export const actionLabels: Record<string, string> = {
  receipt: "입고",
  issue: "출고",
  transfer: "창고 이동",
  consume: "생산 투입",
  produce: "생산 입고",
};
export type Sku = {
  id: string;
  name: string;
  category: string;
  unit: string;
  min_stock: string;
  revision: number;
};
export type Location = {
  id: string;
  name: string;
  warehouse: string;
  zone: string;
  allowed_categories: string[];
  revision: number;
};
export type Lot = {
  id: string;
  sku_id: string;
  code: string;
  manufactured_on: string | null;
  expires_on: string | null;
  supplier: string;
  parents: string[];
  status: string;
  revision: number;
};
export type Balance = { lot_id: string; location_id: string; quantity: string };
export type Bom = {
  id: string;
  name: string;
  product_sku_id: string;
  output_quantity: string;
  components: { sku_id: string; quantity: string }[];
  revision: number;
};
export type Movement = {
  id: string;
  action: string;
  lot_id: string;
  sku_id: string;
  quantity: string;
  from_location: string | null;
  to_location: string | null;
  reference: string;
  timestamp: string;
  batch_id: string | null;
};
export type Allocation = {
  lot_id: string;
  from_location: string;
  quantity: string;
};
export type ProductionPlan = {
  bom_id: string;
  bom_revision: number;
  product_sku_id: string;
  quantity: string;
  needs: {
    sku_id: string;
    name: string;
    unit: string;
    required: string;
    shortage: string;
  }[];
  allocations: Allocation[];
  ready: boolean;
  planned_on: string;
};
export type SupplyState = {
  outbox?: any[];
  version: number;
  revision: number;
  skus: Sku[];
  locations: Location[];
  lots: Lot[];
  balances: Balance[];
  boms: Bom[];
  movements: Movement[];
  batches: any[];
  sequence?: number;
  events?: Record<string, { fingerprint: string; result: any }>;
};
export type LotTrace = {
  root: string;
  nodes: Lot[];
  edges: { source: string; target: string }[];
};
export const number = (v: string | number) =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 3 }).format(
    Number(v),
  );
export const isEligible = (l: Lot, today: string) =>
  l.status === "released" && (!l.expires_on || l.expires_on >= today);
