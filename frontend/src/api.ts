import { demoApi, demoCSV } from "./demo";
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === "true";
export type User = {
  name: string;
  email: string;
  role: "admin" | "operator" | "viewer";
};
export type Asset = {
  id: string;
  name: string;
  kind: string;
  line: string;
  status: string;
  cycle_time: number;
  temperature: number;
  vibration: number;
  produced: number;
  rejected: number;
  updated_at: string;
};
export type Resource = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  [key: string]: any;
};
export type Overview = {
  assets: Asset[];
  kpis: {
    equipment_health: number;
    quality: number;
    produced: number;
    rejected: number;
    running: number;
    total_assets: number;
    events: number;
    pending: number;
  };
  series: {
    time: string;
    good: number;
    rejected: number;
    temperature: number;
  }[];
  alerts: Resource[];
  server_time: string;
  demo: boolean;
};
let token = sessionStorage.getItem("forge-token") || "";
export function setToken(value: string) {
  token = value;
  value
    ? sessionStorage.setItem("forge-token", value)
    : sessionStorage.removeItem("forge-token");
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (STATIC_DEMO) return demoApi<T>(path, body);
  const response = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const detail = await response
      .json()
      .catch(() => ({ detail: "서버에 연결할 수 없습니다." }));
    if (response.status === 401 && token && !path.includes("login")) {
      setToken("");
      window.dispatchEvent(new Event("session-expired"));
    }
    throw new Error(
      typeof detail.detail === "string"
        ? detail.detail
        : "입력값을 확인하세요. 허용 범위를 벗어난 값이 있습니다.",
    );
  }
  return response.json();
}
export async function download(path: string, filename: string) {
  if (STATIC_DEMO) {
    const url = URL.createObjectURL(
      new Blob([demoCSV(path)], { type: "text/csv" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const response = await fetch("/api" + path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok)
    throw new Error("파일을 내려받을 수 없습니다. 세션을 확인하세요.");
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const num = (n: number) => new Intl.NumberFormat("ko-KR").format(n);
export const time = (s: string) =>
  new Date(s).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
export const date = (s: string) =>
  new Date(s).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
