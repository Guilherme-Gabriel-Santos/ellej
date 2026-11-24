/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { renderLaunchPage, renderPrelaunchRobots, renderPrelaunchUnavailable, type LaunchTeaser } from "./launch-page";
import { hasStorePreviewCookie } from "../lib/store-preview";
import { MIN_VIP_TOKEN_LENGTH, timingSafeEqualText, VIP_COOKIE_NAME, vipCookieHeader, vipCookieValue } from "../lib/vip-access";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  AUTH_SECRET?: string;
  LAUNCH_AT?: string;
  VIP_LAUNCH_AT?: string;
  VIP_ACCESS_TOKEN?: string;
  TURNSTILE_SITE_KEY?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}


const prelaunchAllowedPrefixes = [
  "/admin/",
  "/api/admin/",
  "/_next/",
  "/_vinext/",
  "/brand/",
  "/admin-icons/",
  "/cdn-cgi/",
];

const prelaunchAllowedFiles = new Set([
  "/admin",
  "/admin-offline.html",
  "/admin-sw.js",
  "/admin.webmanifest",
  "/api/admin",
  "/api/vip-access",
  "/api/jobs/retry-notifications",
  "/api/jobs/expire-pending-orders",
  "/api/jobs/launch-notify",
  "/api/launch-waitlist",
  "/api/media",
  "/api/payments/asaas",
  "/favicon.svg",
]);

function launchIsActive(env: Env): env is Env & { LAUNCH_AT: string } {
  if (!env.LAUNCH_AT) return false;
  const timestamp = Date.parse(env.LAUNCH_AT);
  return Number.isFinite(timestamp) && Date.now() < timestamp;
}

function timestamp(value: string | undefined) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}


function requestCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return "";
}

async function hasVipCookie(request: Request, env: Env) {
  const token = String(env.VIP_ACCESS_TOKEN ?? "");
  if (token.length < MIN_VIP_TOKEN_LENGTH) return false;
  return timingSafeEqualText(requestCookie(request, VIP_COOKIE_NAME), await vipCookieValue(token));
}

/** Horário VIP, só quando ele é antes da abertura pública. */
function vipEarlyAccessAt(env: Env) {
  const vipAt = timestamp(env.VIP_LAUNCH_AT);
  const publicAt = timestamp(env.LAUNCH_AT);
  return vipAt !== null && publicAt !== null && vipAt < publicAt ? env.VIP_LAUNCH_AT : undefined;
}

function vipWindowIsOpen(env: Env) {
  const vipAt = timestamp(env.VIP_LAUNCH_AT);
  const publicAt = timestamp(env.LAUNCH_AT);
  return vipAt !== null && publicAt !== null && vipAt < publicAt && Date.now() >= vipAt && Date.now() < publicAt;
}

async function acceptVipLink(request: Request, url: URL, env: Env) {
  if (request.method !== "GET" || !url.searchParams.has("vip")) return null;
  const suppliedToken = url.searchParams.get("vip") ?? "";
  const configuredToken = String(env.VIP_ACCESS_TOKEN ?? "");
  url.searchParams.delete("vip");
  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    Location: url.toString(),
    "Referrer-Policy": "no-referrer",
  });
  if (configuredToken.length >= MIN_VIP_TOKEN_LENGTH && timingSafeEqualText(suppliedToken, configuredToken)) {
    headers.set("Set-Cookie", await vipCookieHeader(configuredToken, env.LAUNCH_AT));
  }
  return new Response(null, { status: 302, headers });
}

/** Joias escolhidas no admin para o spoiler (até 6, na ordem salva). Falha silenciosa: usa as fotos padrão. */
async function launchTeasers(env: Env): Promise<LaunchTeaser[]> {
  try {
    const result = await env.DB.prepare("SELECT p.name, p.image FROM json_each((SELECT value FROM site_settings WHERE key = 'launch_teaser_product_ids')) j INNER JOIN products p ON p.id = j.value WHERE p.active = 1 ORDER BY j.key LIMIT 6")
      .all<{ name: string; image: string }>();
    return result.results.map((row) => ({ name: String(row.name ?? ""), image: String(row.image ?? "") }));
  } catch {
    return [];
  }
}

function isAllowedBeforeLaunch(pathname: string): boolean {
  return prelaunchAllowedFiles.has(pathname) || prelaunchAllowedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  scheduledTime: number;
  cron: string;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.protocol !== "https:") {
      url.protocol = "https:";
      return new Response(null, {
        status: 308,
        headers: {
          "Cache-Control": "no-store",
          Location: url.toString(),
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    let response: Response;
    const publicLaunchLocked = launchIsActive(env);
    const vipLinkResponse = await acceptVipLink(request, url, env);
    const vipCookieAccepted = publicLaunchLocked && await hasVipCookie(request, env);
    const vipAuthorized = vipCookieAccepted && vipWindowIsOpen(env);
    const previewAuthorized = publicLaunchLocked && await hasStorePreviewCookie(request, env.AUTH_SECRET);

    const isVipPage = url.pathname === "/vip" || url.pathname === "/vip/";
    if (vipLinkResponse) {
      response = vipLinkResponse;
    } else if (isVipPage && (!publicLaunchLocked || vipCookieAccepted || previewAuthorized)) {
      // Já liberada (ou loja aberta): a página da senha não é mais necessária.
      response = new Response(null, { status: 302, headers: { Location: "/", "Cache-Control": "no-store" } });
    } else if (isVipPage && (request.method === "GET" || request.method === "HEAD")) {
      response = renderLaunchPage(env.LAUNCH_AT!, request.method, "public", { teasers: await launchTeasers(env), turnstileSiteKey: env.TURNSTILE_SITE_KEY, vipLaunchAt: vipEarlyAccessAt(env), openVip: true });
    } else if (publicLaunchLocked && !isAllowedBeforeLaunch(url.pathname) && !vipAuthorized && !previewAuthorized) {
      const vipAt = timestamp(env.VIP_LAUNCH_AT);
      const awaitingVipOpening = vipCookieAccepted && vipAt !== null && vipAt > Date.now();
      const target = awaitingVipOpening ? env.VIP_LAUNCH_AT! : env.LAUNCH_AT;
      if (url.pathname === "/robots.txt") response = renderPrelaunchRobots(request.method);
      else if (url.pathname.startsWith("/api/")) response = renderPrelaunchUnavailable(target, awaitingVipOpening ? "vip" : "public");
      else if (request.method === "GET" || request.method === "HEAD") response = renderLaunchPage(target, request.method, awaitingVipOpening ? "vip" : "public", { teasers: await launchTeasers(env), turnstileSiteKey: env.TURNSTILE_SITE_KEY, vipLaunchAt: vipEarlyAccessAt(env) });
      else response = renderPrelaunchUnavailable(target, awaitingVipOpening ? "vip" : "public");
    } else if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    } else {
      const isPublicDocument = !publicLaunchLocked
        && request.method === "GET"
        && !url.search
        && !request.headers.has("RSC")
        && (request.headers.get("accept") ?? "").includes("text/html")
        && url.pathname === "/";

      if (!isPublicDocument) {
        response = await handler.fetch(request, env, ctx);
      } else {
        const pageCache = await caches.open("ellejew-public-pages-v2");
        const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: "GET" });
        const cached = await pageCache.match(cacheKey);
        if (cached) {
          response = new Response(cached.body, cached);
          response.headers.set("Cache-Control", "no-store, must-revalidate");
        } else {
          response = await handler.fetch(request, env, ctx);
          if (response.status === 200 && (response.headers.get("Content-Type") ?? "").includes("text/html") && !response.headers.has("Set-Cookie")) {
            const cacheableResponse = new Response(response.clone().body, response);
            cacheableResponse.headers.set("Cache-Control", "public, max-age=0, s-maxage=30");
            ctx.waitUntil(pageCache.put(cacheKey, cacheableResponse));
          }
        }
      }
    }

    const secured = new Response(response.body, response);
    secured.headers.set("Content-Security-Policy", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline' https://connect.facebook.net https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com; connect-src 'self' https://www.facebook.com https://connect.facebook.net https://challenges.cloudflare.com");
    secured.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    secured.headers.set("X-Content-Type-Options", "nosniff");
    secured.headers.set("X-Frame-Options", "DENY");
    secured.headers.set("X-Permitted-Cross-Domain-Policies", "none");
    if (url.protocol === "https:") {
      secured.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    if ((vipAuthorized || previewAuthorized) && publicLaunchLocked) {
      secured.headers.set("Cache-Control", "private, no-store, max-age=0");
      secured.headers.set("Vary", "Cookie");
      secured.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
    }
    if (url.pathname === "/admin" || url.pathname.startsWith("/api/admin") || url.pathname.startsWith("/conta") || url.pathname.startsWith("/api/account")) {
      secured.headers.set("Cache-Control", "no-store");
    }
    return secured;
  },

  // Faxina diária: remove linhas expiradas de rate limit, desafios e sessões.
  // Sem isso, essas tabelas crescem sem limite (custo/performance de D1).
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = Date.now();
    const cleanups = [
      "DELETE FROM request_rate_limits WHERE expires_at < ?",
      "DELETE FROM admin_login_challenges WHERE expires_at < ?",
      "DELETE FROM admin_passkey_challenges WHERE expires_at < ?",
      "DELETE FROM customer_email_challenges WHERE expires_at < ?",
      "DELETE FROM admin_sessions WHERE expires_at < ?",
      "DELETE FROM customer_sessions WHERE expires_at < ?",
    ];
    // allSettled: se uma tabela ainda não existir (deploy novo sem tráfego),
    // as demais faxinas seguem normalmente.
    const tasks: Promise<unknown>[] = [];
    if (controller.cron === "17 4 * * *") tasks.push(...cleanups.map((sql) => env.DB.prepare(sql).bind(now).run()));
    if (controller.cron === "*/10 * * * *" && env.AUTH_SECRET) {
      tasks.push(handler.fetch(new Request("https://ellejew.internal/api/jobs/retry-notifications", {
        method: "POST",
        headers: { "x-ellejew-job-token": env.AUTH_SECRET },
      }), env, ctx).then((response) => {
        if (!response.ok) throw new Error(`Notification retry failed (${response.status}).`);
      }));
    }
    if (controller.cron === "*/5 * * * *" && env.AUTH_SECRET) {
      tasks.push(handler.fetch(new Request("https://ellejew.internal/api/jobs/launch-notify", {
        method: "POST",
        headers: { "x-ellejew-job-token": env.AUTH_SECRET },
      }), env, ctx).then((response) => {
        if (!response.ok) throw new Error(`Launch notification failed (${response.status}).`);
      }));
    }
    if (controller.cron === "*/5 * * * *" && env.AUTH_SECRET) {
      tasks.push(handler.fetch(new Request("https://ellejew.internal/api/jobs/expire-pending-orders", {
        method: "POST",
        headers: { "x-ellejew-job-token": env.AUTH_SECRET },
      }), env, ctx).then((response) => {
        if (!response.ok) throw new Error(`Pending order expiration failed (${response.status}).`);
      }));
    }
    ctx.waitUntil(Promise.allSettled(tasks));
  },
};

export default worker;
