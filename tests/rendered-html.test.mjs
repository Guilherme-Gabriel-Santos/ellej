import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`https://ellejew.example${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
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

  const html = await response.text();
  assert.match(html, /<title>Elle Jew \| Joias em Prata 925 de Luxo<\/title>/i);
  assert.match(html, /Você é a ocasião/);
  assert.match(html, /Choker 5 Corações/);
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
  assert.match(styles, /touch-action: pan-y/);
  assert.match(styles, /\.modal-media-arrow/);
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
