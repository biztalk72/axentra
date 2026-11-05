import english from "./en.json" with { type: "json" };
import patterns from "./patterns.json" with { type: "json" };
export type Locale = "ko" | "en";
const KEY = "forge-ax-locale";
const listeners = new Set<() => void>();
const valid = (value: unknown): value is Locale =>
  value === "ko" || value === "en";
function initial(): Locale {
  if (typeof window === "undefined") return "ko";
  try {
    const query =
      typeof location !== "undefined"
        ? new URLSearchParams(location.search).get("lang")
        : null;
    if (valid(query)) return query;
    const stored = globalThis.localStorage?.getItem(KEY);
    return valid(stored) ? stored : "ko";
  } catch {
    return "ko";
  }
}
let locale = initial();
export const getLocale = () => locale;
export const intlLocale = () => (locale === "en" ? "en-US" : "ko-KR");
export const subscribeLocale = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function syncDocumentLocale() {
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
    document.title =
      locale === "en"
        ? "FORGE AX · Manufacturing Operations"
        : "FORGE AX · 제조 운영 플랫폼";
  }
}
export function setLocale(next: Locale) {
  if (!valid(next)) return;
  locale = next;
  try {
    if (typeof window !== "undefined")
      globalThis.localStorage?.setItem(KEY, next);
  } catch {
    /* In-memory selection remains usable. */
  }
  syncDocumentLocale();
  listeners.forEach((fn) => fn());
}
const dictionary: Record<string, string> = english;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rules = Object.entries(patterns as Record<string, string>).map(
  ([source, target]) => ({
    regex: new RegExp(
      "^" +
        source
          .split(/\{\d+\}/)
          .map(escape)
          .join("(.*?)") +
        "$",
    ),
    target,
  }),
);
/** Localize presentation strings only. API values, IDs and saved records remain unchanged. */
export function text(value: string): string {
  if (locale === "ko" || !/[가-힣]/.test(value)) return value;
  const key = value.replace(/\s+/g, " ").trim();
  const exact = dictionary[key];
  if (exact !== undefined) return exact;
  for (const rule of rules) {
    const match = key.match(rule.regex);
    if (match)
      return rule.target.replace(/\{(\d+)\}/g, (_, index) =>
        text(match[Number(index) + 1]),
      );
  }
  return value;
}
export function ui<T>(value: T): T {
  if (typeof value === "string") return text(value) as T;
  if (Array.isArray(value)) return value.map(ui) as T;
  return value;
}
if (typeof window !== "undefined")
  window.addEventListener?.("storage", (event) => {
    if (event.key === KEY && valid(event.newValue)) {
      locale = event.newValue;
      syncDocumentLocale();
      listeners.forEach((fn) => fn());
    }
  });
