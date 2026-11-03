import type { AgentModule } from "./agent-modules/contracts";
export type AgentTask = {
  id: string;
  name: string;
  tool: string;
  depends: string[];
  status: string;
  module_revision?: number;
  tool_version?: string;
  elapsed_ms?: number;
  started_at?: string;
  finished_at?: string;
};
export type AgentFact = {
  summary: string;
  evidence: string[];
  findings: string[];
  metrics?: Record<string, number>;
  maintenance_assets?: string[];
  llm?: { summary: string; input_tokens?: number; output_tokens?: number };
};
export type AgentRun = {
  id: string;
  name: string;
  status: string;
  goal: string;
  line: string;
  mode: "tools" | "ollama";
  model: string | null;
  concurrency: number;
  created_at: string;
  created_by: string;
  tasks: AgentTask[];
  modules?: AgentModule[];
  blackboard?: Record<string, AgentFact>;
  traces?: {
    id: string;
    agent: string;
    tool: string;
    status: string;
    timestamp: string;
    elapsed_ms: number;
    summary: string;
    evidence: string[];
  }[];
  knowledge_graph?: {
    nodes: { id: string; label: string; kind: string }[];
    edges: { source: string; target: string; relation: string }[];
  };
  report?: AgentFact;
  approvals: {
    id: string;
    name: string;
    status: string;
    reason: string;
    asset_id: string;
    impact: string;
  }[];
  error?: string;
  finished_at?: string;
};
export type AgentConfig = {
  roles: AgentModule[];
  concurrency: number;
  provider: string;
  llm_configured: boolean;
  model: string;
  tools: string[];
  max_nodes: number;
  default_mode: string;
};
