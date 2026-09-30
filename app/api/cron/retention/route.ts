import { NextResponse } from "next/server";
import { getRepo } from "@/lib/database";
import { safeEqual } from "@/lib/encryption/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Ejecutado a diario por Vercel Cron (vercel.json). Vercel envía "Authorization: Bearer $CRON_SECRET". */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || secret.length < 16 || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const repo = getRepo();
  const anonymized = await repo.anonymizeExpired();
  await repo.purgeExpiredSessions();
  return NextResponse.json({ ok: true, anonymized }, { headers: { "Cache-Control": "no-store" } });
}
