import type { SupplyState } from "../supply/types.ts";
import type { IndustryProfile } from "../supply/industry-demo.ts";
import type { AgentFact } from "../agent-model.ts";
import type { Asset, Resource } from "../api.ts";
export type AgentModule = {
  id: string;
  name: string;
  description: string;
  category: string;
  tool: string;
  version: string;
  enabled: boolean;
  depends: string[];
  instruction: string;
  parameters: Record<string, number>;
  parameter_specs: {
    key: string;
    label: string;
    default: number;
    min: number;
    max: number;
    step: number;
  }[];
  industries?: string[];
  surfaces?: string[];
  data_products?: string[];
  compatible?: boolean;
  builtin: boolean;
  revision: number;
  template_id?: string;
  updated_at?: string;
  history: (AgentModuleConfig & { revision: number; saved_at?: string })[];
};
export type AgentModuleConfig = Pick<
  AgentModule,
  "name" | "description" | "enabled" | "depends" | "instruction" | "parameters"
>;
export type AgentContext = {
  line: string;
  supply?: SupplyState;
  industry?: IndustryProfile;
  captured_at: string;
  assets: Asset[];
  events: { asset_id: string }[];
  orders: Resource[];
  robots: Resource[];
  panels: {
    id: string;
    published: boolean;
    revision: number;
    published_revision: number;
  }[];
  cameras: { id: string; enabled: boolean; source_type: string }[];
  floor_events: Resource[];
  connectors: Resource[];
  simulations: Resource[];
  models: Resource[];
  jobs: Resource[];
  datasets: Resource[];
};
export type AgentHandler = (
  s: AgentContext,
  p: Record<string, number>,
  blackboard: Record<string, AgentFact>,
) => AgentFact;
export const fact = (
  summary: string,
  metrics: Record<string, number>,
  evidence: string[],
  findings: string[],
): AgentFact => ({ summary, metrics, evidence, findings });
