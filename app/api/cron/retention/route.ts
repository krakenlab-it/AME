import { NextResponse } from "next/server";
import { apiErrorBody, cronAuthorized, retentionResponseSchema } from "@/lib/contracts/api";
import { getRepo } from "@/lib/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Ejecutado a diario por Vercel Cron (vercel.json). Vercel envía "Authorization: Bearer $CRON_SECRET". */
export async function GET(req: Request) {
  if (!cronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json(apiErrorBody("No autorizado"), { status: 401 });
  }
  const repo = getRepo();
  const anonymized = await repo.anonymizeExpired();
  await repo.purgeExpiredSessions();
  return NextResponse.json(retentionResponseSchema.parse({ ok: true, anonymized }), {
    headers: { "Cache-Control": "no-store" },
  });
}
