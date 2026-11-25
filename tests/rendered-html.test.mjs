import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/", env = {}, headers = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`https://ellejew.example${path}`, { headers: { accept: "text/html", ...headers } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, ...env },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renderiza a vitrine com cabeçalhos de segurança", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("strict-transport-security") ?? "", /max-age=31536000/);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.match(response.headers.get("content-security-policy") ?? "", /upgrade-insecure-requests/);
  assert.equal(response.headers.get("x-permitted-cross-domain-policies"), "none");

  const html = await response.text();
  assert.match(html, /<title>Elle Jew \| Joias em Prata 925 de Luxo<\/title>/i);
  assert.match(html, /Você é a ocasião/);
  assert.match(html, /Carregando categorias/);
  assert.doesNotMatch(html, /Choker 5 Corações/);
});

test("mantém as consultas parametrizadas e sem execução dinâmica", async () => {
  const files = await Promise.all(
    ["../lib/store.ts", "../lib/admin-store.ts", "../lib/admin-auth.ts", "../lib/security.ts"].map((path) =>
      readFile(new URL(path, import.meta.url), "utf8"),
    ),
  );
  const source = files.join("\n");
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|\beval\s*\(|new Function\s*\(/);
  assert.match(source, /\.prepare\(["']/);
  assert.match(source, /\.bind\(/);
  assert.match(source, /request_rate_limits/);
  assert.match(source, /stock_committed/);
});

test("força HTTPS antes de processar qualquer rota", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("http-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://ellejew.example/conta?origem=teste"),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://ellejew.example/conta?origem=teste");
});

test("bloqueia força bruta administrativa e limita uploads antes do parse", async () => {
  const [auth, media] = await Promise.all([
    readFile(new URL("../lib/admin-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/media/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(auth, /attempts >= 5 \? now \+ lockLifetimeMs : null/);
  assert.match(auth, /await hashPassword\(password, dummyPasswordSalt\)/);
  assert.match(auth, /Number\(user\.locked_until \?\? 0\) > now/);
  assert.ok(media.indexOf("declaredLength > maximumRequestBytes") < media.indexOf("request.formData()"));
});

test("aplica a tipografia compartilhada nas paginas da loja", async () => {
  const [styles, account, legal] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/conta/account.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/legal.module.css", import.meta.url), "utf8"),
  ]);
  const html = await (await render()).text();
  assert.match(html, /family=Cormorant\+Garamond:ital,wght/);
  assert.match(html, /family=Jost:wght@300\.\.700/);
  assert.match(html, /family=Parisienne/);
  assert.match(html, /display=swap/);
  assert.match(styles, /--font-display: 'Parisienne'/);
  assert.match(styles, /--font-serif: 'Cormorant Garamond'/);
  assert.match(styles, /--font-sans: 'Jost'/);
  assert.match(styles, /font-optical-sizing: auto/);
  for (const stylesheet of [account, legal]) {
    assert.match(stylesheet, /font-family: var\(--font-display\)/);
    assert.match(stylesheet, /font-family: var\(--font-serif\)/);
    assert.doesNotMatch(stylesheet, /font-family: "Prata"/);
  }
  assert.match(styles, /\.hero h1,[\s\S]*font-family: var\(--font-display\)/);
  for (const selector of [".product-info h3", ".modal-copy h2", ".drawer-item h3", ".checkout-items p strong"]) {
    const rule = styles.slice(styles.indexOf(`${selector} {`)).split("}")[0];
    assert.match(rule, /font-family: var\(--font-serif\)/);
  }
});

test("mantém o cadastro de produto leve no celular", async () => {
  const [panel, route, store] = await Promise.all([
    readFile(new URL("../app/admin/AdminPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin-store.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(panel, /preload="auto"/);
  assert.match(panel, /preload="metadata"/);
  assert.match(panel, /productDraftStorageKey/);
  assert.match(panel, /no máximo 10 mídias/);
  assert.match(panel, /\.slice\(0, 10\)/);
  assert.match(store, /maxMediaPerProduct = 10/);
  assert.match(route, /return response\(\{ ok: true, productId \}/);
});

test("permite controlar temporariamente o código de login", async () => {
  const [auth, panel, route] = await Promise.all([
    readFile(new URL("../lib/admin-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(auth, /ADMIN_LOGIN_CODE_DISABLED === "true"/);
  assert.match(auth, /admin\.login\.password_only/);
  assert.match(panel, /if \(data\.authenticated\)/);
  assert.match(route, /setSessionCookie\(request, login\.token\)/);
});

test("permite navegar pelas mídias do produto com teclado e gesto", async () => {
  const [storefront, styles] = await Promise.all([
    readFile(new URL("../app/Storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(storefront, /"ArrowLeft", "ArrowRight"/);
  assert.match(storefront, /onTouchStart=\{beginMediaSwipe\}/);
  assert.match(storefront, /onTouchEnd=\{finishMediaSwipe\}/);
  assert.match(storefront, /changeProductMedia\(horizontalDistance < 0 \? 1 : -1\)/);
  assert.doesNotMatch(storefront, /className="quick-add"/);
  assert.match(styles, /touch-action: pan-y/);
  assert.match(styles, /\.modal-media-arrow/);
  assert.match(styles, /@media \(min-width: 641px\)[^{]*\{[\s\S]*?\.modal-copy\s*\{[^}]*overflow-y: auto/s);
  assert.match(styles, /@media \(max-width: 640px\)[^{]*\{[\s\S]*?\.modal-image\s*\{[^}]*min-height: 54vh/s);
});

test("permite ordenar os produtos da vitrine pelo painel", async () => {
  const [store, adminStore, panel, route, migration] = await Promise.all([
    readFile(new URL("../lib/store.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0017_product_sort_order.sql", import.meta.url), "utf8"),
  ]);
  assert.match(store, /ORDER BY sort_order, created_at, id/);
  assert.match(adminStore, /export async function reorderProducts/);
  assert.match(adminStore, /MAX\(sort_order\)/);
  assert.match(panel, /Mover \$\{product\.name\} para cima/);
  assert.match(panel, /Ordem dos produtos atualizada na vitrine/);
  assert.match(route, /action === "reorderProducts"/);
  assert.match(migration, /ADD `sort_order` integer DEFAULT 0 NOT NULL/);
});

test("permite ao admin organizar a vitrine sem expor controles aos clientes", async () => {
  const [storefront, styles, adminStore, route] = await Promise.all([
    readFile(new URL("../app/Storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/storefront/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(storefront, /fetch\("\/api\/admin\/storefront"/);
  assert.match(storefront, /adminEmail && <div className=\{`storefront-admin-bar/);
  assert.match(storefront, /Arraste os produtos ou use as setas/);
  assert.match(storefront, /Salvar ordem/);
  assert.match(storefront, /draggable/);
  assert.match(storefront, /data-admin-order=\{productOrderDraft \? "true" : undefined\}/);
  assert.doesNotMatch(storefront, /className=\{`product-card \$\{productOrderDraft/);
  assert.match(storefront, /setDragImage\(card/);
  assert.doesNotMatch(storefront, /setDraggedProductId/);
  assert.match(styles, /\.product-order-controls/);
  assert.match(adminStore, /export async function reorderStorefrontProducts/);
  assert.match(adminStore, /product\.storefront_reordered/);
  assert.match(route, /requireAdminSession\(request\)/);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /payload\.action !== "reorderProducts"/);
});

test("exibe a mídia completa no produto e mantém a logo dourada nas páginas", async () => {
  const [styles, legalStyles, adminStyles] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/legal.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(styles, /\.modal-image img\s*\{[^}]*object-fit: contain/s);
  assert.match(styles, /\.modal-image video\s*\{[^}]*object-fit: contain/s);
  assert.match(styles, /\.brand img\s*\{[^}]*filter: var\(--logo-gold-filter\)/s);
  assert.match(styles, /\.checkout-header img\s*\{[^}]*filter: var\(--logo-gold-filter\)/s);
  assert.match(styles, /\.footer-brand img\s*\{[^}]*filter: var\(--logo-gold-filter\)/s);
  assert.match(legalStyles, /\.header img[^\n]*filter: var\(--logo-gold-filter\)/);
  assert.match(adminStyles, /\.adminLogo img\s*\{[^}]*filter: var\(--logo-gold-filter\)/s);
});

test("não exibe faixa promocional nem contagem regressiva artificial", async () => {
  const [storefront, styles] = await Promise.all([
    readFile(new URL("../app/Storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(storefront, /useCountdown|Condição de hoje encerra|Frete grátis acima de R\$399/);
  assert.doesNotMatch(styles, /\.announcement/);
});

test("preserva quebras de linha das descrições importadas", async () => {
  const [importer, styles] = await Promise.all([
    readFile(new URL("../scripts/audit-original-catalog.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(importer, /br\|hr\).*\\b\[\^>\]\*/);
  assert.match(importer, /joinedDescriptionPattern/);
  assert.match(styles, /\.modal-description\s*\{[^}]*white-space: pre-line/s);
});

test("não expõe a quantidade disponível ao cliente", async () => {
  const storefront = await readFile(new URL("../app/Storefront.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(storefront, /Restam apenas|stock-warning|modal-stock/);
  assert.match(storefront, /Produto esgotado/);
});

test("mantém o checkout direto e só confirma pagamentos pelo Asaas", async () => {
  const [storefront, asaas, store, route] = await Promise.all([
    readFile(new URL("../app/Storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/asaas.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/payments/asaas/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(storefront, /Para onde enviamos seu brilho\?/);
  assert.doesNotMatch(storefront, /success: "Pagamento aprovado/);
  assert.match(storefront, /Estamos confirmando a aprovação/);
  assert.match(asaas, /providerRequest\("\/checkouts"/);
  assert.match(asaas, /createCheckout\(\["PIX", "CREDIT_CARD"\], allowInstallments\)/);
  assert.match(asaas, /receivedTotal !== Number\(order\.total_cents\)/);
  assert.match(asaas, /validateAsaasWebhook/);
  assert.match(asaas, /Asaas API request failed/);
  assert.match(asaas, /status: response\.status/);
  assert.match(asaas, /responsePreview/);
  assert.match(asaas, /\$aact_prod_/);
  assert.match(asaas, /\$aact_hmlg_/);
  assert.match(asaas, /environment !== "legacy" && environment !== configuredEnvironment\(\)/);
  assert.match(asaas, /return "legacy" as const/);
  assert.match(asaas, /shouldRetrySimplerCheckout/);
  assert.match(asaas, /pix_and_card_without_installments/);
  assert.match(asaas, /pix_only/);
  assert.doesNotMatch(asaas, /console\.(?:log|error)\([^\n]*apiKey\(\)/);
  assert.match(route, /processAsaasWebhook/);
  assert.match(store, /stock_committed/);
});

test("calcula e seleciona o frete do SuperFrete dentro do carrinho", async () => {
  const [storefront, route, superfrete, styles] = await Promise.all([
    readFile(new URL("../app/Storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/store/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/superfrete.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(storefront, /Calcule o frete/);
  assert.match(storefront, /calculateCartShipping/);
  assert.match(storefront, /cart-shipping-option/);
  assert.match(storefront, /Confirme o endereço no checkout/);
  assert.match(route, /action === "shippingQuote"/);
  assert.match(route, /packageForCart\(store\.cart\)/);
  assert.match(superfrete, /"\/api\/v0\/calculator"/);
  assert.match(superfrete, /priceCents: Math\.round\(price \* 100\)/);
  assert.doesNotMatch(superfrete, /SHIPPING_TEST_PRICE_CENTS|checkoutShippingPrice/);
  assert.doesNotMatch(storefront, /SUPERFRETE_API_TOKEN/);
  assert.match(styles, /\.cart-shipping-calculator/);
});

test("calcula cupons no servidor e permite escolher produtos no painel", async () => {
  const [coupons, store, adminStore, panel, migration] = await Promise.all([
    readFile(new URL("../lib/coupons.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/store.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0014_coupons_infinitepay.sql", import.meta.url), "utf8"),
  ]);
  assert.match(coupons, /coupon_products/);
  assert.match(coupons, /shippingDiscountCents/);
  assert.match(store, /applyCoupon\(getD1\(\), couponCode/);
  assert.doesNotMatch(store, /coupon === "ELLE10"/);
  assert.match(adminStore, /createCoupon|updateCoupon|setCouponActive/);
  assert.match(panel, /Quais produtos participam\?/);
  assert.match(panel, /Dar frete grátis também/);
  assert.match(migration, /CREATE TABLE `coupons`/);
});

test("publica políticas legais e garantia de um ano", async () => {
  const [storefront, terms, returns, privacy, shipping] = await Promise.all([
    readFile(new URL("../app/Storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/termos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/trocas-e-devolucoes/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/privacidade/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/entrega/page.tsx", import.meta.url), "utf8"),
  ]);
  const source = [storefront, terms, returns, privacy, shipping].join("\n");
  assert.doesNotMatch(source, /garantia vitalícia|garantia vitalicia/i);
  assert.match(storefront, /Garantia de 1 ano/);
  assert.match(terms, /Garantia de 1 ano/);
  assert.match(returns, /garantia comercial total é de 1 ano/i);
  assert.match(privacy, /Asaas/);
  assert.match(shipping, /prazo mostrado no checkout/i);
});

test("publica apenas avaliações reais cadastradas pelo painel", async () => {
  const [storefront, store, adminStore, panel, migration] = await Promise.all([
    readFile(new URL("../app/Storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/store.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0015_homepage_reviews.sql", import.meta.url), "utf8"),
  ]);
  assert.match(store, /homepage_reviews WHERE active = 1/);
  assert.match(store, /LIMIT 4/);
  assert.match(storefront, /store\.reviews\.length/);
  assert.match(storefront, /Experiências reais/);
  assert.match(storefront, /DEPOIMENTO DE CLIENTE/);
  assert.match(adminStore, /createReview|updateReview|setReviewActive|reorderReviews/);
  assert.match(panel, /Cadastre somente avaliações enviadas por clientes/);
  assert.match(panel, /Sem nota informada/);
  assert.match(panel, /Avaliações/);
  assert.match(migration, /CREATE TABLE `homepage_reviews`/);
});

test("prepara o painel instalável com Face ID", async () => {
  const [layout, manifest, serviceWorker, panel, passkeys, route, migration] = await Promise.all([
    readFile(new URL("../app/admin/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/admin.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/admin-sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin-passkeys.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0013_admin_passkeys.sql", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /manifest: "\/admin\.webmanifest"/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(panel, /startAuthentication|startRegistration/);
  assert.match(passkeys, /requireUserVerification: true/);
  assert.match(passkeys, /expectedOrigin: challenge\.origin/);
  assert.match(route, /finishPasskeyLogin|finishPasskeyRegistration/);
  assert.match(migration, /CREATE TABLE `admin_passkeys`/);
});

test("revela a vitrine suavemente durante o scroll", async () => {
  const [storefront, styles] = await Promise.all([
    readFile(new URL("../app/Storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(storefront, /new IntersectionObserver/);
  assert.doesNotMatch(storefront, /reducedMotion \|\|/);
  assert.match(storefront, /data-reveal="up"/);
  assert.match(storefront, /data-reveal="product"/);
  assert.match(storefront, /data-reveal="heading"/);
  assert.match(styles, /\.scroll-reveal-ready \[data-reveal\]/);
  assert.match(styles, /@keyframes reveal-image-settle/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*--reveal-start-x: -38px/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*opacity 780ms/);
});

test("oferece conta de cliente segura e acompanhamento de pedidos", async () => {
  const [auth, accountRoute, accountUi, storeRoute, store, migration, worker] = await Promise.all([
    readFile(new URL("../lib/customer-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/conta/AccountClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/store/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/store.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0016_customer_accounts.sql", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /SameSite=Lax/);
  assert.match(auth, /HttpOnly/);
  assert.match(auth, /email_verified_at/);
  assert.match(auth, /failed_attempts/);
  assert.match(auth, /superfrete_tracking_code/);
  assert.match(accountRoute, /enforceRateLimit/);
  assert.match(accountRoute, /verifyCustomerRegistration/);
  assert.match(accountUi, /Acompanhe seus pedidos/);
  assert.match(accountUi, /Código de rastreio/);
  assert.match(storeRoute, /if \(!session\).*Entre na sua conta/s);
  assert.match(store, /customer_id/);
  assert.match(migration, /CREATE TABLE `customer_users`/);
  assert.match(worker, /url\.pathname\.startsWith\("\/conta"\)/);
});

test("protege cadastro, login e recuperação de senha com Turnstile validado no servidor", async () => {
  const [turnstile, accountRoute, accountUi, worker, config] = await Promise.all([
    readFile(new URL("../lib/turnstile.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/conta/AccountClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.cloudflare.jsonc", import.meta.url), "utf8"),
  ]);
  assert.match(turnstile, /turnstile\/v0\/siteverify/);
  assert.match(turnstile, /responseToken\.length > 2048/);
  assert.match(turnstile, /result\.action !== expectedAction/);
  assert.match(turnstile, /result\.hostname/);
  assert.match(accountRoute, /verifyTurnstile\(request, payload\.turnstileToken, "customer_register"\)/);
  assert.match(accountRoute, /verifyTurnstile\(request, payload\.turnstileToken, "customer_login"\)/);
  assert.match(accountRoute, /verifyTurnstile\(request, payload\.turnstileToken, "password_reset_request"\)/);
  assert.match(accountUi, /turnstileToken/);
  assert.match(accountUi, /customer_login/);
  assert.match(worker, /frame-src 'self' https:\/\/challenges\.cloudflare\.com/);
  assert.match(config, /"TURNSTILE_SECRET"/);
  assert.match(config, /"TURNSTILE_HOSTNAMES": "ellejew\.com\.br,www\.ellejew\.com\.br"/);
});

test("troca Buscar por ícones e preserva a sacola durante o login", async () => {
  const [storefront, styles] = await Promise.all([
    readFile(new URL("../app/Storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(storefront, />Buscar<\/button>/);
  assert.match(storefront, /className="header-icon-action search-action"/);
  assert.match(storefront, /className="header-icon-action account-action"/);
  assert.match(storefront, /\/conta\/entrar\?returnTo=%2F%3Fcheckout%3D1/);
  assert.match(storefront, /resumeCheckout/);
  assert.match(styles, /\.header-icon-action/);
});

test("destaca parcelas de até dez vezes sem esconder o valor total", async () => {
  const [storefront, pricing, asaas] = await Promise.all([
    readFile(new URL("../app/Storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/pricing.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/asaas.ts", import.meta.url), "utf8"),
  ]);
  assert.match(pricing, /MAX_CARD_INSTALLMENTS = 10/);
  assert.match(pricing, /Math\.ceil\(safeTotal \/ count\)/);
  assert.match(asaas, /installmentPlan\(Number\(order\.total_cents\)\)\.count/);
  assert.match(storefront, /productInstallments\.count}x de/);
  assert.match(storefront, /<span>ou \{money\(selectedProductPrice\)\} à vista • Pix ou cartão no checkout Asaas<\/span>/);
});

test("identifica produtos de moissanite e exibe o selo responsivo", async () => {
  const [storefront, styles] = await Promise.all([
    readFile(new URL("../app/Storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(storefront, /function isMoissaniteProduct/);
  assert.match(storefront, /prd_cb3e7b5a-8720-4640-af20-5ebac5c81f09/);
  assert.match(storefront, /product-moissanite-mark/);
  assert.match(storefront, /modal-moissanite-mark/);
  assert.match(storefront, />Moissanite<\/b>/);
  assert.match(styles, /border: 1px solid var\(--gold-accent\)/);
  assert.doesNotMatch(styles, /moissanite-badge\.svg/);
});

test("direciona o clube de novidades para o grupo do WhatsApp", async () => {
  const [storefront, styles, admin] = await Promise.all([
    readFile(new URL("../app/Storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminPanel.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(storefront, /GRUPO ELLE JEW/);
  assert.match(storefront, /chat\.whatsapp\.com\/DbBWIoQJrEsLQuFe2jqGzJ/);
  assert.match(storefront, /Entrar no grupo do WhatsApp/);
  assert.doesNotMatch(storefront, /newsletter-email|submitNewsletter|Prometemos não enviar spam/);
  assert.match(styles, /\.whatsapp-club-section/);
  assert.match(admin, /Novidades divulgadas pelo grupo do WhatsApp/);
});

test("publica SEO técnico para produtos e mecanismos de busca", async () => {
  const [layout, robots, sitemap, productPage] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/robots.txt/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/sitemap.xml/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/produtos/[slug]/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /metadataBase: new URL\("https:\/\/ellejew\.com\.br"\)/);
  assert.match(layout, /"@type": "OnlineStore"/);
  assert.match(layout, /summary_large_image/);
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Sitemap:/);
  assert.match(sitemap, /visibility = 'visible'/);
  assert.match(sitemap, /produtos\/\$\{encodeURIComponent\(product\.slug\)\}/);
  assert.match(productPage, /alternates: \{ canonical:/);
});

test("envia atualizações de pedido de forma idempotente e com retentativa", async () => {
  const [email, orderStatus, asaas, storeRoute, migration, worker] = await Promise.all([
    readFile(new URL("../lib/order-email.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/order-status.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/asaas.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/store/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0018_order_notifications_tracking.sql", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(email, /Idempotency-Key/);
  assert.match(email, /INSERT OR IGNORE INTO order_notification_events/);
  assert.match(email, /retryPendingOrderNotifications/);
  assert.match(email, /Número do pedido/);
  assert.match(email, /Subtotal/);
  assert.match(email, /Desconto no frete/);
  assert.match(email, /Endereço de entrega/);
  assert.match(orderStatus, /payment_confirmed/);
  assert.match(orderStatus, /order_shipped/);
  assert.match(asaas, /deliverMetaPurchase/);
  assert.match(storeRoute, /order_received/);
  assert.match(migration, /PRIMARY KEY \(order_id, event_type\)/);
  assert.match(worker, /retry-notifications/);
});

test("só ativa mensuração da Meta após consentimento", async () => {
  const [consent, marketing, privacy, storefront, config, worker] = await Promise.all([
    readFile(new URL("../app/MarketingConsent.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/marketing.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/privacidade/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/Storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tracking/config/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(consent, /Somente essenciais/);
  assert.match(consent, /Aceitar e continuar/);
  assert.match(marketing, /marketingConsentGranted/);
  assert.match(marketing, /connect\.facebook\.net\/pt_BR\/fbevents\.js/);
  assert.match(privacy, /mensuração de anúncios da Meta é opcional/);
  assert.match(storefront, /marketingConsent: marketingConsentGranted\(\)/);
  assert.match(config, /META_PIXEL_ID/);
  assert.match(worker, /https:\/\/connect\.facebook\.net/);
});

test("fecha toda a vitrine até o lançamento sem bloquear o painel", async () => {
  const [worker, launchPage, config, vipAccess] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/launch-page.ts", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.cloudflare.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../lib/vip-access.ts", import.meta.url), "utf8"),
  ]);
  assert.match(config, /"LAUNCH_AT": "2026-11-27T12:00:00\.000Z"/);
  assert.match(config, /"VIP_LAUNCH_AT": "2026-11-26T22:00:00\.000Z"/);
  assert.match(worker, /launchIsActive\(env\)/);
  assert.match(worker, /VIP_ACCESS_TOKEN/);
  assert.match(vipAccess, /__Host-ellejew_vip/);
  assert.match(vipAccess, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(worker, /"\/api\/vip-access"/);
  assert.match(worker, /"\/api\/admin"/);
  assert.match(worker, /"\/api\/payments\/asaas"/);
  assert.match(worker, /renderPrelaunchUnavailable/);
  assert.match(launchPage, /Black Friday/);
  assert.match(launchPage, /America\/Sao_Paulo/);
  assert.match(launchPage, /editorial-ellej-rings\.webp/);
  assert.match(launchPage, /noindex, nofollow, noarchive, nosnippet/);
  assert.match(launchPage, /Disallow: \/\\n/);

  const futureLaunch = { LAUNCH_AT: "2099-11-28T03:00:00.000Z" };
  const productResponse = await render("/produtos/nao-pode-vazar", futureLaunch);
  assert.equal(productResponse.status, 200);
  assert.equal(productResponse.headers.get("cache-control"), "no-store, max-age=0");
  assert.match(productResponse.headers.get("x-robots-tag") ?? "", /noindex/);
  const productHtml = await productResponse.text();
  assert.match(productHtml, /data-split>Black</);
  assert.match(productHtml, /A Black Friday abre em 28 de novembro, às 00h/);

  const storeResponse = await render("/api/store", futureLaunch);
  assert.equal(storeResponse.status, 503);
  assert.match(await storeResponse.text(), /A loja abre/);

  const robotsResponse = await render("/robots.txt", futureLaunch);
  assert.equal(await robotsResponse.text(), "User-agent: *\nDisallow: /\n");

  const adminResponse = await render("/admin", futureLaunch);
  assert.equal(adminResponse.status, 200);
  assert.doesNotMatch(await adminResponse.text(), /A Black Friday abre em/);

  const vipToken = "vip-test-token-with-more-than-32-characters";
  const vipEnv = {
    ...futureLaunch,
    VIP_LAUNCH_AT: "2020-09-10T20:00:00.000Z",
    VIP_ACCESS_TOKEN: vipToken,
  };
  const vipGrant = await render(`/?vip=${encodeURIComponent(vipToken)}`, vipEnv);
  assert.equal(vipGrant.status, 302);
  assert.equal(vipGrant.headers.get("location"), "https://ellejew.example/");
  assert.match(vipGrant.headers.get("set-cookie") ?? "", /__Host-ellejew_vip=.*HttpOnly; Secure; SameSite=Lax/);

  const vipCookie = (vipGrant.headers.get("set-cookie") ?? "").split(";")[0];
  const vipStorefront = await render("/", vipEnv, { cookie: vipCookie });
  assert.equal(vipStorefront.status, 200);
  assert.match(await vipStorefront.text(), /Elle Jew \| Joias em Prata 925 de Luxo/);
  assert.equal(vipStorefront.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.match(vipStorefront.headers.get("x-robots-tag") ?? "", /noindex/);
});

test("libera uma pré-visualização curta somente com cookie assinado pelo admin", async () => {
  const [previewSource, adminRoute, adminPanel, worker] = await Promise.all([
    readFile(new URL("../lib/store-preview.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(previewSource, /__Host-ellejew_preview/);
  assert.match(previewSource, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(previewSource, /previewLifetimeSeconds = 30 \* 60/);
  assert.match(adminRoute, /requireAdminSession\(request\)/);
  assert.ok(adminRoute.indexOf('action === "enableStorePreview"') > adminRoute.indexOf("requireAdminSession(request)"));
  assert.match(adminPanel, /Testar loja/);
  assert.match(worker, /hasStorePreviewCookie/);

  const secret = "preview-test-secret-with-at-least-32-characters";
  const expiresAt = Date.now() + 60_000;
  const signature = createHmac("sha256", secret).update(`ellejew-preview:${expiresAt}`).digest("hex");
  const previewCookie = `__Host-ellejew_preview=${expiresAt}.${signature}`;
  const futureLaunch = { LAUNCH_AT: "2099-11-28T03:00:00.000Z", AUTH_SECRET: secret };
  const previewResponse = await render("/", futureLaunch, { cookie: previewCookie });
  assert.equal(previewResponse.status, 200);
  assert.match(await previewResponse.text(), /Elle Jew \| Joias em Prata 925 de Luxo/);
  assert.equal(previewResponse.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.match(previewResponse.headers.get("x-robots-tag") ?? "", /noindex/);

  const forgedResponse = await render("/", futureLaunch, { cookie: `${previewCookie}forged` });
  assert.match(await forgedResponse.text(), /A Black Friday abre em/);
});

test("aplica o desconto % do produto igual na vitrine, no checkout e no Asaas", async () => {
  const { applyProductDiscount, normalizeDiscountPercent } = await import("../lib/pricing.ts");
  assert.equal(applyProductDiscount(29800, 20), 23840);
  assert.equal(applyProductDiscount(19990, 15), 16992);
  assert.equal(applyProductDiscount(29800, 0), 29800);
  assert.equal(applyProductDiscount(1, 90), 1);
  assert.equal(normalizeDiscountPercent(150), 90);
  assert.equal(normalizeDiscountPercent(-5), 0);
  assert.equal(normalizeDiscountPercent("12.7"), 12);
  const [store, admin, panel, storefront] = await Promise.all([
    readFile(new URL("../lib/store.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/Storefront.tsx", import.meta.url), "utf8"),
  ]);
  // Checkout cobra variação + acréscimos com o mesmo desconto mostrado na vitrine.
  assert.match(store, /applyProductDiscount\(Number\(variant\?\.priceCents \|\| row\.price_cents\), productDiscountPercent\(row\)\)/);
  assert.match(store, /addedPriceCents: applyProductDiscount\(option\.addedPriceCents, discountPercent\)/);
  assert.match(store, /const optionGroups = discountedOptionGroups\(row\.option_groups, productDiscountPercent\(row\)\)/);
  assert.match(store, /compareAtCents: !priceVisible \? null : discountPercent \? basePriceCents/);
  assert.match(admin, /discount_percent = \?/);
  assert.match(panel, /Desconto no preço \(%\)/);
  assert.match(storefront, /selectedProductCompareAt && <del>/);
});
