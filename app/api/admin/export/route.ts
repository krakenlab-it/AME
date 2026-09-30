import { NextResponse } from "next/server";
import { apiErrorBody, isSameOrigin, parseExportRequest } from "@/lib/contracts/api";
import { getRepo } from "@/lib/database";
import { adminForAction } from "@/lib/server/admin-guard";
import { ipHash } from "@/lib/security/request";
import { createAigExport, ExportError } from "@/lib/services/export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" };

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!isSameOrigin(origin, host)) {
    return NextResponse.json(apiErrorBody("Origen no permitido."), { status: 403, headers: noStore });
  }
  const ctx = await adminForAction("export:create");
  if (!ctx) {
    await getRepo().logSecurityEvent({ event_type: "EXPORT_DENIED", ip_hash: ipHash(req.headers) });
    return NextResponse.json(apiErrorBody("No tienes permiso para exportar información."), { status: 403, headers: noStore });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(apiErrorBody("Solicitud no válida."), { status: 400, headers: noStore });
  }
  const parsed = parseExportRequest(body);
  if (!parsed.ok) {
    return NextResponse.json(apiErrorBody("Solicitud no válida."), { status: 400, headers: noStore });
  }
  try {
    const file = await createAigExport(getRepo(), {
      adminId: ctx.admin.id,
      role: ctx.admin.role,
      profile: parsed.value.profile,
      format: parsed.value.format,
      purpose: parsed.value.purpose,
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
    if (err instanceof ExportError) return NextResponse.json(apiErrorBody(err.message), { status: 400, headers: noStore });
    console.error("[export] error inesperado");
    return NextResponse.json(apiErrorBody("No se pudo generar el archivo."), { status: 500, headers: noStore });
  }
}
