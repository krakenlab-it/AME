import { afterEach, describe, expect, it } from "vitest";
import { encrypt } from "@/lib/encryption/crypto";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { can, ForbiddenError } from "@/lib/security/rbac";
import { importNovedades, parseImportFile, validateImportRows } from "@/lib/services/import";
import { sendMissingLinkEmails } from "@/lib/services/link-mail";
import { applyManualPersonEdit, parseManualEdit } from "@/lib/services/manual-edit";
import { buildUnibrokersTable, createUnibrokersPackage, unibrokersSyncMissing } from "@/lib/services/unibrokers";
import { makeCedula } from "./helpers/cedula";

const CEDULA = "1710034065";
const ENV = ["UNIBROKERS_API_URL", "UNIBROKERS_API_KEY"] as const;

afterEach(() => {
  for (const key of ENV) delete process.env[key];
});

describe("nota de novedades de la carga", () => {
  it("dice que la carga fue exitosa cuando no hay observaciones", () => {
    expect(importNovedades({ committed: true, imported: 3, rejected: 0, notes: 0 })).toEqual({
      noteTitle: "La carga fue exitosa",
      noteBody: "Se importaron 3 personas. No hay novedades.",
    });
  });

  it("explica que no se importó nada cuando la cédula no pasa", () => {
    const note = importNovedades({ committed: false, imported: 0, rejected: 2, notes: 0 });
    expect(note.noteTitle).toBe("Nota de novedades");
    expect(note.noteBody).toMatch(/No se importó ningún registro/);
  });

  it("pide 10 dígitos y deja pasar un correo mal escrito como observación", () => {
    const cedula = makeCedula("171003406");
    const checked = validateImportRows([
      { row: 2, first_names: "Ana", last_names: "Paz", national_id: "123", outreach_email: "" },
      { row: 3, first_names: "Luis", last_names: "Paz", national_id: cedula, outreach_email: "sin-arroba" },
    ]);
    expect(checked.errors[0]?.reason).toMatch(/10 dígitos/);
    expect(checked.valid).toHaveLength(1);
    expect(checked.valid[0]?.outreach_email).toBe("");
    expect(checked.notes[0]?.text).toMatch(/correo/i);
  });

  it("lee la plantilla en español y guarda el correo para el enlace", async () => {
    const csv = new TextEncoder().encode(`Nombres,Apellidos,Cédula,Correo\nJuan Carlos,Pérez López,${CEDULA},juan@correo.com\n`);
    const parsed = await parseImportFile(csv.buffer as ArrayBuffer, "plantilla.csv");
    expect(parsed[0]).toMatchObject({ first_names: "Juan Carlos", last_names: "Pérez López", national_id: CEDULA, outreach_email: "juan@correo.com" });
  });
});

describe("cambio manual con verificación", () => {
  it("no escribe la ficha si no se confirmó el código", async () => {
    const repo = new MemoryRepo();
    const id = repo.addPerson("Ana", "Paz", CEDULA);
    const parsed = parseManualEdit({ firstNames: "Ana María", lastNames: "Paz", outreachEmail: "ana@correo.com", contact: null });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const denied = await applyManualPersonEdit(repo, { personId: id, adminId: "adm", patch: parsed.patch, mfaConfirmed: false });
    expect(denied.ok).toBe(false);
    expect(repo.people.get(id)?.first_names).toBe("Ana");
    expect(repo.auditLog.some((event) => event.action === "MANUAL_EDIT")).toBe(false);
  });

  it("guarda quién cambió qué campos, sin los valores nuevos", async () => {
    const repo = new MemoryRepo();
    const id = repo.addPerson("Ana", "Paz", CEDULA);
    const parsed = parseManualEdit({ firstNames: "Ana María", lastNames: "Paz León", outreachEmail: "ana@correo.com", contact: null });
    if (!parsed.ok) throw new Error("formulario");
    const saved = await applyManualPersonEdit(repo, { personId: id, adminId: "adm-7", patch: parsed.patch, mfaConfirmed: true });
    expect(saved).toEqual({ ok: true, changed: ["first_names", "last_names", "outreach_email"] });
    expect(repo.people.get(id)?.first_names).toBe("Ana María");
    expect(repo.outreachEmails.get(id)).toBe("ana@correo.com");
    const audit = repo.auditLog.at(-1);
    expect(audit).toMatchObject({ action: "MANUAL_EDIT", actor_id: "adm-7", actor_type: "admin", person_id: id });
    expect(JSON.stringify(audit)).not.toContain("Ana María");
    expect(JSON.stringify(audit)).not.toContain("ana@correo.com");
  });
});

describe("envío de enlaces por correo", () => {
  it("escribe solo a quien no tiene enlace vigente y no anula el que ya existe", async () => {
    const repo = new MemoryRepo();
    const pending = repo.addPerson("Ana", "Paz", CEDULA);
    const already = repo.addPerson("Luis", "Paz", makeCedula("010203040"));
    const noMail = repo.addPerson("Eva", "Paz", makeCedula("171234567"));
    repo.outreachEmails.set(pending, "ana@correo.com");
    repo.outreachEmails.set(already, "luis@correo.com");
    repo.addToken(already, "hash-vigente");
    const sent: string[] = [];
    const first = await sendMissingLinkEmails(repo, {
      adminId: "adm",
      organization: "Agrupación Marista Ecuatoriana",
      deliver: async (message) => {
        sent.push(message.to);
        expect(message.text).not.toContain(CEDULA);
        expect(message.text).toContain("/verificar/");
        return true;
      },
    });
    expect(repo.outreachEmails.has(noMail)).toBe(false);
    expect(first).toMatchObject({ sent: 1, failed: 0, skippedNoEmail: 1, skippedHasLink: 1 });
    expect(sent).toEqual(["ana@correo.com"]);
    expect(repo.tokens.size).toBe(2);

    const second = await sendMissingLinkEmails(repo, {
      adminId: "adm",
      organization: "Agrupación Marista Ecuatoriana",
      deliver: async () => {
        throw new Error("no debía enviar");
      },
    });
    expect(second.sent).toBe(0);
    expect(second.skippedHasLink).toBe(2);
    expect(repo.tokens.size).toBe(2);
  });
});

describe("carga de contacto para Unibrokers", () => {
  it("no incluye la cuenta bancaria y avisa que faltan credenciales", async () => {
    const repo = new MemoryRepo();
    repo.addPerson("Ana", "Paz", CEDULA, "COMPLETED");
    const table = buildUnibrokersTable(await repo.getUnibrokersRows());
    expect(table.fields).not.toContain("account_number");
    expect(table.headers).toContain("Cédula");
    expect(JSON.stringify(table.data)).toContain(CEDULA);
    expect(JSON.stringify(table.data)).not.toContain("0022004821");
    expect(unibrokersSyncMissing()).toEqual(["UNIBROKERS_API_URL", "UNIBROKERS_API_KEY"]);

    const file = await createUnibrokersPackage(repo, {
      adminId: "adm",
      role: "EXPORTER",
      format: "csv",
      purpose: "Entrega semanal de contacto a operaciones",
    });
    expect(file.sync.state).toBe("local");
    expect(file.sync.detail).toMatch(/UNIBROKERS_API_URL/);
    expect(file.count).toBe(1);
    expect(repo.auditLog.at(-1)).toMatchObject({ action: "UNIBROKERS_EXPORT_CREATED", actor_id: "adm" });
    expect(can("REVIEWER", "export:create")).toBe(false);
    await expect(
      createUnibrokersPackage(repo, { adminId: "r", role: "REVIEWER", format: "csv", purpose: "Entrega semanal de contacto a operaciones" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("intenta el envío solo cuando hay URL y clave, y igual deja el archivo", async () => {
    process.env.UNIBROKERS_API_URL = "https://unibrokers.example/carga";
    process.env.UNIBROKERS_API_KEY = "clave-de-prueba";
    const repo = new MemoryRepo();
    const id = repo.addPerson("Ana", "Paz", CEDULA);
    repo.people.get(id)!.national_id_encrypted = encrypt(CEDULA);
    let called = 0;
    const file = await createUnibrokersPackage(repo, {
      adminId: "adm",
      role: "ADMIN",
      format: "csv",
      purpose: "Entrega semanal de contacto a operaciones",
      fetchImpl: async () => {
        called += 1;
        return new Response("ok", { status: 202 });
      },
    });
    expect(called).toBe(1);
    expect(file.sync.state).toBe("sent");
    expect(file.buffer.length).toBeGreaterThan(20);
  });
});
