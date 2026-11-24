const encoder = new TextEncoder();
const previewCookieName = "__Host-ellejew_preview";
const previewLifetimeSeconds = 30 * 60;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secureEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return mismatch === 0;
}

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return "";
}

async function signature(secret: string, expiresAt: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(`ellejew-preview:${expiresAt}`));
  return bytesToHex(new Uint8Array(signed));
}

export async function createStorePreviewCookie(secret: string) {
  if (secret.length < 32) throw new Error("A segurança da pré-visualização ainda não foi configurada.");
  const expiresAt = Date.now() + previewLifetimeSeconds * 1000;
  const value = `${expiresAt}.${await signature(secret, expiresAt)}`;
  return `${previewCookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${previewLifetimeSeconds}`;
}

export function clearStorePreviewCookie() {
  return `${previewCookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function hasStorePreviewCookie(request: Request, secret: string | undefined) {
  if (!secret || secret.length < 32) return false;
  const [expiresRaw, candidate, ...extra] = readCookie(request, previewCookieName).split(".");
  const expiresAt = Number(expiresRaw);
  if (extra.length || !candidate || !Number.isSafeInteger(expiresAt)) return false;
  const now = Date.now();
  if (expiresAt <= now || expiresAt > now + previewLifetimeSeconds * 1000) return false;
  return secureEqual(candidate, await signature(secret, expiresAt));
}
