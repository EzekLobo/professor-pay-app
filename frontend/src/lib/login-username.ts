export const LOGIN_USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export function normalizeLoginUsername(value: string) {
  return value.trim().toLowerCase();
}

export function validLoginUsername(value: string) {
  const username = normalizeLoginUsername(value);
  return LOGIN_USERNAME_PATTERN.test(username) ? username : "";
}

export function isEmailLogin(value: string) {
  return value.includes("@");
}
