import { env } from "cloudflare:workers";
import { ensureStoreSchema, getD1 } from "./store";

const encoder = new TextEncoder();
const sessionCookieName = "ellejew_customer";
const passwordIterations = 100_000;
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const challengeLifetimeMs = 15 * 60 * 1000;
const lockLifetimeMs = 15 * 60 * 1000;

type CustomerUserRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  password_hash: string;
  password_salt: string;
  email_verified_at: string | null;
  failed_attempts: number;
  locked_until: number | null;
};

type ChallengeKind = "verify" | "reset";

export type CustomerSession = {
  userId: string;
  name: string;
  email: string;
  phone: string;
  tokenHash: string;
};

export type CustomerSummary = Omit<CustomerSession, "tokenHash">;

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
  for (let index = 0; index < length; index += 1) mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
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

function normalizeEmail(input: string) {
  const value = input.trim().toLowerCase();
  if (value.length > 254 || !/^\S+@\S+\.\S+$/.test(value)) throw new Error("Informe um e-mail válido.");
  return value;
}

function normalizeName(input: string) {
  const value = input.trim().replace(/\s+/g, " ");
  if (value.length < 3 || value.length > 100) throw new Error("Informe seu nome completo.");
  return value;
}

function normalizePhone(input: string) {
  const value = input.replace(/\D/g, "").slice(0, 11);
  if (value && value.length < 10) throw new Error("Informe um telefone válido ou deixe o campo vazio.");
  return value;
}

function validatePassword(password: string) {
  if (password.length < 10) throw new Error("A senha precisa ter pelo menos 10 caracteres.");
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) throw new Error("Use letras e pelo menos um número na senha.");
}

function cookieFrom(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function setCustomerSessionCookie(request: Request, token: string) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(sessionLifetimeMs / 1000)}${secure}`;
}

export function clearCustomerSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

async function challengeHash(challengeId: string, kind: ChallengeKind, code: string) {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) throw new Error("A segurança das contas ainda não foi configurada.");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${challengeId}:${kind}:${code}`));
  return bytesToHex(new Uint8Array(signature));
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(2, Math.min(6, name.length - 2)))}@${domain}`;
}

async function sendCustomerCode(email: string, code: string, kind: ChallengeKind, allowLocalCode: boolean) {
  if (env.RESEND_API_KEY && env.ADMIN_FROM_EMAIL) {
    const title = kind === "verify" ? "Confirme sua conta" : "Redefina sua senha";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.ADMIN_FROM_EMAIL,
        to: [email],
        subject: `${code} é seu código Elle Jew`,
        text: `${title} na Elle Jew usando o código ${code}. Ele expira em 15 minutos. Se você não fez esta solicitação, ignore a mensagem.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#111b23"><p style="color:#b98b3f;letter-spacing:.22em;text-transform:uppercase;font-size:11px">Elle Jew</p><h1 style="font-family:Georgia,serif;font-weight:400">${title}</h1><p>Use o código abaixo. Ele expira em 15 minutos.</p><div style="font-size:34px;letter-spacing:.22em;font-weight:700;background:#f4f0e8;padding:22px;text-align:center">${code}</div><p style="font-size:12px;color:#66727c;margin-top:22px">Se você não fez esta solicitação, ignore a mensagem.</p></div>`,
      }),
    });
    if (!response.ok) throw new Error("Não foi possível enviar o código agora. Tente novamente.");
    return;
  }
  if (!allowLocalCode) throw new Error("O envio de e-mail das contas ainda não foi configurado.");
}

async function createChallenge(userId: string, email: string, kind: ChallengeKind, allowLocalCode: boolean) {
  const challengeId = crypto.randomUUID();
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  const codeHash = await challengeHash(challengeId, kind, code);
  const d1 = getD1();
  await d1.batch([
    d1.prepare("DELETE FROM customer_email_challenges WHERE user_id = ? AND kind = ? AND consumed_at IS NULL").bind(userId, kind),
    d1.prepare("INSERT INTO customer_email_challenges (id, user_id, kind, code_hash, expires_at) VALUES (?, ?, ?, ?, ?)").bind(challengeId, userId, kind, codeHash, Date.now() + challengeLifetimeMs),
  ]);
  try {
    await sendCustomerCode(email, code, kind, allowLocalCode);
  } catch (error) {
    await d1.prepare("DELETE FROM customer_email_challenges WHERE id = ?").bind(challengeId).run();
    throw error;
  }
  return { challengeId, emailHint: maskEmail(email), ...(allowLocalCode && !env.RESEND_API_KEY ? { localCode: code } : {}) };
}

async function issueSession(user: Pick<CustomerUserRow, "id" | "name" | "email" | "phone">) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = Date.now();
  await getD1().batch([
    getD1().prepare("DELETE FROM customer_sessions WHERE expires_at < ?").bind(now),
    getD1().prepare("INSERT INTO customer_sessions (token_hash, user_id, expires_at, last_seen_at) VALUES (?, ?, ?, ?)").bind(tokenHash, user.id, now + sessionLifetimeMs, now),
  ]);
  return { token, account: { userId: user.id, name: user.name, email: user.email, phone: user.phone } };
}

export async function beginCustomerRegistration(nameInput: string, emailInput: string, phoneInput: string, password: string, allowLocalCode: boolean) {
  await ensureStoreSchema();
  const name = normalizeName(nameInput);
  const email = normalizeEmail(emailInput);
  const phone = normalizePhone(phoneInput);
  validatePassword(password);
  const credentials = await hashPassword(password);
  const d1 = getD1();
  const existing = await d1.prepare("SELECT id, email_verified_at FROM customer_users WHERE email = ?").bind(email).first<{ id: string; email_verified_at: string | null }>();
  if (existing?.email_verified_at) throw new Error("Já existe uma conta com este e-mail. Faça login.");

  const userId = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await d1.prepare("UPDATE customer_users SET name = ?, phone = ?, password_hash = ?, password_salt = ?, failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(name, phone, credentials.hash, credentials.salt, userId).run();
  } else {
    await d1.prepare("INSERT INTO customer_users (id, name, email, phone, password_hash, password_salt) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(userId, name, email, phone, credentials.hash, credentials.salt).run();
  }
  return createChallenge(userId, email, "verify", allowLocalCode);
}

async function readChallenge(challengeId: string, code: string, kind: ChallengeKind) {
  if (!/^[0-9]{6}$/.test(code)) throw new Error("Digite o código de seis números.");
  const d1 = getD1();
  const challenge = await d1.prepare("SELECT c.id, c.user_id, c.kind, c.code_hash, c.expires_at, c.attempts, c.consumed_at, u.name, u.email, u.phone FROM customer_email_challenges c INNER JOIN customer_users u ON u.id = c.user_id WHERE c.id = ? AND c.kind = ?")
    .bind(challengeId, kind)
    .first<{ id: string; user_id: string; kind: string; code_hash: string; expires_at: number; attempts: number; consumed_at: number | null; name: string; email: string; phone: string }>();
  if (!challenge || challenge.consumed_at || Number(challenge.expires_at) < Date.now()) throw new Error("Esse código expirou. Solicite um novo.");
  // Conta a tentativa antes de comparar, de forma atômica: requisições paralelas não passam do limite.
  const attempt = await d1.prepare("UPDATE customer_email_challenges SET attempts = attempts + 1 WHERE id = ? AND attempts < 5 AND consumed_at IS NULL").bind(challenge.id).run();
  if (Number(attempt.meta.changes ?? 0) !== 1) throw new Error("Limite de tentativas atingido. Solicite um novo código.");
  const candidate = await challengeHash(challenge.id, kind, code);
  if (!secureEqual(candidate, challenge.code_hash)) throw new Error("Código incorreto.");
  const consume = await d1.prepare("UPDATE customer_email_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(Date.now(), challenge.id).run();
  if (Number(consume.meta.changes ?? 0) !== 1) throw new Error("Esse código expirou. Solicite um novo.");
  return challenge;
}

export async function verifyCustomerRegistration(challengeId: string, code: string) {
  await ensureStoreSchema();
  const challenge = await readChallenge(challengeId, code, "verify");
  const now = Date.now();
  const d1 = getD1();
  await d1.batch([
    d1.prepare("UPDATE customer_email_challenges SET consumed_at = ? WHERE id = ?").bind(now, challenge.id),
    d1.prepare("UPDATE customer_users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(challenge.user_id),
    d1.prepare("UPDATE orders SET customer_id = ? WHERE customer_id IS NULL AND lower(email) = ?").bind(challenge.user_id, challenge.email.toLowerCase()),
  ]);
  return issueSession({ id: challenge.user_id, name: challenge.name, email: challenge.email, phone: challenge.phone });
}

export async function loginCustomer(emailInput: string, password: string) {
  await ensureStoreSchema();
  const email = normalizeEmail(emailInput);
  const d1 = getD1();
  const user = await d1.prepare("SELECT id, name, email, phone, password_hash, password_salt, email_verified_at, failed_attempts, locked_until FROM customer_users WHERE email = ?")
    .bind(email).first<CustomerUserRow>();
  if (!user) {
    await hashPassword(password, "00000000000000000000000000000000");
    throw new Error("E-mail ou senha incorretos.");
  }
  const now = Date.now();
  // Reserva a tentativa antes de verificar a senha (atômico). Bloqueio expirado recomeça a contagem.
  const gate = await d1.prepare(`UPDATE customer_users SET
      failed_attempts = CASE WHEN locked_until IS NOT NULL AND locked_until <= ? THEN 1 ELSE failed_attempts + 1 END,
      locked_until = CASE WHEN locked_until IS NOT NULL AND locked_until <= ? THEN NULL ELSE locked_until END
    WHERE id = ? AND ((locked_until IS NOT NULL AND locked_until <= ?) OR (locked_until IS NULL AND failed_attempts < 5))
    RETURNING failed_attempts`).bind(now, now, user.id, now).first<{ failed_attempts: number }>();
  const candidate = await hashPassword(password, user.password_salt);
  // Mesma mensagem para conta bloqueada e senha errada: não revela quais e-mails têm conta.
  if (!gate) throw new Error("E-mail ou senha incorretos.");
  if (!secureEqual(candidate.hash, user.password_hash)) {
    if (Number(gate.failed_attempts) >= 5) {
      await d1.prepare("UPDATE customer_users SET locked_until = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(now + lockLifetimeMs, user.id).run();
    }
    throw new Error("E-mail ou senha incorretos.");
  }
  if (!user.email_verified_at) throw new Error("Confirme seu e-mail antes de entrar. Você pode refazer o cadastro para receber outro código.");
  await d1.batch([
    d1.prepare("UPDATE customer_users SET failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id),
    d1.prepare("UPDATE orders SET customer_id = ? WHERE customer_id IS NULL AND lower(email) = ?").bind(user.id, user.email.toLowerCase()),
  ]);
  return issueSession(user);
}

export async function beginCustomerPasswordReset(emailInput: string, allowLocalCode: boolean) {
  await ensureStoreSchema();
  const email = normalizeEmail(emailInput);
  const user = await getD1().prepare("SELECT id, email FROM customer_users WHERE email = ?").bind(email).first<{ id: string; email: string }>();
  // Mesma resposta (com o e-mail mascarado) exista ou não a conta.
  if (!user) return { requested: true as const, challengeId: crypto.randomUUID(), emailHint: maskEmail(email) };
  return { requested: true as const, ...(await createChallenge(user.id, user.email, "reset", allowLocalCode)) };
}

export async function resetCustomerPassword(challengeId: string, code: string, password: string) {
  await ensureStoreSchema();
  validatePassword(password);
  const challenge = await readChallenge(challengeId, code, "reset");
  const credentials = await hashPassword(password);
  const now = Date.now();
  const d1 = getD1();
  await d1.batch([
    d1.prepare("UPDATE customer_email_challenges SET consumed_at = ? WHERE id = ?").bind(now, challenge.id),
    d1.prepare("UPDATE customer_users SET password_hash = ?, password_salt = ?, email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP), failed_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(credentials.hash, credentials.salt, challenge.user_id),
    d1.prepare("DELETE FROM customer_sessions WHERE user_id = ?").bind(challenge.user_id),
    d1.prepare("UPDATE orders SET customer_id = ? WHERE customer_id IS NULL AND lower(email) = ?").bind(challenge.user_id, challenge.email.toLowerCase()),
  ]);
  return issueSession({ id: challenge.user_id, name: challenge.name, email: challenge.email, phone: challenge.phone });
}

export async function getCustomerSession(request: Request): Promise<CustomerSession | null> {
  await ensureStoreSchema();
  const token = cookieFrom(request, sessionCookieName);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = Date.now();
  const row = await getD1().prepare("SELECT s.token_hash, s.user_id, s.expires_at, s.last_seen_at, u.name, u.email, u.phone, u.email_verified_at FROM customer_sessions s INNER JOIN customer_users u ON u.id = s.user_id WHERE s.token_hash = ?")
    .bind(tokenHash)
    .first<{ token_hash: string; user_id: string; expires_at: number; last_seen_at: number; name: string; email: string; phone: string; email_verified_at: string | null }>();
  if (!row || !row.email_verified_at || Number(row.expires_at) < now) {
    if (row) await getD1().prepare("DELETE FROM customer_sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  if (now - Number(row.last_seen_at) > 24 * 60 * 60 * 1000) {
    await getD1().prepare("UPDATE customer_sessions SET last_seen_at = ? WHERE token_hash = ?").bind(now, tokenHash).run();
  }
  return { userId: row.user_id, name: row.name, email: row.email, phone: row.phone, tokenHash };
}

export async function logoutCustomer(session: CustomerSession | null) {
  if (session) await getD1().prepare("DELETE FROM customer_sessions WHERE token_hash = ?").bind(session.tokenHash).run();
}

export function customerSummary(session: CustomerSession | null): CustomerSummary | null {
  if (!session) return null;
  return { userId: session.userId, name: session.name, email: session.email, phone: session.phone };
}

export async function readCustomerAccount(session: CustomerSession) {
  await ensureStoreSchema();
  const d1 = getD1();
  await d1.prepare("UPDATE orders SET customer_id = ? WHERE customer_id IS NULL AND lower(email) = ?").bind(session.userId, session.email.toLowerCase()).run();
  const orders = await d1.prepare("SELECT id, total_cents, status, payment_status, shipping_method, superfrete_service_name, superfrete_delivery_days, superfrete_tracking_code, superfrete_status, created_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50")
    .bind(session.userId)
    .all<{ id: string; total_cents: number; status: string; payment_status: string | null; shipping_method: string; superfrete_service_name: string | null; superfrete_delivery_days: number | null; superfrete_tracking_code: string | null; superfrete_status: string | null; created_at: string }>();
  const orderIds = orders.results.map((order) => order.id);
  const items = orderIds.length
    ? await d1.prepare(`SELECT oi.order_id, oi.product_name, oi.variant_label, oi.personalization_text, oi.unit_price_cents, oi.quantity, p.image FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id IN (${orderIds.map(() => "?").join(",")}) ORDER BY oi.id`).bind(...orderIds).all<{ order_id: string; product_name: string; variant_label: string | null; personalization_text: string | null; unit_price_cents: number; quantity: number; image: string | null }>()
    : { results: [] as Array<{ order_id: string; product_name: string; variant_label: string | null; personalization_text: string | null; unit_price_cents: number; quantity: number; image: string | null }> };
  return {
    account: customerSummary(session),
    orders: orders.results.map((order) => ({
      id: order.id,
      totalCents: Number(order.total_cents),
      status: order.status,
      paymentStatus: order.payment_status,
      shippingName: order.superfrete_service_name || order.shipping_method.replace("superfrete:", "Entrega "),
      deliveryDays: order.superfrete_delivery_days === null ? null : Number(order.superfrete_delivery_days),
      trackingCode: order.superfrete_tracking_code,
      shippingStatus: order.superfrete_status,
      createdAt: order.created_at,
      items: items.results.filter((item) => item.order_id === order.id).map((item) => ({
        name: item.product_name,
        variantLabel: item.variant_label,
        personalizationText: item.personalization_text,
        unitPriceCents: Number(item.unit_price_cents),
        quantity: Number(item.quantity),
        image: item.image,
      })),
    })),
  };
}
