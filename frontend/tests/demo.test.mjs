import test from "node:test";
import assert from "node:assert/strict";
const memory = () => {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
};
Object.defineProperty(globalThis, "localStorage", {
  value: memory(),
  configurable: true,
});
Object.defineProperty(globalThis, "sessionStorage", {
  value: memory(),
  configurable: true,
});
const { BrowserDemoAuth, hashDemoPassword, ACCOUNT_KEY, SESSION_KEY } =
  await import("../src/demo-auth.ts");
const { demoApi, demoCSV } = await import("../src/demo.ts");
const { validateRegistration } = await import("../src/auth.ts");
const adminPassword = "TestAdmin!2026";
const admin = {
  id: "admin",
  name: "테스트 관리자",
  email: "admin@admin.com",
  role: "admin",
  password_hash: await hashDemoPassword(adminPassword),
};
const auth = new BrowserDemoAuth(admin);
const request = (path, body) => demoApi(path, body, auth);
const login = () =>
  request("/auth/login", { email: admin.email, password: adminPassword });
const signup = (overrides = {}) => ({
  name: "체험 사용자",
  email: "trial@example.com",
  password: "TrialUser!2026",
  password_confirm: "TrialUser!2026",
  ...overrides,
});

test("anonymous visitors must log in and legacy auto-admin sessions are ignored", async () => {
  sessionStorage.setItem("axentra-token", "public-browser-demo");
  await assert.rejects(request("/auth/me"), (error) => error.status === 401);
  await assert.rejects(request("/overview"), (error) => error.status === 401);
  assert.throws(
    () => demoCSV("/telemetry/export", auth),
    (error) => error.status === 401,
  );
  await assert.rejects(
    request("/auth/login", { email: admin.email, password: "bad" }),
    (error) => error.status === 401,
  );
});

test("Pages demo supports the complete admin manufacturing workflow", async () => {
  await login();
  const initial = await request("/overview");
  assert.equal(initial.assets.length, 8);
  assert.equal(initial.kpis.pending, 1);
  await request("/demo/tick", {});
  assert.equal(
    (await request("/overview")).kpis.events,
    initial.kpis.events + 8,
  );
  const simulation = await request("/simulations", {
    name: "테스트 시나리오",
    line: "A",
    hours: 8,
    cycle_reduction: 15,
    downtime: 5,
    defect_rate: 1.5,
  });
  assert.ok(simulation.optimized > simulation.baseline);
  assert.equal(simulation.bottleneck, "NDL-STEAM");
  const dataset = await request("/datasets", {
    simulation_id: simulation.id,
    samples: 20,
  });
  assert.equal(
    demoCSV(`/datasets/${dataset.id}/download`, auth).split("\n").length,
    21,
  );
  const model = await request("/models/train", {
    name: "온도 감지",
    asset_id: "NDL-STEAM",
    metric: "temperature",
  });
  assert.equal(model.status, "trained");
  await request(`/models/${model.id}/deploy`, {});
  assert.equal(
    typeof (await request(`/models/${model.id}/inference`)).anomaly,
    "boolean",
  );
  assert.equal(
    (
      await request("/recommendations/REC-SEED/decision", {
        decision: "approve",
      })
    ).status,
    "approved",
  );
  assert.equal((await request("/resources/maintenance")).length, 1);
  await assert.rejects(
    request("/recommendations/REC-SEED/decision", { decision: "approve" }),
  );
  const job = await request("/robot-jobs", {
    robot_id: "AMR-001",
    destination: "제면 A라인",
  });
  await assert.rejects(
    request("/robot-jobs", { robot_id: "AMR-001", destination: "출하 구역" }),
  );
  await request(`/robot-jobs/${job.id}/complete`, {});
  const robot = (await request("/resources/robot")).find(
    (row) => row.name === "AMR-001",
  );
  assert.equal(robot.battery, 83);
  assert.equal(robot.location, "제면 A라인");
  assert.ok((await request("/audit")).length >= 8);
  assert.ok(demoCSV("/telemetry/export", auth).startsWith("id,asset_id"));
});

test("signup normalizes identity, hashes password, and automatically logs in as operator", async () => {
  await request("/auth/logout", {});
  const result = await request(
    "/auth/register",
    signup({ name: "  체험 사용자  ", email: " TRIAL@Example.COM " }),
  );
  assert.deepEqual(result.user, {
    name: "체험 사용자",
    email: "trial@example.com",
    role: "operator",
  });
  assert.deepEqual(await request("/auth/me"), result.user);
  const stored = localStorage.getItem(ACCOUNT_KEY);
  assert.ok(!stored.includes("TrialUser!2026"));
  assert.ok(stored.includes("pbkdf2_sha256$600000$"));
  assert.ok((await request("/overview")).assets.length);
  const simulation = await request("/simulations", {
    name: "사용자 실험",
    line: "B",
    hours: 8,
    cycle_reduction: 10,
    downtime: 5,
    defect_rate: 1.5,
  });
  assert.equal(simulation.status, "completed");
  for (const [path, body] of [
    ["/users"],
    ["/audit"],
    ["/connectors", { name: "허용되지 않음" }],
    ["/models/any/deploy", {}],
    ["/recommendations/REC-SEED/decision", { decision: "approve" }],
  ])
    await assert.rejects(request(path, body), (error) => error.status === 403);
});

test("duplicate, reserved, malformed and role-injection registrations are rejected", async () => {
  await assert.rejects(
    request("/auth/register", signup({ email: "TRIAL@example.com" })),
    (error) => error.status === 409,
  );
  await assert.rejects(
    request("/auth/register", signup({ email: "admin@admin.com" })),
    (error) => error.status === 409,
  );
  for (const changes of [
    { password_confirm: "Mismatch1!" },
    { name: "  " },
    { email: "invalid" },
    { email: ".wrong@example.com" },
    { password: "abcdefgh", password_confirm: "abcdefgh" },
    { role: "admin" },
  ])
    assert.throws(() => validateRegistration(signup(changes)));
});

test("logout invalidates session and a saved account can log in after reload", async () => {
  await request("/auth/logout", {});
  await assert.rejects(request("/auth/me"), (error) => error.status === 401);
  await assert.rejects(
    request("/auth/login", { email: "trial@example.com", password: "wrong" }),
  );
  const reloaded = new BrowserDemoAuth(admin);
  const result = await reloaded.login({
    email: " TRIAL@EXAMPLE.COM ",
    password: "TrialUser!2026",
  });
  assert.equal(result.user.role, "operator");
  assert.equal(reloaded.current().name, "체험 사용자");
  const session = JSON.parse(sessionStorage.getItem(SESSION_KEY));
  session.expiresAt = Date.now() - 1;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  assert.throws(
    () => reloaded.current(),
    (error) => error.status === 401,
  );
});

test("administrator sees registered users and their registration audit without password hashes", async () => {
  await login();
  const users = await request("/users");
  assert.ok(
    users.some(
      (user) => user.email === "trial@example.com" && user.role === "operator",
    ),
  );
  assert.ok(users.every((user) => !("password_hash" in user)));
  assert.ok(
    (await request("/audit")).some(
      (row) =>
        row.action === "auth.register" && row.actor === "trial@example.com",
    ),
  );
});
