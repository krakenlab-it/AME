import { beforeEach, describe, expect, it } from "vitest";
import { randomToken, sha256 } from "@/lib/encryption/crypto";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { GENERIC_IDENTIFY_ERROR } from "@/lib/validation/constants";
import { resumeImportedPersonByCedula } from "@/lib/services/respondent";
import { makeCedula } from "./helpers/cedula";

const JUAN = "1710034065";
const deps = (ipHash = "ip-landing") => ({ ipHash, captchaEnabled: false, verifyCaptcha: async () => true });

let repo: MemoryRepo;

beforeEach(() => {
  repo = new MemoryRepo();
});

describe("resumeImportedPersonByCedula", () => {
  it("abre sesión del formulario para una persona importada con enlace vigente", async () => {
    const id = repo.addPerson("Juan Carlos", "Pérez López", JUAN, "PENDING");
    repo.addToken(id, sha256(randomToken()));
    const result = await resumeImportedPersonByCedula(repo, { cedula: JUAN }, deps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const session = await repo.findRespondentSession(sha256(result.sessionToken));
      expect(session?.person_id).toBe(id);
    }
    expect((await repo.getPerson(id))?.status).toBe("STARTED");
  });

  it("no crea personas nuevas si la cédula no está importada", async () => {
    const before = repo.people.size;
    const result = await resumeImportedPersonByCedula(repo, { cedula: makeCedula("171009999") }, deps());
    expect(result).toMatchObject({ ok: false, error: GENERIC_IDENTIFY_ERROR });
    expect(repo.people.size).toBe(before);
  });

  it("rechaza registros ya enviados aunque exista la cédula", async () => {
    const id = repo.addPerson("María", "Andrade", makeCedula("010203040"), "COMPLETED");
    const person = repo.people.get(id)!;
    person.submitted_at = new Date().toISOString();
    repo.addToken(id, sha256(randomToken()));
    const result = await resumeImportedPersonByCedula(repo, { cedula: makeCedula("010203040") }, deps());
    expect(result).toMatchObject({ ok: false, error: GENERIC_IDENTIFY_ERROR });
  });

  it("falla si la persona importada no tiene enlace activo", async () => {
    repo.addPerson("Luis", "Paz", JUAN, "PENDING");
    const result = await resumeImportedPersonByCedula(repo, { cedula: JUAN }, deps());
    expect(result).toMatchObject({ ok: false, error: GENERIC_IDENTIFY_ERROR });
  });
});
