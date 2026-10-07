import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { decrypt } from "@/lib/encryption/crypto";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { importPeople, parseImportFile, validateImportRows } from "@/lib/services/import";
import { splitEcuadorianFullName } from "@/lib/services/import-layout";
import { makeCedula } from "./helpers/cedula";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "agrupacion-marista-base-datos-1.xlsx");

function byId(rows: { national_id: string; first_names: string; last_names: string }[], id: string) {
  const row = rows.find((item) => item.national_id === id);
  expect(row, id).toBeDefined();
  return row!;
}

describe("nombre ecuatoriano en una sola celda", () => {
  it("separa dos apellidos y conserva un apellido compuesto o un solo apellido", () => {
    expect(splitEcuadorianFullName("ACUÑA VITE JOSE ALBERTO")).toEqual({ last_names: "ACUÑA VITE", first_names: "JOSE ALBERTO" });
    expect(splitEcuadorianFullName("DE LA TORRE DAVILA XIMENA GEOMAR")).toEqual({ last_names: "DE LA TORRE DAVILA", first_names: "XIMENA GEOMAR" });
    expect(splitEcuadorianFullName("AÑAZCO MARIA DEL CARMEN")).toEqual({ last_names: "AÑAZCO", first_names: "MARIA DEL CARMEN" });
    expect(splitEcuadorianFullName("LEON TAYUPANTA CONSUELO DE LA CRUZ")).toEqual({ last_names: "LEON TAYUPANTA", first_names: "CONSUELO DE LA CRUZ" });
    expect(splitEcuadorianFullName("PEREZ JUAN")).toEqual({ last_names: "PEREZ", first_names: "JUAN" });
  });
});

describe("extracto Marista (caso real de datos mal armados)", () => {
  it("importa el xlsx: el nombre sale de first_names, la cédula de national_id, y last_names numérico no es un apellido", async () => {
    const bytes = readFileSync(fixturePath);
    const parsed = await parseImportFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "agrupacion-marista-base-datos-1.xlsx");
    expect(parsed).toHaveLength(166);

    const validated = validateImportRows(parsed);
    // 162 cédulas de persona natural y el pasaporte BH823158. Las otras 3 no son un documento válido
    // (número corto 86520, o cédula con verificador/provincia incorrectos). El rechazo es el documento, no el apellido.
    expect(validated.valid).toHaveLength(163);
    expect(validated.errors).toHaveLength(3);
    expect(validated.errors.every((error) => error.reason.includes("Cédula inválida"))).toBe(true);
    expect(byId(validated.valid, "BH823158")).toMatchObject({ last_names: "BOLIVAR BOLIVAR", first_names: "OSCAR ALEXANDER" });
    expect(validated.errors.some((error) => error.reason.includes("Apellidos"))).toBe(false);

    expect(validated.valid.every((row) => !/^\d+$/.test(row.last_names))).toBe(true);
    expect(validated.valid.every((row) => !row.first_names.includes("Ґ") && !row.first_names.includes("Ц"))).toBe(true);
    expect(validated.valid.every((row) => !row.last_names.includes("Ґ") && !row.last_names.includes("Ц"))).toBe(true);

    expect(byId(validated.valid, "1724788920")).toMatchObject({ last_names: "ACUÑA VITE", first_names: "JOSE ALBERTO" });
    expect(byId(validated.valid, "0401301346")).toMatchObject({ last_names: "AREVALO GUADIR", first_names: "MILTON RODOLFO" });
    expect(byId(validated.valid, "0701535957")).toMatchObject({ last_names: "AÑAZCO", first_names: "MARIA DEL CARMEN" });
    expect(byId(validated.valid, "1709713018")).toMatchObject({ last_names: "DE LA TORRE DAVILA", first_names: "XIMENA GEOMAR" });
    expect(byId(validated.valid, "1723476683")).toMatchObject({ last_names: "IZURIETA PARREÑO", first_names: "VANESSA JAZMÍN" });

    const repo = new MemoryRepo();
    const outcome = await importPeople(repo, { rows: parsed, filename: "agrupacion-marista-base-datos-1.xlsx", adminId: "a", allowPartial: true });
    expect(outcome.imported).toBe(163);
    expect(outcome.committed).toBe(true);
    const milton = [...repo.people.values()].find((person) => person.first_names === "MILTON RODOLFO");
    expect(milton?.national_id_encrypted).toBeTruthy();
    expect(decrypt(milton!.national_id_encrypted!)).toBe("0401301346");
  });
});

describe("otros formatos de columnas", () => {
  const cedula = makeCedula("171003406");

  it("acepta NOMBRES COMPLETOS y Cedula de identidad, conservando el cero inicial", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("personas");
    ws.addRow(["NOMBRES COMPLETOS", "Cedula de identidad"]);
    const row = ws.addRow(["ACUÑA VITE JOSE ALBERTO", "0401301346"]);
    row.getCell(2).value = "0401301346";
    const buffer = await wb.xlsx.writeBuffer();
    const parsed = await parseImportFile(buffer as ArrayBuffer, "jaime.xlsx");
    expect(parsed).toEqual([{ row: 2, first_names: "JOSE ALBERTO", last_names: "ACUÑA VITE", national_id: "0401301346", outreach_email: "" }]);
    expect(validateImportRows(parsed).valid).toHaveLength(1);
  });

  it("detecta nombre y cédula por el contenido aunque los títulos no digan nada útil", async () => {
    const csv = new TextEncoder().encode(`Persona,Documento\nACUÑA VITE JOSE ALBERTO,${cedula}\n`);
    const parsed = await parseImportFile(csv.buffer as ArrayBuffer, "suelto.csv");
    expect(parsed).toEqual([{ row: 2, first_names: "JOSE ALBERTO", last_names: "ACUÑA VITE", national_id: cedula, outreach_email: "" }]);
    expect(validateImportRows(parsed).valid).toHaveLength(1);
  });

  it("no usa una columna de apellidos numérica como apellido cuando el nombre está completo en otra celda", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("initial_people");
    ws.addRow(["first_names", "last_names", "national_id"]);
    ws.getRow(2).getCell(1).value = "ACUÑA VITE JOSE ALBERTO";
    ws.getRow(2).getCell(2).value = Number(cedula);
    ws.getRow(2).getCell(3).value = Number(cedula);
    const buffer = await wb.xlsx.writeBuffer();
    const parsed = await parseImportFile(buffer as ArrayBuffer, "numeros.xlsx");
    expect(parsed[0]).toMatchObject({ first_names: "JOSE ALBERTO", last_names: "ACUÑA VITE", national_id: cedula });
    expect(parsed[0]!.last_names).not.toBe(cedula);
  });

  it("lee un pasaporte en la columna national_id aunque el apellido repita el mismo documento", async () => {
    const csv = new TextEncoder().encode("first_names,last_names,national_id\nBOLIVAR BOLIVAR OSCAR ALEXANDER,BH823158,bh823158\nECHEVERRY VELASQUEZ JAVIER ALFONSO,BA086520,BA086520\n");
    const parsed = await parseImportFile(csv.buffer as ArrayBuffer, "pasaportes.csv");
    expect(parsed[0]).toMatchObject({ first_names: "OSCAR ALEXANDER", last_names: "BOLIVAR BOLIVAR", national_id: "BH823158" });
    expect(parsed[1]).toMatchObject({ first_names: "JAVIER ALFONSO", last_names: "ECHEVERRY VELASQUEZ", national_id: "BA086520" });
    expect(validateImportRows(parsed).valid).toHaveLength(2);
    expect(validateImportRows(parsed).errors).toHaveLength(0);
  });
});
