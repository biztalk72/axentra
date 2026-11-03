import { useSyncExternalStore } from "react";
import { api } from "./api.ts";
import { industryTemplates } from "./supply/industry-demo.ts";
import type { IndustryState } from "./supply/industry-demo.ts";
let current: IndustryState = {
  revision: 1,
  config: structuredClone(industryTemplates[0]),
  templates: industryTemplates,
};
const subscribe = (fn: () => void) => {
  window.addEventListener("industry-updated", fn);
  return () => window.removeEventListener("industry-updated", fn);
};
export function setIndustry(next: IndustryState) {
  current = next;
  window.dispatchEvent(new Event("industry-updated"));
}
export const loadIndustry = () =>
  api<IndustryState>("/industry").then(setIndustry);
export const useIndustry = () => useSyncExternalStore(subscribe, () => current);
export const lineLabel = (id: string) =>
  current.config.lines.find((l) => l.id === id)?.name || id + "라인";
