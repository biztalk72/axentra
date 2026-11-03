export const ADMIN_EMAIL = "admin@admin.com";
export const PASSWORD_HINT = "8~128자, 영문과 숫자를 포함해 주세요.";
export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (
    email.length > 200 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(
      email,
    ) ||
    email.includes("..") ||
    email.startsWith(".") ||
    email.split("@")[0].endsWith(".")
  )
    throw new Error("올바른 이메일 주소를 입력하세요.");
  return email;
}
export type Registration = {
  name: string;
  email: string;
  password: string;
  password_confirm: string;
};
export function validateRegistration(input: Registration): Registration {
  const allowed = ["name", "email", "password", "password_confirm"];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new Error("허용되지 않은 가입 정보입니다.");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60)
    throw new Error("이름은 2~60자로 입력하세요.");
  const email = normalizeEmail(input.email);
  if (
    input.password.length < 8 ||
    input.password.length > 128 ||
    !/[A-Za-z]/.test(input.password) ||
    !/[0-9]/.test(input.password)
  )
    throw new Error("비밀번호는 8~128자이며 영문과 숫자를 포함해야 합니다.");
  if (input.password !== input.password_confirm)
    throw new Error("비밀번호 확인이 일치하지 않습니다.");
  return { ...input, name, email };
}
