import { env } from "cloudflare:workers";
import { getD1 } from "./store";

const encoder = new TextEncoder();
export const LAUNCH_TEASER_SETTING = "launch_teaser_product_ids";
export const MAX_LAUNCH_TEASERS = 6;
const BATCH_SIZE = 100;
const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/DbBWIoQJrEsLQuFe2jqGzJ";

function html(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function siteUrl() {
  try {
    const url = new URL(String(env.PUBLIC_SITE_URL ?? "https://ellejew.com.br"));
    return url.protocol === "https:" ? url.origin : "https://ellejew.com.br";
  } catch {
    return "https://ellejew.com.br";
  }
}

function fromAddress() {
  return String(env.ORDER_FROM_EMAIL || env.ADMIN_FROM_EMAIL || "").trim();
}

export function launchTimestamp() {
  const parsed = Date.parse(String(env.LAUNCH_AT ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeWaitlistEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("Informe um e-mail válido.");
  return email;
}

async function unsubscribeToken(id: string) {
  const secret = String(env.AUTH_SECRET ?? "");
  if (secret.length < 32) throw new Error("A segurança do envio ainda não foi configurada.");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`launch-unsubscribe:${id}`));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secureEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return mismatch === 0;
}

async function unsubscribeUrl(id: string) {
  return `${siteUrl()}/api/launch-waitlist?u=${encodeURIComponent(id)}&t=${await unsubscribeToken(id)}`;
}

function shell(eyebrow: string, title: string, body: string, cta: { label: string; url: string } | null, footer: string) {
  return `<div style="background:#050505;padding:32px 14px;font-family:Arial,sans-serif;color:#fffaf1"><div style="max-width:560px;margin:auto;border:1px solid #3a2f1c;background:#0d0c0a;padding:40px 32px;text-align:center"><img src="${siteUrl()}/brand/logo.webp" alt="Elle Jew" width="120" style="display:block;margin:0 auto 28px;filter:brightness(0) invert(1)"><p style="margin:0 0 14px;color:#f1dca8;letter-spacing:.24em;text-transform:uppercase;font-size:12px">${html(eyebrow)}</p><h1 style="margin:0 0 18px;font-family:Georgia,serif;font-weight:400;font-size:34px;line-height:1.1;color:#f1dca8">${html(title)}</h1><p style="margin:0 0 26px;line-height:1.7;color:#d9d2c5;font-size:15px">${body}</p>${cta ? `<a href="${html(cta.url)}" style="display:inline-block;padding:16px 30px;background:#c9a45f;color:#050505;text-decoration:none;letter-spacing:.18em;text-transform:uppercase;font-size:13px;font-weight:bold">${html(cta.label)}</a>` : ""}<p style="margin:30px 0 0;font-size:12px;line-height:1.6;color:#8f877a">${footer}</p></div></div>`;
}

async function launchEmail(id: string) {
  const unsubscribe = await unsubscribeUrl(id);
  const site = siteUrl();
  return {
    subject: "A Black Friday Elle Jew começou",
    html: shell(
      "O cadeado abriu",
      "A Black Friday começou.",
      "As condições especiais em prata 925 já estão no ar. As peças mais desejadas costumam sair primeiro — garanta a sua.",
      { label: "Ver a Black Friday", url: site },
      `Você recebeu este e-mail porque pediu para ser avisada da Black Friday Elle Jew. <a href="${html(unsubscribe)}" style="color:#c9a45f">Não quero mais receber</a>.`,
    ),
    text: `A Black Friday Elle Jew começou.\n\nAs condições especiais em prata 925 já estão no ar: ${site}\n\nPara não receber mais: ${unsubscribe}`,
    headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

async function confirmationEmail(id: string) {
  const unsubscribe = await unsubscribeUrl(id);
  return {
    subject: "Você está na lista da Black Friday Elle Jew",
    html: shell(
      "Lista confirmada",
      "Seu lugar está guardado.",
      "Assim que o cadeado abrir, você recebe um e-mail aqui. Enquanto isso, acompanhe os spoilers no nosso Instagram.",
      { label: "Grupo VIP no WhatsApp", url: WHATSAPP_GROUP_URL },
      `Não foi você? <a href="${html(unsubscribe)}" style="color:#c9a45f">Remover meu e-mail</a>.`,
    ),
    text: `Seu lugar está guardado. Assim que a Black Friday Elle Jew abrir, você recebe um e-mail.\n\nNão foi você? ${unsubscribe}`,
  };
}

async function resend(path: string, body: unknown, idempotencyKey: string) {
  if (!env.RESEND_API_KEY || !fromAddress()) throw new Error("O envio de e-mail ainda não foi configurado.");
  const response = await fetch(`https://api.resend.com${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.slice(0, 256) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Resend recusou o envio (${response.status}): ${text.slice(0, 200)}`);
  return text;
}

/** Inscreve na lista. Resposta sempre igual, exista ou não o e-mail (sem enumeração). */
export async function joinLaunchWaitlist(emailInput: unknown, consent: unknown) {
  const email = normalizeWaitlistEmail(emailInput);
  if (consent !== true) throw new Error("Confirme que aceita receber o aviso por e-mail.");
  const d1 = getD1();
  const id = crypto.randomUUID();
  const inserted = await d1.prepare("INSERT INTO launch_waitlist (id, email) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET unsubscribed_at = NULL, consent_at = CURRENT_TIMESTAMP WHERE launch_waitlist.unsubscribed_at IS NOT NULL")
    .bind(id, email)
    .run();
  if (Number(inserted.meta.changes ?? 0) === 0) return;
  const row = await d1.prepare("SELECT id, confirmation_sent_at FROM launch_waitlist WHERE email = ?").bind(email).first<{ id: string; confirmation_sent_at: string | null }>();
  if (!row || row.confirmation_sent_at) return;
  try {
    const message = await confirmationEmail(row.id);
    await resend("/emails", { from: fromAddress(), to: [email], reply_to: "contato@ellejew.com.br", ...message }, `launch-confirm-${row.id}`);
    await d1.prepare("UPDATE launch_waitlist SET confirmation_sent_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();
  } catch (error) {
    // A inscrição vale mesmo se a confirmação falhar; o aviso principal sai no lançamento.
    console.error("Launch waitlist confirmation failed", { error: error instanceof Error ? error.message : "unknown" });
  }
}

export async function unsubscribeLaunchWaitlist(id: string, token: string) {
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{64}$/.test(token)) return false;
  if (!secureEqual(token, await unsubscribeToken(id))) return false;
  await getD1().prepare("UPDATE launch_waitlist SET unsubscribed_at = COALESCE(unsubscribed_at, CURRENT_TIMESTAMP) WHERE id = ?").bind(id).run();
  return true;
}

/** Envia o aviso de abertura em lotes de 100 (Resend batch). Só roda depois de LAUNCH_AT. Idempotente. */
export async function sendLaunchNotifications(maxBatches = 5) {
  const launchAt = launchTimestamp();
  if (launchAt === null || Date.now() < launchAt) return { sent: 0, skipped: "before_launch" as const };
  const d1 = getD1();
  let sent = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const now = Date.now();
    // Claim atômico: outra execução simultânea não pega as mesmas linhas.
    const claimed = await d1.prepare(`UPDATE launch_waitlist SET notify_claimed_at = ?, notify_attempts = notify_attempts + 1
      WHERE id IN (SELECT id FROM launch_waitlist WHERE notified_at IS NULL AND unsubscribed_at IS NULL AND notify_attempts < 5 AND (notify_claimed_at IS NULL OR notify_claimed_at < ?) ORDER BY created_at LIMIT ?)
      RETURNING id, email`).bind(now, now - 10 * 60_000, BATCH_SIZE).all<{ id: string; email: string }>();
    const rows = claimed.results;
    if (!rows.length) break;
    try {
      const messages = await Promise.all(rows.map(async (row) => ({ from: fromAddress(), to: [row.email], reply_to: "contato@ellejew.com.br", ...(await launchEmail(row.id)) })));
      const digest = await crypto.subtle.digest("SHA-256", encoder.encode(rows.map((row) => row.id).join(",")));
      const batchKey = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      await resend("/emails/batch", messages, `launch-batch-${batchKey}`);
      const ids = rows.map((row) => row.id);
      await d1.prepare(`UPDATE launch_waitlist SET notified_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).run();
      sent += rows.length;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "unknown";
      const ids = rows.map((row) => row.id);
      await d1.prepare(`UPDATE launch_waitlist SET notify_claimed_at = NULL, last_error = ? WHERE id IN (${ids.map(() => "?").join(",")})`).bind(message, ...ids).run();
      console.error("Launch notification batch failed", { error: message });
      break;
    }
  }
  return { sent };
}

export async function sendLaunchTestEmail(to: string) {
  const message = await launchEmail("00000000-0000-0000-0000-000000000000");
  await resend("/emails", { from: fromAddress(), to: [to], reply_to: "contato@ellejew.com.br", ...message, subject: `[TESTE] ${message.subject}` }, `launch-test-${to}-${Date.now()}`);
}

export async function readLaunchAdminData() {
  const d1 = getD1();
  const [setting, stats] = await Promise.all([
    d1.prepare("SELECT value FROM site_settings WHERE key = ?").bind(LAUNCH_TEASER_SETTING).first<{ value: string }>(),
    d1.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN notified_at IS NOT NULL THEN 1 ELSE 0 END) AS notified, SUM(CASE WHEN unsubscribed_at IS NOT NULL THEN 1 ELSE 0 END) AS unsubscribed, SUM(CASE WHEN last_error IS NOT NULL AND notified_at IS NULL THEN 1 ELSE 0 END) AS failed FROM launch_waitlist")
      .first<{ total: number; notified: number | null; unsubscribed: number | null; failed: number | null }>(),
  ]);
  let teaserProductIds: string[] = [];
  try { teaserProductIds = JSON.parse(setting?.value ?? "[]"); } catch { teaserProductIds = []; }
  const total = Number(stats?.total ?? 0);
  const unsubscribed = Number(stats?.unsubscribed ?? 0);
  return {
    launchAt: String(env.LAUNCH_AT ?? ""),
    emailConfigured: Boolean(env.RESEND_API_KEY && fromAddress()),
    teaserProductIds: Array.isArray(teaserProductIds) ? teaserProductIds.map(String) : [],
    waitlist: { total, active: total - unsubscribed, notified: Number(stats?.notified ?? 0), unsubscribed, failed: Number(stats?.failed ?? 0) },
  };
}
