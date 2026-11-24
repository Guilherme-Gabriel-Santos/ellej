import { joinLaunchWaitlist, unsubscribeLaunchWaitlist } from "../../../lib/launch";
import { assertJsonRequest, assertSameOrigin, enforceRateLimit, RateLimitError } from "../../../lib/security";
import { ensureStoreSchema } from "../../../lib/store";
import { verifyTurnstile } from "../../../lib/turnstile";

function json(data: unknown, status = 200, retryAfter?: number) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  if (retryAfter) headers.set("Retry-After", String(retryAfter));
  return new Response(JSON.stringify(data), { status, headers });
}

function page(title: string, body: string) {
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#050505;color:#fffaf1;font-family:Arial,sans-serif;text-align:center;padding:24px"><main><h1 style="font-family:Georgia,serif;font-weight:400;color:#f1dca8">${title}</h1><p style="color:#d9d2c5">${body}</p><p><a href="/" style="color:#c9a45f">Voltar para a Elle Jew</a></p></main></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

async function unsubscribe(url: URL) {
  await ensureStoreSchema();
  const ok = await unsubscribeLaunchWaitlist(url.searchParams.get("u") ?? "", url.searchParams.get("t") ?? "");
  return ok;
}

/** Link de descadastro do e-mail. */
export async function GET(request: Request) {
  const ok = await unsubscribe(new URL(request.url)).catch(() => false);
  return ok
    ? page("Pronto, e-mail removido.", "Você não vai mais receber avisos da Black Friday Elle Jew.")
    : page("Link inválido.", "Este link de descadastro não é válido ou expirou.");
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  // Descadastro em um clique (List-Unsubscribe-Post) dos provedores de e-mail.
  if (url.searchParams.has("u")) {
    const ok = await unsubscribe(url).catch(() => false);
    return new Response(ok ? "OK" : "Invalid", { status: ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    assertSameOrigin(request);
    assertJsonRequest(request, 8 * 1024);
    await ensureStoreSchema();
    await enforceRateLimit(request, "launch.waitlist.ip", 8, 60 * 60);
    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "Formato da solicitação inválido." }, 400);
    }
    await verifyTurnstile(request, payload.turnstileToken, "launch_waitlist");
    await joinLaunchWaitlist(payload.email, payload.consent);
    return json({ ok: true, message: "Pronto! Você será avisada por e-mail assim que a Black Friday abrir." });
  } catch (error) {
    if (error instanceof RateLimitError) return json({ error: error.message }, 429, error.retryAfter);
    const message = error instanceof Error ? error.message : "";
    const safe = /e-mail válido|Confirme que aceita|verificação de segurança|Origem|Formato|muito grande/i.test(message) ? message : "Não foi possível concluir agora. Tente novamente.";
    if (safe !== message) console.error("Launch waitlist failed", { error: message });
    return json({ error: safe }, 400);
  }
}
