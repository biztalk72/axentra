import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { createServer } from "vite";
import { readFile } from "node:fs/promises";

// In-memory DOM tests: no browser, hardware camera or remote factory is accessed.
test("English login persists through navigation; published panel viewer stays read-only and device camera waits for consent", async () => {
  const window = new Window({ url: "http://localhost/" });
  for (const key of [
    "window",
    "document",
    "navigator",
    "location",
    "history",
    "localStorage",
    "sessionStorage",
    "HTMLElement",
    "HTMLInputElement",
    "Event",
    "MouseEvent",
    "Node",
    "ResizeObserver",
  ])
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === "window" ? window : window[key],
    });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.isSecureContext = true;
  let cameraRequests = 0;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => {
        cameraRequests++;
        throw new DOMException("not allowed", "NotAllowedError");
      },
      addEventListener() {},
      removeEventListener() {},
    },
  });
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    server: { middlewareMode: true, watch: null },
    appType: "custom",
    plugins: [(await import("@vitejs/plugin-react")).default()],
  });
  const rootNode = document.createElement("div");
  document.body.append(rootNode);
  let root;
  const requests = [];
  try {
    const { makeConfig, buildPanelSnapshot } = await server.ssrLoadModule(
      "/src/panel-model.ts",
    );
    const { readSupply } = await server.ssrLoadModule("/src/supply/demo.ts");
    const profiles = JSON.parse(
      await readFile("src/supply/profiles.json", "utf8"),
    );
    const catalog = JSON.parse(
      await readFile("src/agent-modules/catalog.json", "utf8"),
    );
    const assets = JSON.parse(
      await readFile("src/supply/assets.json", "utf8"),
    ).map((a) => ({
      ...a,
      status: "running",
      produced: 100,
      rejected: 1,
      updated_at: new Date().toISOString(),
    }));
    const panels = ["A", "B"].map((line) => {
      const config = { ...makeConfig(line), name: `${line}라인 생산 전광판` };
      return {
        id: `PANEL-${line}-TV`,
        draft: config,
        published: config,
        revision: 1,
        published_revision: 1,
        connection: "unpaired",
      };
    });
    const source = { assets, events: [], resources: {} };
    const response = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    globalThis.fetch = async (input, init = {}) => {
      const path = String(input);
      requests.push({
        path,
        method: init.method || "GET",
        authorization: init.headers?.Authorization,
      });
      if (path === "/api/auth/me")
        return init.headers?.Authorization
          ? response({
              name: "QA Operator",
              email: "qa@example.com",
              role: "operator",
            })
          : response({ detail: "로그인이 필요합니다." }, 401);
      if (path === "/health")
        return response({ registration_enabled: true, status: "ok" });
      if (path === "/api/auth/logout") return response({ ok: true });
      if (path === "/api/auth/login")
        return response({
          access_token: "dom-test-session",
          user: {
            name: "QA Operator",
            email: "qa@example.com",
            role: "operator",
          },
        });
      if (path === "/api/industry")
        return response({
          revision: 1,
          config: profiles[0],
          templates: profiles,
        });
      if (path === "/api/overview")
        return response({
          assets,
          kpis: {
            equipment_health: 98,
            quality: 99,
            produced: 800,
            rejected: 8,
            running: 8,
            total_assets: 8,
            events: 24,
            pending: 0,
          },
          series: [
            {
              time: new Date().toISOString(),
              good: 10,
              rejected: 0,
              temperature: 42,
            },
          ],
          alerts: [],
          server_time: new Date().toISOString(),
          demo: true,
        });
      if (path === "/api/agent-widgets/layout")
        return response({ enabled: true, line: "A", module_ids: [] });
      if (path.startsWith("/api/agent-widgets/results")) return response([]);
      if (path === "/api/cameras") return response([]);
      if (path === "/api/cctv/layout")
        return response({
          enabled: true,
          minimized: false,
          camera_ids: [],
          layout: "grid",
        });
      if (path === "/api/panels") return response(panels);
      if (path === "/api/agents/modules") return response(catalog);
      if (path === "/api/supply") return response(readSupply());
      const display = path.match(/^\/api\/panels\/(PANEL-[AB]-TV)\/display$/);
      if (display) {
        const panel = panels.find((p) => p.id === display[1]);
        return response(
          buildPanelSnapshot(
            source,
            panel.published,
            panel.id,
            1,
            "published",
            [],
          ),
        );
      }
      throw new Error("Unexpected UI request: " + path);
    };
    const { ExperienceRoot } = await server.ssrLoadModule("/src/main.tsx");
    const settle = () =>
      React.act(async () => {
        await new Promise((r) => setTimeout(r, 40));
      });
    const click = async (element) => {
      assert.ok(element, "Expected clickable UI element");
      await React.act(async () => {
        element.click();
      });
      await settle();
    };
    const button = (label) =>
      Array.from(document.querySelectorAll("button")).find(
        (b) =>
          b.textContent.trim() === label ||
          b.getAttribute("aria-label") === label,
      );
    await React.act(async () => {
      root = createRoot(rootNode);
      root.render(React.createElement(ExperienceRoot));
    });
    await settle();
    assert.match(document.body.textContent, /워크스페이스에 오신/);
    const language = document.querySelector(".language-selector select");
    await React.act(async () => {
      language.value = "en";
      language.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    assert.match(document.body.textContent, /Welcome to your workspace/);
    assert.equal(document.documentElement.lang, "en");
    assert.equal(localStorage.getItem("forge-ax-locale"), "en");
    for (const [selector, value] of [
      ["input[type=email]", "qa@example.com"],
      ["input[type=password]", "DemoOnly!2026"],
    ]) {
      await React.act(async () => {
        const input = document.querySelector(selector);
        Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        ).set.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
      });
    }
    await React.act(async () =>
      document
        .querySelector("form")
        .dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    await settle();
    assert.match(
      document.body.textContent,
      /Manufacturing operations overview/,
    );
    assert.match(document.body.textContent, /Equipment operations map/);
    assert.match(document.body.textContent, /Operational assessment & actions/);
    const untranslated =
      (document.body.textContent || "").match(/[가-힣][가-힣\s·.,()0-9%-]*/g) ||
      [];
    assert.deepEqual(
      untranslated.filter((s) => s.trim() !== "한국어"),
      [],
      "Unexpected Korean dashboard strings: " + untranslated.join(" | "),
    );
    await click(button("Show device camera"));
    assert.equal(cameraRequests, 0);
    assert.ok(document.querySelector(".cctv-grid.single-camera"));
    assert.match(document.body.textContent, /Start camera/);
    // In-memory permission denial only; no real permission prompt or camera is opened.
    await click(button("Start camera"));
    assert.equal(cameraRequests, 1);
    assert.match(document.body.textContent, /Camera permission was denied/);
    await click(button("Panel Viewer"));
    assert.match(document.body.textContent, /Shopfloor panel monitoring/);
    assert.equal(document.querySelectorAll(".viewer-panel-card").length, 2);
    assert.equal(
      requests.filter((r) =>
        /heartbeat|\/events|\/draft|\/publish/.test(r.path),
      ).length,
      0,
    );
    const standalone = document.querySelector(".viewer-panel-card a");
    assert.equal(standalone.getAttribute("target"), null);
    assert.match(standalone.getAttribute("href"), /\?view=monitor$/);
    sessionStorage.setItem("forge-panel-PANEL-A-TV", "expired-device-test");
    await click(standalone);
    await settle();
    assert.ok(document.querySelector(".panel-standalone"));
    assert.match(document.body.textContent, /Read-only view/);
    assert.equal(
      requests.filter((r) => /PANEL-A-TV\/display/.test(r.path)).at(-1)
        .authorization,
      "Bearer dom-test-session",
    );
    assert.equal(
      requests.filter((r) => /heartbeat|\/events/.test(r.path)).length,
      0,
    );
    await click(document.querySelector(".panel-player-toolbar a"));
    await settle();
    await click(button("Process & inventory"));
    assert.match(document.body.textContent, /Ramen manufacturing/);
    assert.match(document.body.textContent, /Wheat flour/);
    const accountName = document.querySelector(".user-profile");
    assert.match(accountName.textContent, /QA Operator/);
    await click(accountName);
    assert.match(document.body.textContent, /Welcome to your workspace/);
    assert.equal(localStorage.getItem("forge-ax-locale"), "en");
  } finally {
    if (root) await React.act(async () => root.unmount());
    await server.close();
    await window.happyDOM.close();
  }
});
