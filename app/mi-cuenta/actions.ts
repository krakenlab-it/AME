"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRepo } from "@/lib/database";
import { cookieOptions, RESPONDENT_COOKIE } from "@/lib/security/cookies";
import { currentRespondent } from "@/lib/server/respondent-session";

export async function leaveAccountAction(): Promise<void> {
  const ctx = await currentRespondent({ allowSubmitted: true });
  if (ctx) await getRepo().revokeRespondentSession(ctx.session.id);
  (await cookies()).set(RESPONDENT_COOKIE(), "", cookieOptions(0));
  redirect("/?fin=cuenta");
}
