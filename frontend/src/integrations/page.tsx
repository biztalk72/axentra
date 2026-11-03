import { useEffect, useState } from "react";
import {
  Cable,
  Database,
  Download,
  Plug,
  RefreshCw,
  Save,
  Send,
  Workflow,
} from "lucide-react";
import { api, STATIC_DEMO, date } from "../api";
import { defaultIntegration } from "./demo";
export function IntegrationsPage({ admin }: { admin: boolean }) {
  const [catalog, setCatalog] = useState<any>(null),
    [config, setConfig] = useState(defaultIntegration),
    [draft, setDraft] = useState(defaultIntegration.config),
    [events, setEvents] = useState<any>({ counts: {}, events: [] }),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setCatalog(await api("/integrations/catalog"));
      if (admin) {
        const [c, e] = await Promise.all([
          api<typeof defaultIntegration>("/integrations/config"),
          api("/integrations/events"),
        ]);
        setConfig(c);
        setDraft(c.config);
        setEvents(e);
      }
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [admin]);
  async function download(dataset: string, metadata = false) {
    setBusy(true);
    setError("");
    try {
      const result = await api<any>("/integrations/export/" + dataset);
      const text = metadata
        ? JSON.stringify(result.manifest, null, 2)
        : result.rows.map((r: any) => JSON.stringify(r)).join("\n") + "\n";
      const url = URL.createObjectURL(
        new Blob([text], {
          type: metadata ? "application/json" : "application/x-ndjson",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `forge-${dataset}-${result.manifest.snapshot_id}.${metadata ? "manifest.json" : "jsonl"}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        `${result.manifest.row_count}개 레코드 ${metadata ? "메타데이터" : "JSONL"}를 추출했습니다.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DATA GOVERNANCE & LAKEHOUSE READINESS</div>
          <h1>공장 데이터를 연결 가능한 제품으로.</h1>
          <p>스키마·소유자·계보·품질 계약과 전송 대기열을 함께 관리합니다.</p>
        </div>
        <button className="btn" onClick={() => void load()}>
          <RefreshCw size={14} />
          새로고침
        </button>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="field-success" role="status">
          {message}
        </div>
      )}
      <div className="integration-flow">
        <span>
          <Database size={21} />
          제조·공급망 원장
        </span>
        <b>→</b>
        <span>
          <Workflow size={21} />
          표준 이벤트 · Outbox
        </span>
        <b>→</b>
        <span>
          <Cable size={21} />
          MQTT / Kafka / MCP
        </span>
        <b>→</b>
        <span>
          <Database size={21} />
          거버넌스 · 레이크하우스
        </span>
      </div>
      <div className="integration-plugin-grid">
        {catalog?.plugins.map((p: any) => (
          <article className="panel" key={p.id}>
            <Plug size={23} />
            <h3>{p.name}</h3>
            <span
              className={`lot-status ${p.installed ? "released" : "quarantine"}`}
            >
              {p.installed
                ? "선택 패키지 설치됨"
                : "어댑터 준비 · 패키지 미설치"}
            </span>
            <p>{p.mode}</p>
            <small>{p.package}</small>
          </article>
        ))}
      </div>
      <p className="field-dialog-description">
        패키지 설치는 브로커 연결 성공을 의미하지 않습니다. 전송 완료는 실제
        수신 확인 후에만 기록합니다. MCP는 별도 읽기 전용 프로세스로 제공합니다.
      </p>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>데이터 제품 카탈로그</h2>
            <p>
              UTC 시각 · 소수 3자리 기준 단위 · internal 분류 · 이벤트 ID 중복
              제거 계약
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>데이터 제품</th>
                <th>소유자 / 분류</th>
                <th>레코드 기준 / 키</th>
                <th>입력 계보</th>
                <th>추출</th>
              </tr>
            </thead>
            <tbody>
              {catalog?.datasets.map((d: any) => (
                <tr key={d.id}>
                  <td>
                    <b>{d.name}</b>
                    <small className="block muted">
                      {d.id} · schema v{d.schema_version}
                    </small>
                  </td>
                  <td>
                    {d.owner}
                    <small className="block muted">{d.classification}</small>
                  </td>
                  <td>
                    {d.grain}
                    <small className="block muted">
                      {d.primary_key.join(" + ")}
                    </small>
                  </td>
                  <td>{d.lineage.join(", ") || "마스터 데이터"}</td>
                  <td>
                    <div className="agent-run-actions">
                      <button
                        className="btn small-btn"
                        disabled={busy}
                        onClick={() => void download(d.id)}
                      >
                        <Download size={13} />
                        JSONL
                      </button>
                      <button
                        className="btn small-btn"
                        disabled={busy}
                        onClick={() => void download(d.id, true)}
                      >
                        메타데이터
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {admin && (
        <div className="integration-config-grid">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>전송 플러그인 설정</h2>
                <p>
                  활성 전송 경로 하나를 선택합니다. 인증정보는 서버 환경변수로
                  참조합니다.
                </p>
              </div>
            </div>
            <form
              className="form-body"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const next = await api<typeof defaultIntegration>(
                    "/integrations/config",
                    { expected_revision: config.revision, config: draft },
                  );
                  setConfig(next);
                  setDraft(next.config);
                  setMessage(
                    "전송 설정을 저장했습니다. 실제 연결은 전송 시 확인합니다.",
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                플러그인
                <select
                  value={draft.plugin}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      plugin: e.target.value,
                      endpoint:
                        e.target.value === "mqtt"
                          ? "mqtts://localhost:8883"
                          : "localhost:9092",
                    })
                  }
                >
                  <option value="mqtt">MQTT · QoS 1</option>
                  <option value="kafka">Kafka · delivery ACK</option>
                </select>
              </label>
              <label>
                브로커 주소
                <input
                  required
                  value={draft.endpoint}
                  maxLength={200}
                  onChange={(e) =>
                    setDraft({ ...draft, endpoint: e.target.value })
                  }
                />
              </label>
              <label>
                토픽
                <input
                  required
                  value={draft.topic}
                  maxLength={120}
                  onChange={(e) =>
                    setDraft({ ...draft, topic: e.target.value })
                  }
                />
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) =>
                    setDraft({ ...draft, enabled: e.target.checked })
                  }
                />
                전송 플러그인 사용
              </label>
              {draft.plugin === "kafka" && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={draft.tls}
                    onChange={(e) =>
                      setDraft({ ...draft, tls: e.target.checked })
                    }
                  />
                  TLS 사용
                </label>
              )}
              <label>
                사용자명 환경변수
                <input
                  value={draft.username_env}
                  placeholder="INTEGRATION_BROKER_USERNAME"
                  onChange={(e) =>
                    setDraft({ ...draft, username_env: e.target.value })
                  }
                />
              </label>
              <label>
                암호 환경변수
                <input
                  value={draft.password_env}
                  placeholder="INTEGRATION_BROKER_PASSWORD"
                  onChange={(e) =>
                    setDraft({ ...draft, password_env: e.target.value })
                  }
                />
              </label>
              <button className="btn primary" disabled={busy}>
                <Save size={14} />
                플러그인 설정 저장
              </button>
            </form>
          </section>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>전송 대기열</h2>
                <p>업무 저장과 같은 DB 트랜잭션에 이벤트를 기록합니다.</p>
              </div>
            </div>
            <div className="form-body">
              <div className="integration-counts">
                {[
                  ["pending", "대기"],
                  ["failed", "실패"],
                  ["delivered", "수신 확인"],
                ].map(([id, label]) => (
                  <span key={id}>
                    <small>{label}</small>
                    <b>{events.counts[id] || 0}</b>
                  </span>
                ))}
              </div>
              <p className="field-dialog-description">
                전송은 최소 한 번(at-least-once) 의미입니다. 수신 시스템은
                event.id로 중복 제거해야 합니다. 실패한 이벤트는 원본을 보관하고
                재시도합니다.
              </p>
              <button
                className="btn"
                disabled={busy || !config.config.enabled || STATIC_DEMO}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const r = await api<any>("/integrations/dispatch", {
                      limit: 1,
                    });
                    await load();
                    setMessage(
                      r.results.length
                        ? "전송 결과를 대기열에서 확인하세요."
                        : "전송할 이벤트가 없습니다.",
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Send size={14} />
                대기 이벤트 1건 전송·재시도
              </button>
              {STATIC_DEMO && (
                <p className="field-dialog-description">
                  Pages는 전송 대기열 체험입니다. 실제 브로커 전송은 서버형에서
                  사용합니다.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
      {admin && (
        <section className="panel">
          <div className="panel-header">
            <h2>최근 이벤트 · 전달 결과</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>이벤트</th>
                  <th>대상 / 시각</th>
                  <th>상태</th>
                  <th>시도 / 오류</th>
                </tr>
              </thead>
              <tbody>
                {events.events.map((e: any) => (
                  <tr key={e.id}>
                    <td>
                      {e.event.type}
                      <small className="block muted">{e.id}</small>
                    </td>
                    <td>
                      {e.event.subject}
                      <small className="block muted">
                        {date(e.event.time)}
                      </small>
                    </td>
                    <td>
                      <span
                        className={`lot-status ${e.status === "delivered" ? "released" : e.status === "failed" ? "blocked" : "quarantine"}`}
                      >
                        {e.status === "delivered"
                          ? "수신 확인"
                          : e.status === "failed"
                            ? "전송 실패"
                            : "대기"}
                      </span>
                    </td>
                    <td>
                      {e.attempts}회 · {e.last_error || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!events.events.length && (
              <div className="agent-empty">
                입고·이동·생산 또는 실제 수집 요청이 발생하면 이벤트를
                기록합니다.
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
