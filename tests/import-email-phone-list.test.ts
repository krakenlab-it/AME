import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { keyedHash } from "@/lib/encryption/crypto";
import { importPeople, parseImportFile } from "@/lib/services/import";
import { confirmGeneralCedula, confirmGeneralEmailCode, startGeneralEmailAccess, type GeneralEmailDeps } from "@/lib/services/general-email";
import { demoEmailOtpProvider, DEMO_EMAIL_OTP_CODE } from "@/lib/services/email-otp";
import { makeCedula } from "./helpers/cedula";

const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "import-email-phone-list.xlsx");
const CODE = "V1234V1234";

function buffer() {
  const bytes = readFileSync(fixture);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("lista de correos y teléfonos", () => {
  it("la vista previa cuenta 23 contactos, 14 con correo y cero fallos, y la segunda hoja no duplica", async () => {
    const rows = await parseImportFile(buffer(), "import-email-phone-list.xlsx");
    const repo = new MemoryRepo();
    const preview = await importPeople(repo, { rows, filename: "lista.xlsx", adminId: "admin-1", allowPartial: false, dryRun: true });
    expect(preview.preview).toBe(true);
    expect(preview.committed).toBe(false);
    expect(preview.contacts).toBe(23);
    expect(preview.withEmail).toBe(14);
    expect(preview.rejected).toHaveLength(0);
    expect(repo.preloadedContacts).toHaveLength(0);

    const saved = await importPeople(repo, { rows, filename: "lista.xlsx", adminId: "admin-1", allowPartial: false });
    expect(saved.committed).toBe(true);
    expect(saved.contacts).toBe(23);
    expect(repo.preloadedContacts).toHaveLength(23);
    expect(repo.people.size).toBe(0);
    expect(new Set(repo.preloadedContacts.map((item) => item.email).filter(Boolean)).size).toBe(14);
  });

  it("un correo de la lista aprueba la cédula sin un administrador y rellena nombre y teléfono", async () => {
    const rows = await parseImportFile(buffer(), "import-email-phone-list.xlsx");
    const repo = new MemoryRepo();
    await importPeople(repo, { rows, filename: "lista.xlsx", adminId: "admin-1", allowPartial: false });
    const contact = repo.preloadedContacts.find((item) => item.email === "persona1@fmsnor.org");
    expect(contact?.firstNames).toBeTruthy();
    const otp = demoEmailOtpProvider();
    const deps = (ip: string): GeneralEmailDeps => ({ ipHash: ip, captchaEnabled: false, verifyCaptcha: async () => true, otp });
    const started = await startGeneralEmailAccess(repo, { email: "persona1@fmsnor.org", termsAccepted: true }, deps("ip-1"));
    if (!started.ok) throw new Error(started.error);
    await confirmGeneralEmailCode(repo, started.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps("ip-1"));
    const cedula = makeCedula("171003406");
    const done = await confirmGeneralCedula(repo, started.challengeToken, { cedula, codigoDactilar: CODE }, deps("ip-1"));
    expect(done).toMatchObject({ ok: true, destination: "form" });
    const person = [...repo.people.values()].find((item) => item.login_email === "persona1@fmsnor.org");
    expect(person?.self_registered_at ?? null).toBeNull();
    expect(person?.national_id_hash).toBe(keyedHash(cedula, "national_id"));
    expect(person?.first_names).toBe(contact?.firstNames);
    expect(person?.outreach_phone).toMatch(/^\+5939/);
    expect(repo.auditLog.some((entry) => entry.action === "ACCOUNT_LINK_REQUESTED")).toBe(false);
  });

  it("una carga con cédula sigue creando personas", async () => {
    const cedula = makeCedula("091234567");
    const csv = new TextEncoder().encode(`Nombres,Apellidos,Cédula\nAna,Pérez,${cedula}\n`);
    const rows = await parseImportFile(csv.buffer.slice(csv.byteOffset, csv.byteOffset + csv.byteLength) as ArrayBuffer, "personas.csv");
    const repo = new MemoryRepo();
    const result = await importPeople(repo, { rows, filename: "personas.csv", adminId: "admin-1", allowPartial: false });
    expect(result.imported).toBe(1);
    expect(result.contacts).toBe(0);
    expect(repo.people.size).toBe(1);
  });
});
