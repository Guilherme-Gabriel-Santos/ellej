import { readFile } from "node:fs/promises";

function parseEnv(source) {
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

const values = parseEnv(await readFile(".env.production", "utf8"));
const apiKey = values.RESEND_API_KEY ?? "";
const sender = values.ADMIN_FROM_EMAIL ?? "";
const senderMatch = sender.match(/<?[^@<>\s]+@([^<>\s]+)>?$/i);
const senderDomain = senderMatch?.[1]?.toLowerCase() ?? "";

const response = await fetch("https://api.resend.com/domains", {
  headers: { Authorization: `Bearer ${apiKey}` },
});
const body = await response.json().catch(() => ({}));
const domains = Array.isArray(body.data) ? body.data : [];
const registeredDomain = domains.find((domain) => String(domain.name ?? "").toLowerCase() === senderDomain);
const detailResponse = registeredDomain?.id
  ? await fetch(`https://api.resend.com/domains/${encodeURIComponent(String(registeredDomain.id))}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
  : null;
const detailBody = detailResponse ? await detailResponse.json().catch(() => ({})) : {};
const dnsRecords = Array.isArray(detailBody.records) ? detailBody.records : [];

console.log(JSON.stringify({
  apiKeyConfigured: Boolean(apiKey),
  apiKeyFormat: apiKey.startsWith("re_"),
  apiKeyAccepted: response.ok,
  httpStatus: response.status,
  fromConfigured: Boolean(senderMatch),
  senderDomain,
  senderUsesTestDomain: senderDomain === "resend.dev",
  senderDomainRegistered: Boolean(registeredDomain),
  senderDomainVerified: registeredDomain?.status === "verified",
  senderDnsRecordCount: dnsRecords.length,
  senderDnsRecords: dnsRecords.map((record) => ({
    name: String(record.name ?? ""),
    type: String(record.type ?? ""),
    status: String(record.status ?? ""),
  })),
  loginCodeDisabledLocally: values.ADMIN_LOGIN_CODE_DISABLED === "true",
}));

if (!response.ok) process.exitCode = 1;
