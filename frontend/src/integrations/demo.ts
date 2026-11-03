import catalog from "./catalog.json" with { type: "json" };
import { readSupply, publicSupply } from "../supply/demo.ts";
import { readIndustry } from "../supply/industry-demo.ts";
import type { BrowserDemoAuth } from "../demo-auth.ts";
import type { ManufacturingSource } from "../panel-model.ts";
const KEY = "forge-ax-integrations-v1";
export const defaultIntegration = {
  revision: 1,
  config: {
    plugin: "mqtt",
    enabled: false,
    endpoint: "mqtts://localhost:8883",
    topic: "forge.factory.events.v1",
    tls: true,
    username_env: "",
    password_env: "",
  },
};
export function eventEnvelope(type: string, subject: string, data: any) {
  return {
    specversion: "1.0",
    id: "EVT-" + crypto.randomUUID(),
    type: "forge." + type + ".v1",
    source: "urn:forge:plant:default",
    subject,
    time: new Date().toISOString(),
    datacontenttype: "application/json",
    dataschema: "urn:forge:schema:" + type + ":1",
    industry: readIndustry().config.id,
    governance: {
      classification: "internal",
      owner: "manufacturing-operations",
      schema_version: 1,
      quality_status: "validated",
    },
    data: structuredClone(data),
  };
}
export function integrationDemo(
  path: string,
  body: any,
  auth: BrowserDemoAuth,
  source: ManufacturingSource,
) {
  auth.current();
  const current = JSON.parse(
    localStorage.getItem(KEY) || JSON.stringify(defaultIntegration),
  );
  if (path === "/integrations/catalog")
    return {
      schema_version: 1,
      classification: "internal",
      timestamp_standard: "UTC ISO8601",
      decimal_encoding:
        "base-unit decimal strings, scale 3; no implicit unit conversion",
      delivery_semantics: "at-least-once; deduplicate by event.id",
      datasets: catalog.map((d) => ({
        ...d,
        schema_version: 1,
        classification: "internal",
        steward: d.owner,
        quality_rules: [
          "known identifiers",
          "nonnegative balances",
          "no BOM cycles",
          "approved and unexpired LOT for consumption",
        ],
      })),
      plugins: [
        {
          id: "mqtt",
          name: "MQTT publisher",
          package: "paho-mqtt",
          installed: false,
          mode: "서버형 선택 플러그인 · QoS 1 PUBACK",
        },
        {
          id: "kafka",
          name: "Kafka publisher",
          package: "confluent-kafka",
          installed: false,
          mode: "서버형 선택 플러그인 · delivery callback ACK",
        },
        {
          id: "mcp",
          name: "Read-only MCP stdio server",
          package: "mcp",
          installed: false,
          mode: "별도 서버 프로세스 · GET tools only",
        },
      ],
    };
  if (path.startsWith("/integrations/export/")) {
    const [name, query] = path.split("/")[3].split("?"),
      definition = catalog.find((d) => d.id === name);
    if (!definition) throw new Error("데이터 제품을 찾을 수 없습니다.");
    const supply = publicSupply(readSupply()),
      params = new URLSearchParams(query),
      after = Number(params.get("after_id") || 0),
      limit = Math.min(10000, Number(params.get("limit") || 1000));
    const rows =
      name === "telemetry"
        ? source.events.filter((e: any) => e.id > after).slice(0, limit)
        : (supply as any)[
            (
              { stock: "balances", production: "batches" } as Record<
                string,
                string
              >
            )[name] || name
          ];
    return {
      manifest: {
        ...definition,
        schema_version: 1,
        classification: "internal",
        snapshot_id: "SNP-" + crypto.randomUUID(),
        captured_at: new Date().toISOString(),
        industry: readIndustry().config.id,
        next_cursor: name === "telemetry" ? rows.at(-1)?.id || after : null,
        row_count: rows.length,
      },
      rows,
    };
  }
  auth.requireRole("admin");
  if (path === "/integrations/config" && body === undefined) return current;
  if (path === "/integrations/config") {
    if (body.expected_revision !== current.revision)
      throw new Error("플러그인 설정이 변경되었습니다.");
    const c = body.config;
    if (
      !["mqtt", "kafka"].includes(c.plugin) ||
      !/[a-zA-Z0-9/_.-]{1,120}/.test(c.topic) ||
      c.endpoint.length > 200 ||
      [c.username_env, c.password_env].some(
        (x) => x && !/^INTEGRATION_[A-Z0-9_]+$/.test(x),
      )
    )
      throw new Error("주소·토픽·인증 환경변수 참조를 확인하세요.");
    if (c.plugin === "mqtt") {
      const u = new URL(c.endpoint);
      if (
        !["mqtt:", "mqtts:"].includes(u.protocol) ||
        !u.hostname ||
        u.username ||
        u.password
      )
        throw new Error("인증정보 없는 mqtt(s)://host:port 주소를 입력하세요.");
    } else if (
      !/^[A-Za-z0-9._:\[\]-]+(,[A-Za-z0-9._:\[\]-]+)*$/.test(c.endpoint)
    )
      throw new Error("Kafka bootstrap host:port 목록을 입력하세요.");
    const next = { revision: current.revision + 1, config: structuredClone(c) };
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  }
  if (path === "/integrations/events") {
    const records = (readSupply() as any).outbox || [];
    return {
      counts: { pending: records.length },
      events: [...records]
        .reverse()
        .slice(0, 100)
        .map((event: any) => ({
          id: event.id,
          status: "pending",
          event,
          attempts: 0,
          last_error: null,
          receipt: null,
        })),
    };
  }
  if (path === "/integrations/dispatch")
    throw new Error(
      "Pages 체험에서는 실제 브로커로 전송하지 않습니다. 서버형 버전에서 플러그인을 설치·연결하세요.",
    );
  throw new Error("연동 기능을 찾을 수 없습니다.");
}
