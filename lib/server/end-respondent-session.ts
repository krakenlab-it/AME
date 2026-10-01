import "server-only";
import { cookies } from "next/headers";
import { getRepo } from "@/lib/database";
import { cookieOptions, RESPONDENT_COOKIE } from "@/lib/security/cookies";
import { currentRespondent } from "@/lib/server/respondent-session";

/** Revoca la sesión del asegurado en el servidor y borra la cookie del navegador. */
export async function endRespondentSession(): Promise<void> {
  const ctx = await currentRespondent({ allowSubmitted: true });
  if (ctx) await getRepo().revokeRespondentSession(ctx.session.id);
  (await cookies()).set(RESPONDENT_COOKIE(), "", cookieOptions(0));
}
