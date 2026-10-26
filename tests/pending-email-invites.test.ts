import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/database/memory-repo";

describe("invitados por correo pendientes", () => {
  it("cuenta correos sin ficha, ignora mayúsculas y deja fuera el que ya está vinculado", async () => {
    const repo = new MemoryRepo();
    repo.preloadedContacts.push(
      { email: "ana@example.com", phone: "+593991110001", firstNames: "Ana", lastNames: "Pérez", comunidad: "Quito" },
      { email: "luis@example.com", phone: null, firstNames: "Luis", lastNames: "Mora", comunidad: null },
      { email: null, phone: "+593991110002", firstNames: "Sin nombre", lastNames: "Registrado", comunidad: null },
    );
    const linked = repo.addPerson("Ana", "Pérez", "1710034065");
    repo.people.get(linked)!.login_email = "ANA@example.com";
    expect(await repo.pendingEmailInvites()).toBe(2);

    const outreach = repo.addPerson("Luis", "Mora", "0926687856");
    repo.outreachEmails.set(outreach, "Luis@Example.com");
    expect(await repo.pendingEmailInvites()).toBe(1);
    expect(await repo.statusCounts()).toEqual({ PENDING: 2, STARTED: 0, COMPLETED: 0, NEEDS_REVIEW: 0 });
  });
});
