import { env } from "cloudflare:workers";
import { sendLaunchNotifications } from "../../../../lib/launch";
import { ensureStoreSchema } from "../../../../lib/store";

const encoder = new TextEncoder();

function secureEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return mismatch === 0;
}

export async function POST(request: Request) {
  const configured = String(env.AUTH_SECRET ?? "");
  const received = request.headers.get("x-ellejew-job-token") ?? "";
  if (configured.length < 32 || !secureEqual(received, configured)) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    await ensureStoreSchema();
    const result = await sendLaunchNotifications();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Launch notification job failed", { error: error instanceof Error ? error.message : "unknown" });
    return new Response("Launch notification failed", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
