import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Comprobación de disponibilidad. No expone configuración ni datos. */
export function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
