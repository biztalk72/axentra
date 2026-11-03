import { readSupply, publicSupply } from "../supply/demo.ts";
import { readIndustry } from "../supply/industry-demo.ts";
import type { ManufacturingSource } from "../panel-model.ts";
import type { AgentContext } from "./contracts.ts";
import { panelDemoInventory } from "../panel-demo.ts";
export function captureContext(
  source: ManufacturingSource,
  line: string,
): AgentContext {
  const assets = source.assets.filter((a) => a.line === line),
    ids = new Set(assets.map((a) => a.id)),
    inventory = panelDemoInventory(),
    resources = source.resources;
  const simulations = (resources.simulation || []).filter(
      (r) => r.line === line,
    ),
    simIds = new Set(simulations.map((r) => r.id));
  return structuredClone({
    line,
    supply: publicSupply(readSupply()),
    industry: readIndustry().config,
    captured_at: new Date().toISOString(),
    assets,
    events: source.events.filter((e) => ids.has(e.asset_id)).slice(-200),
    orders: (resources.order || []).filter((r) => r.line === line),
    robots: resources.robot || [],
    panels: inventory.panels
      .filter((p) => p.draft.line === line)
      .map((p) => ({
        id: p.id,
        published: !!p.published,
        revision: p.revision,
        published_revision: p.published_revision,
      })),
    cameras: inventory.cameras
      .filter((c) => c.line === line)
      .map((c) => ({
        id: c.id,
        enabled: c.enabled,
        source_type: c.source_type,
      })),
    floor_events: (resources.panel_event || []).filter((r) => r.line === line),
    connectors: (resources.connector || []).map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      created_at: r.created_at,
    })),
    simulations,
    models: (resources.model || []).filter((r) => ids.has(r.asset_id)),
    jobs: resources.job || [],
    datasets: (resources.dataset || []).filter((r) =>
      simIds.has(r.simulation_id),
    ),
  });
}
