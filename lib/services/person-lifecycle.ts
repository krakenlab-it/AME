import type { AdminRepo, PersonLifecycle } from "@/lib/database/types";
import { decrypt } from "@/lib/encryption/crypto";
import { can, type AdminRole } from "@/lib/security/rbac";
import { maskCedula, maskCedulaTail } from "@/lib/security/masking";

export const LIFECYCLE_DENIED = "No tiene permiso para esta acción.";
export const LIFECYCLE_MISSING = "No encontramos a esa persona.";
export const LIFECYCLE_RETAINED =
  "Este registro ya fue enviado y sigue en el plazo de conservación. Use Restablecer a invitado, o espere a que la retención lo anonimice. No se elimina la ficha antes.";

export type LifecycleResult =
  | { ok: true; deleteAuthUserId: string | null }
  | { ok: false; error: string };

function maskedDocument(person: PersonLifecycle): string {
  if (!person.nationalIdEncrypted) return maskCedulaTail(person.nationalIdLast2);
  try {
    return maskCedula(decrypt(person.nationalIdEncrypted));
  } catch {
    return maskCedulaTail(person.nationalIdLast2);
  }
}

async function authUserToDelete(repo: AdminRepo, authUserId: string | null): Promise<string | null> {
  if (!authUserId) return null;
  const admin = await repo.findAdminByAuthUserId(authUserId);
  return admin ? null : authUserId;
}

function retained(person: PersonLifecycle): boolean {
  return Boolean(person.submittedAt) && !person.anonymizedAt;
}

export async function resetPersonToGuest(
  repo: AdminRepo,
  input: { personId: string; adminId: string; adminRole: AdminRole | null; reason: string },
): Promise<LifecycleResult> {
  if (!can(input.adminRole, "people:reset-factors")) return { ok: false, error: LIFECYCLE_DENIED };
  const person = await repo.getPersonLifecycle(input.personId);
  if (!person) return { ok: false, error: LIFECYCLE_MISSING };
  const deleteAuthUserId = await authUserToDelete(repo, person.authUserId);
  const cleared = await repo.resetPersonToGuest(input.personId, deleteAuthUserId === null && Boolean(person.authUserId));
  if (!cleared) return { ok: false, error: LIFECYCLE_MISSING };
  await repo.audit({
    person_id: person.id,
    recorded_person_id: person.id,
    actor_type: "admin",
    actor_id: input.adminId,
    action: "PERSON_RESET_TO_GUEST",
    masked_cedula: maskedDocument(person),
    reason: input.reason,
    changed_fields: ["status", "fingerprint_code_hash", "login_email", "auth_user_id"],
    metadata: { auth_user_kept: deleteAuthUserId === null && Boolean(person.authUserId) },
  });
  return { ok: true, deleteAuthUserId };
}

export async function deletePersonRecord(
  repo: AdminRepo,
  input: { personId: string; adminId: string; adminRole: AdminRole | null; reason: string },
): Promise<LifecycleResult> {
  if (!can(input.adminRole, "people:reset-factors")) return { ok: false, error: LIFECYCLE_DENIED };
  const person = await repo.getPersonLifecycle(input.personId);
  if (!person) return { ok: false, error: LIFECYCLE_MISSING };
  if (retained(person)) return { ok: false, error: LIFECYCLE_RETAINED };
  const deleteAuthUserId = await authUserToDelete(repo, person.authUserId);
  await repo.audit({
    person_id: person.id,
    recorded_person_id: person.id,
    actor_type: "admin",
    actor_id: input.adminId,
    action: "PERSON_DELETED",
    masked_cedula: maskedDocument(person),
    reason: input.reason,
    metadata: { auth_user_kept: deleteAuthUserId === null && Boolean(person.authUserId) },
  });
  const removed = await repo.deletePerson(input.personId);
  if (!removed) return { ok: false, error: LIFECYCLE_MISSING };
  return { ok: true, deleteAuthUserId };
}
