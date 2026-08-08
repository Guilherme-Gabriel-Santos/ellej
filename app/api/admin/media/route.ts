import { env } from "cloudflare:workers";
import { assertSameOrigin, requireAdminSession, writeAudit } from "../../../../lib/admin-auth";
import { getD1 } from "../../../../lib/store";

const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireAdminSession(request);
    if (!env.MEDIA) throw new Error("O armazenamento de imagens ainda não foi configurado.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Escolha uma foto.");
    const extension = allowedTypes.get(file.type);
    if (!extension) throw new Error("Use uma foto JPG, PNG ou WebP.");
    if (file.size <= 0 || file.size > 8 * 1024 * 1024) throw new Error("A foto precisa ter no máximo 8 MB.");

    const key = `${crypto.randomUUID()}.${extension}`;
    await env.MEDIA.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { originalName: file.name.slice(0, 180), uploadedBy: session.userId },
    });
    await getD1()
      .prepare("INSERT INTO media_assets (key, content_type, size, original_name, uploaded_by) VALUES (?, ?, ?, ?, ?)")
      .bind(key, file.type, file.size, file.name.slice(0, 180), session.userId)
      .run();
    await writeAudit(session.userId, "media.uploaded", "media_asset", key, { size: file.size, type: file.type });
    return json({ key, url: `/api/media?key=${encodeURIComponent(key)}` }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível enviar a foto.";
    return json({ error: message === "UNAUTHORIZED" ? "Sua sessão expirou. Entre novamente." : message }, message === "UNAUTHORIZED" ? 401 : 400);
  }
}
