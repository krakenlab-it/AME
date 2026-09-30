import "server-only";
import { cookies } from "next/headers";
import { getRepo } from "@/lib/database";
import { RESPONDENT_COOKIE } from "@/lib/security/cookies";
import { getRespondentContext } from "@/lib/services/respondent";

export async function readRespondentToken(): Promise<string | undefined> {
  return (await cookies()).get(RESPONDENT_COOKIE())?.value;
}

export async function currentRespondent(opts: { allowSubmitted?: boolean } = {}) {
  return getRespondentContext(getRepo(), await readRespondentToken(), opts);
}
