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
