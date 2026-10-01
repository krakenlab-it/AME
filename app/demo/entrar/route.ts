import { NextResponse } from "next/server";
import { getRepo } from "@/lib/database";
import { isMemoryRepo } from "@/lib/database/memory-repo";
import { pickDemoAccount, pickDemoUser } from "@/lib/demo/enter";
import { isDemoMode } from "@/lib/demo-mode";
import { randomToken, sha256 } from "@/lib/encryption/crypto";
import { ADMIN_ABSOLUTE_HOURS, ADMIN_COOKIE, cookieOptions, RESPONDENT_COOKIE, RESPONDENT_SESSION_MINUTES } from "@/lib/security/cookies";
import { startDemoSession } from "@/lib/services/demo-admin-auth";

/**
 * Puertas de prueba, por un formulario normal (no una Server Action).
 * Solo con DEMO_MODE fuera de producción, y solo sobre datos ficticios en memoria.
 */
function redirectTo(req: Request, path: string) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const origin = host ? `${proto}://${host}` : new URL(req.url).origin;
  return NextResponse.redirect(new URL(path, origin), 303);
}

export async function POST(req: Request) {
  if (!isDemoMode()) return new NextResponse(null, { status: 404 });
  const repo = getRepo();
  if (!isMemoryRepo(repo)) return new NextResponse(null, { status: 404 });

  const destino = String((await req.formData()).get("destino") ?? "");
  if (destino === "admin") {
    const admin = await repo.findAdminByEmail("admin@demo.local");
    if (!admin) return new NextResponse(null, { status: 404 });
    const response = redirectTo(req, "/admin");
    response.cookies.set(ADMIN_COOKIE(), startDemoSession(repo, admin.id), cookieOptions(ADMIN_ABSOLUTE_HOURS * 3600));
    return response;
  }

  if (destino === "usuario" || destino === "cuenta") {
    const people = [...repo.people.values()];
    const person = destino === "cuenta" ? pickDemoAccount(people) : pickDemoUser(people);
    const token = person ? [...repo.tokens.values()].find((item) => item.person_id === person.id && !item.revoked_at) : undefined;
    if (!person || !token) return new NextResponse(null, { status: 404 });
    const sessionToken = randomToken(32);
    await repo.createRespondentSession({
      session_hash: sha256(sessionToken),
      person_id: person.id,
      access_token_id: token.id,
      expires_at: new Date(Date.now() + RESPONDENT_SESSION_MINUTES * 60_000).toISOString(),
      submitted_at: destino === "cuenta" ? person.submitted_at : null,
    });
    if (destino === "usuario") await repo.markStarted(person.id);
    const response = redirectTo(req, destino === "cuenta" ? "/mi-cuenta" : "/verificar/formulario");
    response.cookies.set(RESPONDENT_COOKIE(), sessionToken, cookieOptions(RESPONDENT_SESSION_MINUTES * 60));
    return response;
  }

  return new NextResponse(null, { status: 404 });
}
