"use server";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getRepo } from "@/lib/database";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { isDemoMode } from "@/lib/demo-mode";
import { randomToken, sha256 } from "@/lib/encryption/crypto";
import { ADMIN_ABSOLUTE_HOURS, ADMIN_COOKIE, cookieOptions, RESPONDENT_COOKIE, RESPONDENT_SESSION_MINUTES } from "@/lib/security/cookies";
import { ADMIN_ROLES, type AdminRole } from "@/lib/security/rbac";
import { startDemoSession } from "@/lib/services/demo-admin-auth";

/**
 * Atajos de prueba. Solo existen con DEMO_MODE=true fuera de producción y solo actúan sobre la base
 * en memoria con datos ficticios: jamás tocan Supabase ni la autenticación real.
 */
function demoRepoOrNotFound(): MemoryRepo {
  if (!isDemoMode()) notFound();
  const repo = getRepo();
  if (!(repo instanceof MemoryRepo)) notFound();
  return repo;
}

const DEMO_ADMIN_EMAIL: Record<AdminRole, string> = {
  ADMIN: "admin@demo.local",
  REVIEWER: "revisor@demo.local",
  EXPORTER: "exportador@demo.local",
};

export async function demoEnterAdminAction(formData: FormData): Promise<void> {
  const repo = demoRepoOrNotFound();
  const role = ADMIN_ROLES.find((r) => r === formData.get("role"));
  if (!role) notFound();
  const admin = await repo.findAdminByEmail(DEMO_ADMIN_EMAIL[role]);
  if (!admin) notFound();
  (await cookies()).set(ADMIN_COOKIE(), startDemoSession(repo, admin.id), cookieOptions(ADMIN_ABSOLUTE_HOURS * 3600));
  redirect("/admin");
}

export async function demoEnterRespondentAction(formData: FormData): Promise<void> {
  const repo = demoRepoOrNotFound();
  const personId = String(formData.get("personId") ?? "");
  const person = repo.people.get(personId);
  const token = [...repo.tokens.values()].find((t) => t.person_id === personId && !t.revoked_at);
  if (!person || !token || person.submitted_at) notFound();

  const sessionToken = randomToken(32);
  await repo.createRespondentSession({
    session_hash: sha256(sessionToken),
    person_id: person.id,
    access_token_id: token.id,
    expires_at: new Date(Date.now() + RESPONDENT_SESSION_MINUTES * 60_000).toISOString(),
  });
  await repo.markStarted(person.id);
  (await cookies()).set(RESPONDENT_COOKIE(), sessionToken, cookieOptions(RESPONDENT_SESSION_MINUTES * 60));
  redirect("/verificar/formulario");
}
