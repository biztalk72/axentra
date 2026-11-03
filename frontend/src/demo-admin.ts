// Public browser-demo credential verifier. This is not server authentication.
export const DEMO_ADMIN = {
  id: "admin",
  name: "관리자",
  email: "admin@admin.com",
  role: "admin",
  password_hash:
    "pbkdf2_sha256$600000$33749c41e72e887959fb53000eca429c$3c8ff15eac4f33000f8c99c113890c192d1389386a8317c7eaf93c15c6d76ad9",
} as const;
