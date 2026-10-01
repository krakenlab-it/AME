"use server";

import { redirect } from "next/navigation";
import { endRespondentSession } from "@/lib/server/end-respondent-session";

export async function leaveAccountAction(): Promise<void> {
  await endRespondentSession();
  redirect("/?fin=cuenta");
}
