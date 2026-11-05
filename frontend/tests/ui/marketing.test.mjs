import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { createServer } from "vite";
import { readFile } from "node:fs/promises";

test("brand website switches products and language, preserves language on every demo link, and supports keyboard tabs", async () => {
  const window = new Window({ url: "https://biztalk72.github.io/axentra/" });
  for (const key of [
    "window",
    "document",
    "location",
    "history",
    "localStorage",
    "sessionStorage",
  ])
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === "window" ? window : window[key],
    });
  document.write(await readFile("index.html", "utf8"));
  localStorage.setItem("forge-ax-locale", "en");
  const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    root: process.cwd(),
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: "custom",
  });
  try {
    await server.ssrLoadModule("/src/marketing.ts");
    assert.equal(document.documentElement.lang, "en");
    assert.match(document.title, /Axentra.*Connect manufacturing/);
    assert.equal(localStorage.getItem("forge-ax-locale"), null);
    for (const link of document.querySelectorAll("[data-demo]")) {
      const url = new URL(link.href);
      assert.equal(url.pathname, "/axentra/demo.html");
      assert.equal(url.searchParams.get("lang"), "en");
    }
    const agents = document.getElementById("tab-agents");
    agents.click();
    assert.match(
      document.getElementById("product-description").textContent,
      /Twenty specialist agents/,
    );
    assert.equal(agents.getAttribute("aria-selected"), "true");
    agents.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    assert.equal(document.activeElement.id, "tab-panel");
    assert.equal(
      document.getElementById("product-detail").getAttribute("aria-labelledby"),
      "tab-panel",
    );
    const language = document.getElementById("site-language");
    language.value = "ko";
    language.dispatchEvent(new window.Event("change", { bubbles: true }));
    assert.equal(document.documentElement.lang, "ko");
    assert.equal(localStorage.getItem("axentra-locale"), "ko");
    assert.match(
      document.getElementById("product-title").textContent,
      /필요한 정보를/,
    );
    assert.equal(
      document.querySelector('[data-demo][href*="#supply"]').hash,
      "#supply",
    );
    assert.equal(document.querySelectorAll('a[href="#"]').length, 0);
    assert.equal(/FORGE/.test(document.body.textContent), false);
  } finally {
    await server.close();
    await window.happyDOM.close();
  }
});
