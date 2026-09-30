import { NextResponse } from "next/server";
import { healthResponseSchema } from "@/lib/contracts/api";

export const dynamic = "force-dynamic";

/** Comprobación de disponibilidad. No expone configuración ni datos. */
export function GET() {
  return NextResponse.json(healthResponseSchema.parse({ ok: true }), { headers: { "Cache-Control": "no-store" } });
}
