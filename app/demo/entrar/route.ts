import { NextResponse } from "next/server";
import { getRepo } from "@/lib/database";
import { isMemoryRepo } from "@/lib/database/memory-repo";
import { mintDemoAdminSessionToken } from "@/lib/demo/enter-admin";
import { pickDemoAccount, pickDemoUser } from "@/lib/demo/enter";
import { isDemoMode } from "@/lib/demo-mode";
import { randomToken, sha256 } from "@/lib/encryption/crypto";
import { ADMIN_ABSOLUTE_HOURS, ADMIN_COOKIE, cookieOptions, RESPONDENT_COOKIE, RESPONDENT_SESSION_MINUTES } from "@/lib/security/cookies";

/**
 * Puertas de prueba (POST formulario o GET ?destino=admin).
 * Solo con modo demostración fuera de producción, sobre datos en memoria.
 */
function redirectTo(req: Request, path: string) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const origin = host ? `${proto}://${host}` : new URL(req.url).origin;
  return NextResponse.redirect(new URL(path, origin), 303);
}

async function enterAdmin(req: Request): Promise<NextResponse> {
  const repo = getRepo();
  if (!isMemoryRepo(repo)) return new NextResponse(null, { status: 404 });
  const sessionToken = await mintDemoAdminSessionToken(repo);
  if (!sessionToken) return new NextResponse(null, { status: 404 });
  const response = redirectTo(req, "/admin");
  response.cookies.set(ADMIN_COOKIE(), sessionToken, cookieOptions(ADMIN_ABSOLUTE_HOURS * 3600));
  return response;
}

/** Next prefetches links in view. This GET opens a session, so a prefetch must not. */
function isPrefetch(req: Request): boolean {
  const purpose = (req.headers.get("purpose") ?? req.headers.get("sec-purpose") ?? "").toLowerCase();
  return req.headers.has("next-router-prefetch")
    || req.headers.has("next-router-segment-prefetch")
    || purpose === "prefetch";
}

export async function GET(req: Request) {
  if (!isDemoMode()) return new NextResponse(null, { status: 404 });
  if (isPrefetch(req)) return new NextResponse(null, { status: 204 });
  const destino = new URL(req.url).searchParams.get("destino");
  if (destino === "admin") return enterAdmin(req);
  return new NextResponse(null, { status: 404 });
}

export async function POST(req: Request) {
  if (!isDemoMode()) return new NextResponse(null, { status: 404 });
  const repo = getRepo();
  if (!isMemoryRepo(repo)) return new NextResponse(null, { status: 404 });

  const destino = String((await req.formData()).get("destino") ?? "");
  if (destino === "admin") return enterAdmin(req);

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
      entry_method: "token",
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
