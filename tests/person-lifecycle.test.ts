import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { decrypt } from "@/lib/encryption/crypto";
import { maskCedula } from "@/lib/security/masking";
import { can } from "@/lib/security/rbac";
import { deletePersonRecord, LIFECYCLE_DENIED, LIFECYCLE_RETAINED, resetPersonToGuest } from "@/lib/services/person-lifecycle";

const CEDULA = "1710034065";

describe("restablecer y eliminar persona", () => {
  it("un rol que no es admin no cambia la ficha", async () => {
    expect(can("REVIEWER", "people:reset-factors")).toBe(false);
    expect(can("ADMIN", "people:reset-factors")).toBe(true);
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Ana", "Gómez", CEDULA);
    repo.outreachEmails.set(personId, "ana@example.com");
    const blocked = await resetPersonToGuest(repo, { personId, adminId: "x", adminRole: "REVIEWER", reason: "prueba de permiso" });
    expect(blocked).toEqual({ ok: false, error: LIFECYCLE_DENIED });
    expect(repo.outreachEmails.get(personId)).toBe("ana@example.com");
    expect(repo.people.has(personId)).toBe(true);
  });

  it("restablecer conserva el correo de precarga y borra el código dactilar", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Ana", "Gómez", CEDULA, "COMPLETED");
    repo.outreachEmails.set(personId, "ana@example.com");
    repo.people.get(personId)!.submitted_at = new Date().toISOString();
    repo.people.get(personId)!.confirmation_code = "AIG-12345678";
    repo.generalAuth.set(personId, {
      fingerprint_code_hash: "hash",
      fingerprint_claimed_at: new Date().toISOString(),
      totp_secret_encrypted: "secret",
      totp_enabled_at: new Date().toISOString(),
      failed_attempts: 2,
      locked_until: null,
      challenge_hash: "ch",
      challenge_expires_at: null,
      challenge_purpose: "cedula",
      auth_user_id: "auth-respondent",
    });
    repo.addToken(personId, "token-hash");
    const result = await resetPersonToGuest(repo, { personId, adminId: "admin-1", adminRole: "ADMIN", reason: "código equivocado" });
    expect(result).toEqual({ ok: true, deleteAuthUserId: "auth-respondent" });
    const person = repo.people.get(personId)!;
    expect(repo.outreachEmails.get(personId)).toBe("ana@example.com");
    expect(person.national_id_hash).toBeTruthy();
    expect(person.status).toBe("PENDING");
    expect(person.submitted_at).toBeNull();
    expect(person.confirmation_code).toBeNull();
    expect(repo.generalAuth.get(personId)?.fingerprint_code_hash).toBeNull();
    expect(repo.generalAuth.get(personId)?.auth_user_id).toBeNull();
    expect([...repo.tokens.values()].some((token) => token.person_id === personId)).toBe(false);
    const audit = repo.auditLog.find((entry) => entry.action === "PERSON_RESET_TO_GUEST");
    expect(audit?.recorded_person_id).toBe(personId);
    expect(audit?.reason).toBe("código equivocado");
    expect(audit?.masked_cedula).toBe(maskCedula(decrypt(person.national_id_encrypted!)));
  });

  it("no borra ni desvincula un usuario de Auth que también es administrador", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Ana", "Gómez", CEDULA);
    repo.generalAuth.set(personId, {
      fingerprint_code_hash: null,
      fingerprint_claimed_at: null,
      totp_secret_encrypted: null,
      totp_enabled_at: null,
      failed_attempts: 0,
      locked_until: null,
      challenge_hash: null,
      challenge_expires_at: null,
      challenge_purpose: null,
      auth_user_id: "auth-shared",
    });
    repo.people.get(personId)!.login_email = "admin@example.com";
    repo.createAdminSync({ email: "admin@example.com", full_name: "Admin", role: "ADMIN", auth_user_id: "auth-shared" });
    const result = await resetPersonToGuest(repo, { personId, adminId: "admin-1", adminRole: "ADMIN", reason: "comparte acceso" });
    expect(result).toEqual({ ok: true, deleteAuthUserId: null });
    expect(repo.generalAuth.get(personId)?.auth_user_id).toBe("auth-shared");
    expect(repo.people.get(personId)?.login_email).toBe("admin@example.com");
    expect(repo.auditLog.find((entry) => entry.action === "PERSON_RESET_TO_GUEST")?.metadata).toMatchObject({ auth_user_kept: true });
  });

  it("eliminar deja la auditoría con el id de la persona después de borrar la ficha", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Ana", "Gómez", CEDULA);
    repo.outreachEmails.set(personId, "ana@example.com");
    const result = await deletePersonRecord(repo, { personId, adminId: "admin-1", adminRole: "ADMIN", reason: "duplicado de prueba" });
    expect(result).toEqual({ ok: true, deleteAuthUserId: null });
    expect(repo.people.has(personId)).toBe(false);
    const audit = repo.auditLog.find((entry) => entry.action === "PERSON_DELETED");
    expect(audit?.recorded_person_id).toBe(personId);
    expect(audit?.actor_id).toBe("admin-1");
    expect(audit?.reason).toBe("duplicado de prueba");
    expect(audit?.masked_cedula).toBe(maskCedula(CEDULA));
    expect(audit?.created_at).toEqual(expect.stringMatching(/^\d{4}-/));
  });

  it("no elimina un registro enviado que todavía no fue anonimizado", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Ana", "Gómez", CEDULA, "COMPLETED");
    repo.people.get(personId)!.submitted_at = new Date().toISOString();
    const blocked = await deletePersonRecord(repo, { personId, adminId: "admin-1", adminRole: "ADMIN", reason: "quiere borrarlo ya" });
    expect(blocked).toEqual({ ok: false, error: LIFECYCLE_RETAINED });
    expect(repo.people.has(personId)).toBe(true);
    expect(repo.auditLog.some((entry) => entry.action === "PERSON_DELETED")).toBe(false);
  });
});
