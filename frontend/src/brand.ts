export const BRAND = "Axentra";
export const BRAND_TAGLINE = "제조의 흐름을 연결하고, 실행을 지능화하다.";
export const BRAND_TAGLINE_EN =
  "Connect manufacturing. Power intelligent execution.";

/** Move browser records once, preserving accounts and settings on the same origin. */
export function brandStorageKey(
  key: string,
  scope: "local" | "session" = "local",
): string {
  if (typeof window === "undefined") return key;
  const legacy =
    key.startsWith("axentra-token") || key.startsWith("axentra-panel-")
      ? key.replace(/^axentra/, "forge")
      : key.replace(/^axentra/, "forge-ax");
  if (legacy === key) return key;
  try {
    const storage =
      scope === "local" ? globalThis.localStorage : globalThis.sessionStorage;
    if (!storage) return key;
    const previous = storage.getItem(legacy);
    if (storage.getItem(key) === null && previous !== null)
      storage.setItem(key, previous);
    // Remove only after a successful copy; logout must never resurrect a legacy session.
    if (storage.getItem(key) !== null) storage.removeItem(legacy);
  } catch {
    // If storage is read-only, existing readers may still use their original records.
    try {
      const storage =
        scope === "local" ? globalThis.localStorage : globalThis.sessionStorage;
      if (storage?.getItem(key) === null && storage?.getItem(legacy) !== null)
        return legacy;
    } catch {
      /* Storage is unavailable; callers retain their normal error handling. */
    }
  }
  return key;
}

export function brandPlantName(name: string): string {
  if (name === "FORGE 라면 스마트팩토리") return "Axentra 라면 스마트팩토리";
  if (name === "FORGE 제조 워크스페이스") return "Axentra 제조 워크스페이스";
  return name;
}
