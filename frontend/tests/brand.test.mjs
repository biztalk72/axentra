import test from "node:test";
import assert from "node:assert/strict";
import { brandStorageKey, brandPlantName } from "../src/brand.ts";

test("brand migration preserves accounts, custom names and settings without reviving logged-out sessions", () => {
  const memory = () => {
    const entries = new Map();
    return {
      getItem: (k) => entries.get(k) ?? null,
      setItem: (k, v) => entries.set(k, String(v)),
      removeItem: (k) => entries.delete(k),
    };
  };
  globalThis.window = {};
  const local = memory(),
    session = memory();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: local,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: session,
  });
  local.setItem(
    "forge-ax-demo-accounts-v2",
    '[{"email":"trial@example.com","password_hash":"unchanged"}]',
  );
  assert.equal(
    brandStorageKey("axentra-demo-accounts-v2"),
    "axentra-demo-accounts-v2",
  );
  assert.equal(
    JSON.parse(local.getItem("axentra-demo-accounts-v2"))[0].password_hash,
    "unchanged",
  );
  assert.equal(local.getItem("forge-ax-demo-accounts-v2"), null);
  local.setItem("forge-ax-locale", "ko");
  local.setItem("axentra-locale", "en");
  brandStorageKey("axentra-locale");
  assert.equal(local.getItem("axentra-locale"), "en");
  assert.equal(local.getItem("forge-ax-locale"), null);
  session.setItem("forge-token", "existing-session");
  const key = brandStorageKey("axentra-token", "session");
  assert.equal(session.getItem(key), "existing-session");
  session.removeItem(key);
  brandStorageKey("axentra-token", "session");
  assert.equal(session.getItem(key), null);
  session.setItem("forge-panel-PANEL-A-TV", "device-key");
  assert.equal(
    session.getItem(brandStorageKey("axentra-panel-PANEL-A-TV", "session")),
    "device-key",
  );
  assert.equal(
    brandPlantName("FORGE 라면 스마트팩토리"),
    "Axentra 라면 스마트팩토리",
  );
  assert.equal(brandPlantName("Customer factory"), "Customer factory");
  delete globalThis.window;
});
