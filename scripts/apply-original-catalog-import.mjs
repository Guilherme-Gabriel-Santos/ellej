import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.resolve(process.argv[2] ?? ".tmp/catalog-sync/r2-uploads.json");
const sqlPath = path.resolve(process.argv[3] ?? ".tmp/catalog-sync/catalog-import.sql");
const expectedAccountId = "b151a2532f55a18bf3fa73c40e5f33db";
const bucket = "elle-jew-media";
const database = "elle-jew-db";
const config = "wrangler.cloudflare.jsonc";
const wranglerPath = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");

function runWrangler(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wranglerPath, ...args], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${stderr || stdout}\nWrangler encerrou com código ${code}.`));
    });
  });
}

async function mapConcurrent(items, concurrency, mapper) {
  let cursor = 0;
  let completed = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        await mapper(items[index]);
      } catch (error) {
        cursor = items.length;
        throw error;
      }
      completed += 1;
      if (completed % 10 === 0 || completed === items.length) {
        console.log(`Fotos enviadas: ${completed}/${items.length}`);
      }
    }
  }
  const results = await Promise.allSettled(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

const uploads = JSON.parse(await readFile(manifestPath, "utf8"));
if (!Array.isArray(uploads) || !uploads.length) throw new Error("A lista de fotos está vazia.");
await stat(sqlPath);

const account = await runWrangler(["whoami"]);
if (!account.stdout.includes(expectedAccountId)) {
  throw new Error("A conta Cloudflare ativa não é a conta de produção da Elle Jew.");
}

for (const upload of uploads) {
  const file = await stat(upload.filePath);
  if (!file.isFile() || file.size <= 0) throw new Error(`Foto inválida: ${upload.filePath}`);
}

console.log(`Conta confirmada. Enviando ${uploads.length} fotos para o R2...`);
await mapConcurrent(uploads, 4, (upload) => runWrangler([
  "r2", "object", "put", `${bucket}/${upload.key}`,
  "--file", upload.filePath,
  "--content-type", upload.contentType,
  "--cache-control", "public, max-age=31536000, immutable",
  "--remote",
  "--config", config,
  "--force",
]));

console.log("Todas as fotos foram enviadas. Aplicando o catálogo no D1...");
await runWrangler([
  "d1", "execute", database,
  "--remote",
  "--config", config,
  "--file", sqlPath,
  "--yes",
]);
console.log("Catálogo aplicado com sucesso.");
