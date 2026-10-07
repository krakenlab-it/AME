import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { decrypt, encrypt, keyedHash, sha256 } from "@/lib/encryption/crypto";
import { MemoryRepo } from "@/lib/database/memory-repo";
import type { ExportSourceRow } from "@/lib/database/types";
import { can, ForbiddenError } from "@/lib/security/rbac";
import { buildExportTable, createAigExport, neutralizeFormula } from "@/lib/services/export";
import { importPeople, parseImportFile, validateImportRows } from "@/lib/services/import";
import { makeCedula } from "./helpers/cedula";

const C1 = "1710034065";
const C2 = makeCedula("010203040");

function exportRow(overrides: Partial<ExportSourceRow> = {}): ExportSourceRow {
  return {
    person_id: "p1", confirmation_code: "AIG-ABCDEFGH", first_names: "Juan", last_names: "Pérez", national_id_encrypted: encrypt(C1),
    submitted_at: "2026-09-29T00:00:00Z", primary_email: "juan@correo.com", secondary_email: null, mobile_phone: "+593991234567",
    address_line_1: "Av. 1", address_line_2: null, city: "Quito", province: "Pichincha", country: "Ecuador", postal_code: null,
    bank_name: "Banco Pichincha", bank_other_name: null, account_type: "Ahorros", account_number_encrypted: encrypt("0022004821"),
    account_holder_name: "Juan Pérez", account_holder_national_id_encrypted: encrypt(C1), consent_accepted_at: "2026-09-29T00:00:00Z",
    privacy_notice_version: "1.0", ...overrides,
  };
}

describe("permisos administrativos (RBAC)", () => {
  it("aplica la matriz de roles", () => {
    expect(can("ADMIN", "export:create")).toBe(true);
    expect(can("EXPORTER", "export:create")).toBe(true);
    expect(can("REVIEWER", "export:create")).toBe(false);
    expect(can("EXPORTER", "people:view")).toBe(false);
    expect(can("REVIEWER", "people:review")).toBe(true);
    expect(can("REVIEWER", "people:import")).toBe(false);
    expect(can("ADMIN", "people:edit")).toBe(true);
    expect(can("REVIEWER", "people:edit")).toBe(false);
    expect(can("EXPORTER", "people:edit")).toBe(false);
    expect(can("ADMIN", "staff:invite")).toBe(true);
    expect(can("REVIEWER", "staff:invite")).toBe(false);
    expect(can("EXPORTER", "staff:invite")).toBe(false);
    expect(can(null, "dashboard:view")).toBe(false);
  });

  it("un empleado sin permiso no puede exportar", async () => {
    const repo = new MemoryRepo();
    repo.exportRows = [exportRow()];
    await expect(
      createAigExport(repo, { adminId: "a", role: "REVIEWER", profile: "REEMBOLSOS", format: "csv", purpose: "Envío mensual a AIG", ipHash: "x" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.exports).toHaveLength(0);
  });
});

describe("exportación para AIG", () => {
  it("el perfil de reclamos no incluye datos bancarios", () => {
    const t = buildExportTable([exportRow()], "RECLAMOS");
    expect(t.fields).not.toContain("account_number");
    expect(JSON.stringify(t.data)).not.toContain("0022004821");
    expect(t.data[0]).toContain(C1);
  });

  it("el perfil de reembolsos incluye la cuenta completa y conserva ceros iniciales", () => {
    const t = buildExportTable([exportRow()], "REEMBOLSOS");
    expect(t.data[0]).toContain("0022004821");
  });

  it("excluye registros sin consentimiento vigente", () => {
    const t = buildExportTable([exportRow(), exportRow({ person_id: "p2", consent_accepted_at: null })], "RECLAMOS");
    expect(t.data).toHaveLength(1);
  });

  it("neutraliza fórmulas de Excel", () => {
    expect(neutralizeFormula("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(neutralizeFormula("+593")).toBe("'+593");
    expect(neutralizeFormula("Quito")).toBe("Quito");
  });

  it("registra quién exportó, cuándo, cuántos registros y la finalidad", async () => {
    const repo = new MemoryRepo();
    repo.exportRows = [exportRow(), exportRow({ person_id: "p2" })];
    const file = await createAigExport(repo, { adminId: "adm", role: "EXPORTER", profile: "REEMBOLSOS", format: "xlsx", purpose: "Pago de reembolsos septiembre", ipHash: "x" });
    expect(file.count).toBe(2);
    expect(repo.exports[0]).toMatchObject({ admin_id: "adm", record_count: 2, purpose: "Pago de reembolsos septiembre" });
    expect(repo.auditLog.at(-1)).toMatchObject({ action: "EXPORT_CREATED", actor_id: "adm" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(file.buffer).buffer as ArrayBuffer);
    expect(wb.worksheets[0]!.rowCount).toBe(3);
  });

  it("exige una finalidad", async () => {
    const repo = new MemoryRepo();
    await expect(createAigExport(repo, { adminId: "a", role: "ADMIN", profile: "RECLAMOS", format: "csv", purpose: "x", ipHash: "x" })).rejects.toThrow();
  });
});

describe("importación inicial", () => {
  const rows = [
    { row: 2, first_names: "Juan Carlos", last_names: "Pérez López", national_id: C1 },
    { row: 3, first_names: "María", last_names: "Andrade", national_id: C2.slice(1) }, // Excel quitó el 0 inicial
    { row: 4, first_names: "Pedro", last_names: "Duplicado", national_id: C1 },
    { row: 5, first_names: "Ana", last_names: "Inválida", national_id: "1234567890" },
    { row: 6, first_names: "", last_names: "Sin nombre", national_id: makeCedula("171234567") },
  ];

  it("detecta duplicados, cédulas inválidas y campos vacíos", () => {
    const v = validateImportRows(rows);
    expect(v.valid.map((r) => r.row)).toEqual([2, 3]);
    expect(v.valid[1]!.national_id).toBe(C2);
    expect(v.errors.map((e) => e.row)).toEqual([4, 5, 6]);
    expect(v.errors[0]!.reason).toContain("duplicada");
    expect(JSON.stringify(v.errors)).not.toContain(C1); // el reporte enmascara la cédula
  });

  it("acepta pasaportes BH823158 y BA086520 y no descarta en silencio un documento inválido", async () => {
    const rows = [
      { row: 2, first_names: "OSCAR ALEXANDER", last_names: "BOLIVAR BOLIVAR", national_id: "bh 823158" },
      { row: 3, first_names: "JAVIER ALFONSO", last_names: "ECHEVERRY VELASQUEZ", national_id: "BA086520" },
      { row: 4, first_names: "ANA", last_names: "RUIDO", national_id: "AAAAAA" },
      { row: 5, first_names: "LUIS", last_names: "CORTO", national_id: "86520" },
      { row: 6, first_names: "PEDRO", last_names: "CEDULA", national_id: "17100340A5" },
      { row: 7, first_names: "MARIA", last_names: "DUPLICADA", national_id: "BH-823158" },
    ];
    const v = validateImportRows(rows);
    expect(v.valid.map((row) => row.national_id)).toEqual(["BH823158", "BA086520"]);
    expect(v.errors.map((error) => error.row)).toEqual([4, 5, 6, 7]);
    expect(v.errors[0]!.reason).toMatch(/Documento no válido/);
    expect(v.errors[1]!.reason).toMatch(/Cédula inválida/);
    expect(v.errors[2]!.reason).toMatch(/Documento no válido/);
    expect(v.errors[3]!.reason).toMatch(/duplicado/);
    expect(JSON.stringify(v.errors)).not.toContain("BH823158");
    expect(JSON.stringify(v.errors)).not.toContain("BA086520");

    const repo = new MemoryRepo();
    const out = await importPeople(repo, { rows, filename: "pasaportes.csv", adminId: "a", allowPartial: true });
    expect(out.imported).toBe(2);
    expect(out.rejected).toHaveLength(4);
    expect(out.linksCsv).toMatch(/\/verificar\/[A-Za-z0-9_-]+/);
    const stored = [...repo.people.values()].map((person) => decrypt(person.national_id_encrypted!)).sort();
    expect(stored).toEqual(["BA086520", "BH823158"]);
    const oscar = [...repo.people.values()].find((person) => person.first_names === "OSCAR ALEXANDER")!;
    expect(oscar.national_id_hash).toBe(keyedHash("BH823158", "national_id"));
    expect(oscar.national_id_last2).toBe("58");
  });

  it("no importa nada si hay errores y no se autorizó la importación parcial", async () => {
    const repo = new MemoryRepo();
    const out = await importPeople(repo, { rows, filename: "base.csv", adminId: "a", allowPartial: false });
    expect(out).toMatchObject({ committed: false, imported: 0 });
    expect(repo.people.size).toBe(0);
  });

  it("importa solo las filas válidas, genera tokens y reporta las rechazadas", async () => {
    const repo = new MemoryRepo();
    const out = await importPeople(repo, { rows, filename: "base.csv", adminId: "a", allowPartial: true });
    expect(out.imported).toBe(2);
    expect(out.rejected).toHaveLength(3);
    expect(repo.tokens.size).toBe(2);
    const urls = out.linksCsv!.match(/https:\/\/portal\.test\/verificar\/[A-Za-z0-9_-]+/g)!;
    expect(urls).toHaveLength(2);
    // el token no contiene la cédula y en la base solo se guarda su hash
    const token = urls[0]!.split("/").at(-1)!;
    expect(token).not.toContain(C1);
    expect([...repo.tokens.values()].some((t) => t.token_hash === sha256(token))).toBe(true);
    // cédula cifrada
    const p = [...repo.people.values()][0]!;
    expect(p.national_id_encrypted).not.toContain(C1);
  });

  it("rechaza cédulas que ya existen en la base", async () => {
    const repo = new MemoryRepo();
    repo.addPerson("Juan", "Pérez", C1);
    const out = await importPeople(repo, { rows: rows.slice(0, 1), filename: "b.csv", adminId: "a", allowPartial: false });
    expect(out.committed).toBe(false);
    expect(out.rejected[0]!.reason).toContain("ya existe");
  });

  it("lee la plantilla CSV y rechaza un archivo sin nombre ni cédula", async () => {
    const csv = new TextEncoder().encode(`first_names,last_names,national_id\nJuan Carlos,Pérez López,${C1}\n`);
    expect(await parseImportFile(csv.buffer as ArrayBuffer, "x.csv")).toEqual([{ row: 2, first_names: "Juan Carlos", last_names: "Pérez López", national_id: C1, outreach_email: "" }]);
    const bad = new TextEncoder().encode("foo,bar\n1,2\n");
    await expect(parseImportFile(bad.buffer as ArrayBuffer, "x.csv")).rejects.toThrow(/cédula/);
  });
});
