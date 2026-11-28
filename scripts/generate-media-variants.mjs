// Gera versões reduzidas (WebP 480px e 960px) das fotos usadas na loja e envia ao R2
// em "variants/". As fotos originais NÃO são alteradas nem apagadas.
// A rota /api/media?key=...&w=480|960 serve a versão reduzida quando ela existe e
// cai na original quando não existe — então rodar este script é sempre seguro.
//
// Uso: npm run media:variants        (gera só o que ainda falta)
//      npm run media:variants -- --all  (refaz todas)
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const site = process.env.PUBLIC_SITE_URL || "https://ellejew.com.br";
const bucket = "elle-jew-media";
const widths = [480, 960];
const redoAll = process.argv.includes("--all");
const parallel = 4;

const { default: sharp } = await import("sharp").catch(() => {
  console.error("Instale o sharp antes: npm i -D sharp");
  process.exit(1);
});

const catalog = await fetch(`${site}/api/catalog`).then((response) => response.text());
const keys = [...new Set([...catalog.matchAll(/\/api\/media\?key=([a-f0-9-]{36}\.(?:jpg|png|webp))/g)].map((match) => match[1]))];
console.log(`${keys.length} fotos encontradas no catálogo.`);

const dir = await mkdtemp(path.join(tmpdir(), "ellejew-variants-"));
const jobs = keys.flatMap((key) => widths.map((width) => ({ key, width })));
let done = 0;
let skipped = 0;
let failed = 0;

async function variantExists(key, width) {
  // A versão reduzida é servida sem "Accept-Ranges"; a original sempre tem.
  const response = await fetch(`${site}/api/media?key=${key}&w=${width}`, { method: "HEAD" });
  return response.ok && !response.headers.has("accept-ranges");
}

async function process_({ key, width }) {
  if (!redoAll && await variantExists(key, width)) { skipped += 1; return; }
  const original = Buffer.from(await fetch(`${site}/api/media?key=${key}`).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.arrayBuffer();
  }));
  const output = await sharp(original).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const target = `variants/${key.replace(/\.[a-z0-9]+$/, "")}-w${width}.webp`;
  const file = path.join(dir, target.replace(/\//g, "_"));
  await writeFile(file, output);
  await run("npx", ["wrangler", "r2", "object", "put", `${bucket}/${target}`, "--file", file, "--content-type", "image/webp", "--remote", "--config", "wrangler.cloudflare.jsonc"], { shell: process.platform === "win32" });
  done += 1;
  console.log(`✓ ${target}  ${Math.round(original.length / 1024)} KB → ${Math.round(output.length / 1024)} KB`);
}

const queue = [...jobs];
await Promise.all(Array.from({ length: parallel }, async () => {
  while (queue.length) {
    const job = queue.shift();
    try { await process_(job); } catch (error) { failed += 1; console.error(`✗ ${job.key} w${job.width}: ${error.message}`); }
  }
}));
await rm(dir, { recursive: true, force: true });
console.log(`Pronto: ${done} geradas, ${skipped} já existiam, ${failed} com erro.`);
if (failed) process.exitCode = 1;
