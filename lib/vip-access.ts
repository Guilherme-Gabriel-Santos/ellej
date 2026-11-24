/** Acesso antecipado do grupo VIP: cookie derivado de VIP_ACCESS_TOKEN e senha compartilhada (VIP_PASSWORD). */
const encoder = new TextEncoder();

export const VIP_COOKIE_NAME = "__Host-ellejew_vip";
export const MIN_VIP_TOKEN_LENGTH = 32;
export const MIN_VIP_PASSWORD_LENGTH = 6;

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqualText(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return mismatch === 0;
}

export function vipCookieValue(token: string) {
  return sha256Hex(`ellejew-vip:${token}`);
}

/** Senha digitada no celular: ignora espaços e maiúsculas/minúsculas. */
export function normalizeVipPassword(value: unknown) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, "").toUpperCase().slice(0, 64);
}

export async function vipPasswordMatches(supplied: unknown, configured: unknown) {
  const expected = normalizeVipPassword(configured);
  if (expected.length < MIN_VIP_PASSWORD_LENGTH) return false;
  const [a, b] = await Promise.all([sha256Hex(`vip-password:${normalizeVipPassword(supplied)}`), sha256Hex(`vip-password:${expected}`)]);
  return timingSafeEqualText(a, b);
}

/** O cookie vale até 1 hora depois da abertura pública. */
export async function vipCookieHeader(token: string, publicLaunchAt: string | undefined) {
  const parsed = Date.parse(String(publicLaunchAt ?? ""));
  const publicAt = Number.isFinite(parsed) ? parsed : Date.now() + 86_400_000;
  const expires = new Date(publicAt + 3_600_000).toUTCString();
  return `${VIP_COOKIE_NAME}=${await vipCookieValue(token)}; Path=/; Expires=${expires}; HttpOnly; Secure; SameSite=Lax`;
}
