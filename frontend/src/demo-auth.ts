import type { User } from "./api.ts";
import { ADMIN_EMAIL, normalizeEmail, validateRegistration } from "./auth.ts";
import type { Registration } from "./auth.ts";
import { DEMO_ADMIN } from "./demo-admin.ts";
export const ACCOUNT_KEY = "forge-ax-demo-accounts-v2";
export const SESSION_KEY = "forge-ax-demo-session-v2";
export type DemoAccount = User & { id: string; password_hash: string };
type Session = {
  accountId: string;
  token: string;
  expiresAt: number;
  credentialVersion: string;
};
export class DemoAuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
export async function hashDemoPassword(
  password: string,
  salt = hex(crypto.getRandomValues(new Uint8Array(16))),
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const saltBytes = Uint8Array.from(salt.match(/../g) || [], (h) =>
    parseInt(h, 16),
  );
  const digest = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: 600000 },
    key,
    256,
  );
  return `pbkdf2_sha256$600000$${salt}$${hex(new Uint8Array(digest))}`;
}
export class BrowserDemoAuth {
  private admin: DemoAccount;
  constructor(admin: DemoAccount = DEMO_ADMIN) {
    this.admin = admin;
  }
  private accounts(): DemoAccount[] {
    try {
      const raw = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "[]");
      if (!Array.isArray(raw)) throw new Error();
      return [
        this.admin,
        ...raw
          .filter(
            (a: DemoAccount) =>
              a &&
              typeof a.id === "string" &&
              a.id !== "admin" &&
              typeof a.name === "string" &&
              typeof a.email === "string" &&
              a.email !== this.admin.email &&
              typeof a.password_hash === "string",
          )
          .map((a: DemoAccount) => ({ ...a, role: "operator" as const })),
      ];
    } catch {
      throw new DemoAuthError(
        503,
        "체험 계정 저장소를 읽을 수 없습니다. 브라우저의 사이트 저장 권한을 확인하세요.",
      );
    }
  }
  private publicUser(account: DemoAccount): User {
    return { name: account.name, email: account.email, role: account.role };
  }
  private startSession(account: DemoAccount) {
    const session: Session = {
      accountId: account.id,
      token: crypto.randomUUID(),
      expiresAt: Date.now() + 8 * 3600000,
      credentialVersion: account.password_hash,
    };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      throw new DemoAuthError(503, "브라우저 세션 저장을 허용해 주세요.");
    }
    return {
      access_token: session.token,
      token_type: "demo",
      user: this.publicUser(account),
    };
  }
  current(): User {
    let session: Session | null = null;
    try {
      session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    } catch {
      /* invalid sessions require login */
    }
    if (
      !session ||
      !session.token ||
      !Number.isFinite(session.expiresAt) ||
      session.expiresAt <= Date.now()
    ) {
      sessionStorage.removeItem(SESSION_KEY);
      throw new DemoAuthError(
        401,
        "로그인이 필요하거나 세션이 만료되었습니다.",
      );
    }
    const account = this.accounts().find((a) => a.id === session.accountId);
    if (!account || account.password_hash !== session.credentialVersion) {
      sessionStorage.removeItem(SESSION_KEY);
      throw new DemoAuthError(
        401,
        "계정 정보가 변경되었습니다. 다시 로그인하세요.",
      );
    }
    return this.publicUser(account);
  }
  requireRole(...allowed: User["role"][]): User {
    const user = this.current();
    if (!allowed.includes(user.role))
      throw new DemoAuthError(403, "이 작업은 관리자 권한이 필요합니다.");
    return user;
  }
  async register(input: Registration) {
    const body = validateRegistration(input);
    if (
      [ADMIN_EMAIL, this.admin.email, "admin@forge.local"].includes(body.email)
    )
      throw new DemoAuthError(
        409,
        "관리자 전용 이메일입니다. 다른 이메일을 사용하세요.",
      );
    if (this.accounts().some((a) => a.email === body.email))
      throw new DemoAuthError(
        409,
        "이미 가입된 이메일입니다. 로그인해 주세요.",
      );
    const account: DemoAccount = {
      id: crypto.randomUUID(),
      name: body.name,
      email: body.email,
      role: "operator",
      password_hash: await hashDemoPassword(body.password),
    };
    const current = this.accounts();
    if (current.some((a) => a.email === body.email))
      throw new DemoAuthError(
        409,
        "이미 가입된 이메일입니다. 로그인해 주세요.",
      );
    try {
      localStorage.setItem(
        ACCOUNT_KEY,
        JSON.stringify([...current.filter((a) => a.id !== "admin"), account]),
      );
    } catch {
      throw new DemoAuthError(
        503,
        "체험 계정을 저장하지 못했습니다. 브라우저의 사이트 저장 권한을 확인하세요.",
      );
    }
    return this.startSession(account);
  }
  async login(input: { email: string; password: string }) {
    const email = normalizeEmail(input.email);
    const account = this.accounts().find((a) => a.email === email);
    // Derive even for unknown accounts to keep the login path consistent.
    const expected = account?.password_hash || this.admin.password_hash;
    const actual = await hashDemoPassword(
      input.password,
      expected.split("$")[2],
    );
    if (!account || actual !== expected)
      throw new DemoAuthError(401, "이메일 또는 비밀번호를 확인하세요.");
    return this.startSession(account);
  }
  logout() {
    sessionStorage.removeItem(SESSION_KEY);
    return { ok: true };
  }
  listUsers() {
    this.requireRole("admin");
    return this.accounts()
      .map((a) => this.publicUser(a))
      .sort((a, b) => a.email.localeCompare(b.email));
  }
}
export const demoAuth = new BrowserDemoAuth();
