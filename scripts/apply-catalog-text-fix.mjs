import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const auditPath = path.resolve(process.argv[2] ?? ".tmp/catalog-sync/original-catalog-audit.json");
const reportPath = path.resolve(process.argv[3] ?? ".tmp/catalog-sync/catalog-import-report.json");
const expectedAccountId = "b151a2532f55a18bf3fa73c40e5f33db";
const wranglerPath = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

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
        console.log(`Descrições atualizadas: ${completed}/${items.length}`);
      }
    }
  }
  const results = await Promise.allSettled(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

const audit = JSON.parse(await readFile(auditPath, "utf8"));
const report = JSON.parse(await readFile(reportPath, "utf8"));
const reportBySlug = new Map(report.products.map((product) => [product.slug, product]));
const account = await runWrangler(["whoami"]);
if (!account.stdout.includes(expectedAccountId)) {
  throw new Error("A conta Cloudflare ativa não é a conta de produção da Elle Jew.");
}

const updates = audit.products.map((product) => {
  const imported = reportBySlug.get(product.sourceSlug);
  if (!imported) throw new Error(`Produto sem correspondência: ${product.sourceSlug}`);
  return `UPDATE products SET description = ${sql(product.description)}, material = ${sql(product.material)} WHERE id = ${sql(imported.id)} AND slug = ${sql(product.sourceSlug)};`;
});

await mapConcurrent(updates, 4, async (command) => {
  const result = await runWrangler([
    "d1", "execute", "elle-jew-db",
    "--remote",
    "--config", "wrangler.cloudflare.jsonc",
    "--command", command,
    "--json",
  ]);
  const output = JSON.parse(result.stdout);
  if (!output?.[0]?.success) throw new Error("O D1 não confirmou uma atualização de descrição.");
});

console.log("Todas as descrições foram atualizadas com sucesso.");
