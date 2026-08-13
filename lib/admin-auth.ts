import { env } from "cloudflare:workers";
import { ensureStoreSchema, getD1 } from "./store";
export { assertSameOrigin } from "./security";

const encoder = new TextEncoder();
const sessionCookieName = "ellejew_admin";
// Cloudflare Workers limits a single PBKDF2 operation to 100,000 iterations.
// The admin password is additionally protected by a 12-character minimum,
// a random 128-bit salt and the e-mail verification step.
const passwordIterations = 100_000;
const sessionLifetimeMs = 12 * 60 * 60 * 1000;
const challengeLifetimeMs = 10 * 60 * 1000;

type AdminUserRow = {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  failed_attempts: number;
  locked_until: number | null;
};

export type AdminSession = {
  userId: string;
  email: string;
  tokenHash: string;
};

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  if (!/^[a-f0-9]+$/i.test(value) || value.length % 2 !== 0) return new Uint8Array();
  return new Uint8Array(value.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16)));
}

function randomToken(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

function secureEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return mismatch === 0;
}

async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: passwordIterations },
    key,
    256,
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

async function verificationHash(challengeId: string, code: string) {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
    throw new Error("A segurança do painel ainda não foi configurada.");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${challengeId}:${code}`));
  return bytesToHex(new Uint8Array(signature));
}

function validatePassword(password: string) {
  if (password.length < 12) throw new Error("A senha precisa ter pelo menos 12 caracteres.");
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    throw new Error("Use letras e pelo menos um número na senha.");
  }
}

function normalizeEmail(email: string) {
  const value = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(value)) throw new Error("Informe um e-mail válido.");
  return value;
}

function cookieFrom(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function setSessionCookie(request: Request, token: string) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(sessionLifetimeMs / 1000)}${secure}`;
}

export function clearSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export async function getAdminSetupState() {
  await ensureStoreSchema();
  const row = await getD1().prepare("SELECT COUNT(*) AS total FROM admin_users").first<{ total: number }>();
  return { setupRequired: Number(row?.total ?? 0) === 0, setupConfigured: Boolean(env.ADMIN_SETUP_KEY && env.AUTH_SECRET) };
}

export async function setupAdmin(emailInput: string, password: string, setupKey: string) {
  const state = await getAdminSetupState();
  if (!state.setupRequired) throw new Error("O administrador já foi criado.");
  if (!env.ADMIN_SETUP_KEY || !env.AUTH_SECRET) throw new Error("A ativação ainda não foi configurada na Cloudflare.");
  const [providedHash, expectedHash] = await Promise.all([sha256(setupKey), sha256(env.ADMIN_SETUP_KEY)]);
  if (!secureEqual(providedHash, expectedHash)) throw new Error("Chave de ativação incorreta.");

  const email = normalizeEmail(emailInput);
  validatePassword(password);
  const credentials = await hashPassword(password);
  const userId = crypto.randomUUID();
  await getD1()
    .prepare("INSERT INTO admin_users (id, email, password_hash, password_salt) VALUES (?, ?, ?, ?)")
    .bind(userId, email, credentials.hash, credentials.salt)
    .run();
  await writeAudit(userId, "admin.setup", "admin_user", userId, { email });
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(2, Math.min(6, name.length - 2)))}@${domain}`;
}

async function sendVerificationCode(email: string, code: string, allowLocalCode: boolean) {
  if (env.RESEND_API_KEY && env.ADMIN_FROM_EMAIL) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.ADMIN_FROM_EMAIL,
        to: [email],
        subject: `${code} é seu código de acesso à Elle Jew`,
        text: `Seu código de acesso ao painel Elle Jew é ${code}. Ele expira em 10 minutos. Se você não tentou entrar, ignore esta mensagem.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#34495e"><p style="letter-spacing:.18em;text-transform:uppercase;font-size:12px">Elle Jew • Painel administrativo</p><h1 style="font-family:Georgia,serif;font-weight:400">Confirme seu acesso</h1><p>Use o código abaixo para concluir o login. Ele expira em 10 minutos.</p><div style="font-size:34px;letter-spacing:.22em;font-weight:700;background:#f0f2f4;padding:22px;text-align:center">${code}</div><p style="font-size:12px;color:#66727c;margin-top:22px">Se você não tentou entrar, ignore esta mensagem.</p></div>`,
      }),
    });
    if (!response.ok) throw new Error("Não foi possível enviar o código. Confira a configuração do e-mail.");
    return;
  }
  if (!allowLocalCode) throw new Error("O envio de e-mail do painel ainda não foi configurado.");
}

export async function beginAdminLogin(emailInput: string, password: string, allowLocalCode: boolean) {
  await ensureStoreSchema();
  const email = normalizeEmail(emailInput);
  const d1 = getD1();
  const user = await d1
    .prepare("SELECT id, email, password_hash, password_salt, failed_attempts, locked_until FROM admin_users WHERE email = ?")
    .bind(email)
    .first<AdminUserRow>();
  if (!user) throw new Error("E-mail ou senha incorretos.");

  const now = Date.now();
  const candidate = await hashPassword(password, user.password_salt);
  if (!secureEqual(candidate.hash, user.password_hash)) {
    const attempts = Math.min(Number(user.failed_attempts ?? 0) + 1, 1_000_000);
    await d1
      .prepare("UPDATE admin_users SET failed_attempts = ?, locked_until = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(attempts, null, user.id)
      .run();
    throw new Error("E-mail ou senha incorretos.");
  }

  const challengeId = crypto.randomUUID();
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  const codeHash = await verificationHash(challengeId, code);
  await d1.batch([
    d1.prepare("UPDATE admin_users SET failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id),
    d1.prepare("DELETE FROM admin_login_challenges WHERE user_id = ? AND consumed_at IS NULL").bind(user.id),
    d1.prepare("INSERT INTO admin_login_challenges (id, user_id, code_hash, expires_at) VALUES (?, ?, ?, ?)").bind(challengeId, user.id, codeHash, now + challengeLifetimeMs),
  ]);
  try {
    await sendVerificationCode(user.email, code, allowLocalCode);
  } catch (error) {
    await d1.prepare("DELETE FROM admin_login_challenges WHERE id = ?").bind(challengeId).run();
    throw error;
  }

  return {
    challengeId,
    emailHint: maskEmail(user.email),
    ...(allowLocalCode && !env.RESEND_API_KEY ? { localCode: code } : {}),
  };
}

export async function verifyAdminCode(challengeId: string, code: string) {
  await ensureStoreSchema();
  if (!/^[0-9]{6}$/.test(code)) throw new Error("Digite o código de seis números.");
  const d1 = getD1();
  const challenge = await d1
    .prepare("SELECT c.id, c.user_id, c.code_hash, c.expires_at, c.attempts, c.consumed_at, u.email FROM admin_login_challenges c INNER JOIN admin_users u ON u.id = c.user_id WHERE c.id = ?")
    .bind(challengeId)
    .first<{ id: string; user_id: string; code_hash: string; expires_at: number; attempts: number; consumed_at: number | null; email: string }>();
  if (!challenge || challenge.consumed_at || Number(challenge.expires_at) < Date.now()) {
    throw new Error("Esse código expirou. Solicite um novo.");
  }
  if (Number(challenge.attempts) >= 5) throw new Error("Limite de tentativas atingido. Solicite um novo código.");

  const candidate = await verificationHash(challenge.id, code);
  if (!secureEqual(candidate, challenge.code_hash)) {
    await d1.prepare("UPDATE admin_login_challenges SET attempts = attempts + 1 WHERE id = ?").bind(challenge.id).run();
    throw new Error("Código incorreto.");
  }

  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = Date.now();
  await d1.batch([
    d1.prepare("UPDATE admin_login_challenges SET consumed_at = ? WHERE id = ?").bind(now, challenge.id),
    d1.prepare("DELETE FROM admin_sessions WHERE user_id = ? OR expires_at < ?").bind(challenge.user_id, now),
    d1.prepare("INSERT INTO admin_sessions (token_hash, user_id, expires_at, last_seen_at) VALUES (?, ?, ?, ?)").bind(tokenHash, challenge.user_id, now + sessionLifetimeMs, now),
  ]);
  await writeAudit(challenge.user_id, "admin.login", "admin_session", tokenHash.slice(0, 12));
  return { token, email: challenge.email };
}

export async function getAdminSession(request: Request): Promise<AdminSession | null> {
  await ensureStoreSchema();
  const token = cookieFrom(request, sessionCookieName);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = Date.now();
  const row = await getD1()
    .prepare("SELECT s.token_hash, s.user_id, s.expires_at, s.last_seen_at, u.email FROM admin_sessions s INNER JOIN admin_users u ON u.id = s.user_id WHERE s.token_hash = ?")
    .bind(tokenHash)
    .first<{ token_hash: string; user_id: string; expires_at: number; last_seen_at: number; email: string }>();
  if (!row || Number(row.expires_at) < now) {
    if (row) await getD1().prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  if (now - Number(row.last_seen_at) > 5 * 60 * 1000) {
    await getD1().prepare("UPDATE admin_sessions SET last_seen_at = ? WHERE token_hash = ?").bind(now, tokenHash).run();
  }
  return { userId: row.user_id, email: row.email, tokenHash };
}

export async function requireAdminSession(request: Request) {
  const session = await getAdminSession(request);
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

export async function logoutAdmin(session: AdminSession | null) {
  if (session) await getD1().prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(session.tokenHash).run();
}

export async function changeAdminPassword(session: AdminSession, currentPassword: string, nextPassword: string) {
  validatePassword(nextPassword);
  const d1 = getD1();
  const user = await d1.prepare("SELECT password_hash, password_salt FROM admin_users WHERE id = ?").bind(session.userId).first<{ password_hash: string; password_salt: string }>();
  if (!user) throw new Error("Administrador não encontrado.");
  const current = await hashPassword(currentPassword, user.password_salt);
  if (!secureEqual(current.hash, user.password_hash)) throw new Error("A senha atual está incorreta.");
  const next = await hashPassword(nextPassword);
  await d1.batch([
    d1.prepare("UPDATE admin_users SET password_hash = ?, password_salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(next.hash, next.salt, session.userId),
    d1.prepare("DELETE FROM admin_sessions WHERE user_id = ?").bind(session.userId),
  ]);
  await writeAudit(session.userId, "admin.password_changed", "admin_user", session.userId);
}

export async function writeAudit(
  userId: string,
  action: string,
  entityType: string,
  entityId?: string | null,
  details?: Record<string, unknown>,
) {
  await getD1()
    .prepare("INSERT INTO admin_audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)")
    .bind(userId, action, entityType, entityId ?? null, details ? JSON.stringify(details) : null)
    .run();
}
