import { NextResponse } from "next/server";
import { getRepo } from "@/lib/database";
import { adminForAction } from "@/lib/server/admin-guard";
import { ipHash } from "@/lib/security/request";
import { createAigExport, EXPORT_PROFILES, ExportError, type ExportFormat, type ExportProfile } from "@/lib/services/export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" };

export async function POST(req: Request) {
  // Protección CSRF: la petición debe venir del mismo origen (además de la cookie SameSite=Strict)
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403, headers: noStore });
  }
  const ctx = await adminForAction("export:create");
  if (!ctx) {
    await getRepo().logSecurityEvent({ event_type: "EXPORT_DENIED", ip_hash: ipHash(req.headers) });
    return NextResponse.json({ error: "No tienes permiso para exportar información." }, { status: 403, headers: noStore });
  }
  let body: { profile?: string; format?: string; purpose?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 400, headers: noStore });
  }
  const profile = body.profile as ExportProfile;
  const format = body.format as ExportFormat;
  if (!(profile in EXPORT_PROFILES) || !["xlsx", "csv"].includes(format)) {
    return NextResponse.json({ error: "Solicitud no válida." }, { status: 400, headers: noStore });
  }
  try {
    const file = await createAigExport(getRepo(), {
      adminId: ctx.admin.id,
      role: ctx.admin.role,
      profile,
      format,
      purpose: String(body.purpose ?? ""),
      ipHash: ipHash(req.headers),
    });
    return new Response(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        ...noStore,
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "X-Record-Count": String(file.count),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof ExportError) return NextResponse.json({ error: err.message }, { status: 400, headers: noStore });
    console.error("[export] error inesperado");
    return NextResponse.json({ error: "No se pudo generar el archivo." }, { status: 500, headers: noStore });
  }
}
