import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { importPeople, ImportFileError, parseImportFile, validateImportRows } from "@/lib/services/import";
import {
  classifyImportColumns,
  ecuadorMobile,
  headerRole,
  isNumericJunk,
  looksLikePhoneColumn,
  pickHeaderRow,
  profileColumn,
} from "@/lib/services/import-layout";
import { isValidCedula } from "@/lib/validation/cedula";
import { makeCedula } from "./helpers/cedula";

const here = dirname(fileURLToPath(import.meta.url));
// Copia ANONIMIZADA del archivo que mandó Jaime: mismo layout (título en la fila 1, títulos en la 2,
// teléfonos 09… en la columna A, correos como hipervínculo, una lista de nombres sin título al lado).
// Nombres, teléfonos y correos son ficticios. No trae ninguna columna de cédula, como el original.
const phoneOnlyFixture = join(here, "fixtures", "marista-telefonos-sin-cedula.xlsx");

function arrayBuffer(bytes: Buffer | Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function xlsx(rows: (string | number | null)[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Hoja1");
  rows.forEach((values, index) => {
    values.forEach((value, column) => {
      if (value !== null) ws.getCell(index + 1, column + 1).value = value;
    });
  });
  return arrayBuffer(Buffer.from(await wb.xlsx.writeBuffer()));
}

function csv(lines: string[]): ArrayBuffer {
  return arrayBuffer(Buffer.from(lines.join("\n"), "utf8"));
}

/** Celular ficticio 09… que NO pasa el verificador de cédula. */
function fakeMobile(seed: number): string {
  for (let n = seed; ; n += 1) {
    const candidate = `09${8 + (n % 2)}${String(1_000_000 + n * 7919).slice(-7)}`;
    if (!isValidCedula(candidate)) return candidate;
  }
}

/** Celular ficticio 09… que SÍ pasa el verificador (09 = Guayas, tercer dígito < 6). */
function mobileThatLooksLikeCedula(): string {
  const value = makeCedula("095123456");
  expect(isValidCedula(value)).toBe(true);
  return value;
}

describe("títulos de columna", () => {
  it("teléfono, celular, móvil y WhatsApp son teléfono, nunca un documento", () => {
    for (const header of ["Teléfono", "TELEFONO", "Celular", "Móvil", "WhatsApp", "Phone", "Teléfono celular", "Nro. de teléfono"]) {
      expect(headerRole(header), header).toBe("phone");
    }
    expect(headerRole("Cédula")).toBe("id");
    expect(headerRole("Correo")).toBe("email");
  });

  it("busca la fila de títulos en las primeras filas (no siempre es la 1)", () => {
    expect(pickHeaderRow([["AGRUPACIÓN MARISTA ECUATORIANA"], ["TELÉFONO", "RESPONSABLE", "COMUNIDAD", "SEGURO", "CORREO"], ["0981234567", "Hno. Ficticio"]])).toBe(1);
    expect(pickHeaderRow([["Cédula", "Nombres", "Apellidos"], ["0912345678", "Ana", "Pérez"]])).toBe(0);
    expect(pickHeaderRow([[""], ["Reporte"], ["fecha: hoy"], ["Nombres", "Apellidos", "Cédula", "Celular"]])).toBe(3);
  });
});

describe("columna de teléfono detectada por contenido (columna entera, no celda por celda)", () => {
  it("09… que fallan el verificador de cédula son teléfono, aunque alguno lo pase", () => {
    const values = [fakeMobile(1), fakeMobile(2), mobileThatLooksLikeCedula(), fakeMobile(3), "099 812 3456", fakeMobile(4)];
    expect(looksLikePhoneColumn(profileColumn(values))).toBe(true);
  });

  it("cédulas de Guayas (09…) con verificador válido siguen siendo cédula, también si Excel quitó el 0", () => {
    const cedulas = ["091234567", "091876543", "090111222", "092345678"].map((nine) => makeCedula(nine));
    expect(looksLikePhoneColumn(profileColumn(cedulas))).toBe(false);
    const stripped = cedulas.map((value) => value.slice(1));
    expect(looksLikePhoneColumn(profileColumn(stripped))).toBe(false);
  });

  it("+593 es teléfono", () => {
    expect(looksLikePhoneColumn(profileColumn(["+593 98 123 4567", "+593991234567", "+593 96 765 4321"]))).toBe(true);
    expect(ecuadorMobile("+593 98 123 4567")).toBe("+593981234567");
    expect(ecuadorMobile("0981234567")).toBe("+593981234567");
    expect(ecuadorMobile("12345")).toBeNull();
  });

  it("un título de teléfono gana al contenido y un título de cédula también", () => {
    const cedulas = [makeCedula("091234567"), makeCedula("092345678")];
    const phones = [fakeMobile(5), fakeMobile(6)];
    expect(classifyImportColumns(["Celular", "Cédula", ""], [cedulas, phones, phones])).toEqual(["phone", "id", "phone"]);
  });
});

describe("nombres con números", () => {
  it("un número no es un nombre", () => {
    expect(isNumericJunk("0981234567")).toBe(true);
    expect(isNumericJunk("12")).toBe(true);
    expect(isNumericJunk("Hno. Ana Pérez")).toBe(false);
    expect(isNumericJunk("María José")).toBe(false);
  });
});

describe("archivo de Jaime (copia anonimizada)", () => {
  it("sin columna de cédula: error claro en español que nombra la columna de teléfono", async () => {
    const bytes = arrayBuffer(readFileSync(phoneOnlyFixture));
    const failure = await parseImportFile(bytes, "marista-telefonos.xlsx").then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ImportFileError);
    const message = (failure as Error).message;
    expect(message).toMatch(/no tiene una columna de cédula ni de pasaporte/);
    expect(message).toMatch(/«TELÉFONO» tiene números de teléfono, no cédulas/);
  });

  it("la copia conserva el layout: título arriba, títulos en la fila 2, columna de teléfonos y lista sin título", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer(readFileSync(phoneOnlyFixture)));
    const ws = wb.worksheets[0]!;
    expect(String(ws.getCell(2, 1).value)).toBe("TELÉFONO");
    expect(String(ws.getCell(2, 5).value)).toBe("CORREO");
    const phones: string[] = [];
    for (let row = 3; row <= ws.rowCount; row += 1) {
      const value = String(ws.getCell(row, 1).value ?? "").trim();
      if (value) phones.push(value);
    }
    expect(phones.length).toBeGreaterThan(15);
    expect(phones.every((value) => value.replace(/\s/g, "").startsWith("09"))).toBe(true);
    expect(looksLikePhoneColumn(profileColumn(phones))).toBe(true);
    expect(String(ws.getCell(3, 7).value ?? "").split(" ").length).toBeGreaterThanOrEqual(3);
  });
});

describe("importación con teléfono y cédula", () => {
  it("títulos en la fila 3, teléfono guardado aparte y nunca usado como cédula", async () => {
    const ana = makeCedula("091234567");
    const luis = makeCedula("170123456");
    const bytes = await xlsx([
      ["LISTADO DE ASEGURADOS"],
      [null],
      ["Nombres", "Apellidos", "Celular", "Cédula"],
      ["Ana", "Pérez", fakeMobile(10), ana],
      ["Luis", "Torres", mobileThatLooksLikeCedula(), luis],
    ]);
    const parsed = await parseImportFile(bytes, "asegurados.xlsx");
    expect(parsed.map((row) => row.national_id)).toEqual([ana, luis]);
    expect(parsed.map((row) => row.row)).toEqual([4, 5]);
    expect(parsed[0]!.outreach_phone).toMatch(/^\+5939\d{8}$/);
    expect(parsed[1]!.outreach_phone).toBe(`+593${mobileThatLooksLikeCedula().slice(1)}`);

    const repo = new MemoryRepo();
    expect(validateImportRows(parsed).valid).toHaveLength(2);
    const result = await importPeople(repo, { filename: "asegurados.xlsx", adminId: "admin-1", rows: parsed, allowPartial: false });
    expect(result.imported).toBe(2);
    expect(repo.outreachPhones.size).toBe(2);
    expect([...repo.outreachPhones.values()].every((phone) => /^\+5939\d{8}$/.test(phone))).toBe(true);
  });

  it("columna de teléfono sin título junto a una de cédula: la cédula sale de su columna", async () => {
    const ana = makeCedula("091112223");
    const bytes = csv(["Cédula,Nombres,Apellidos,", `${ana},Ana,Pérez,${fakeMobile(20)}`, `${makeCedula("092223334")},Eva,Ruiz,${mobileThatLooksLikeCedula()}`]);
    const parsed = await parseImportFile(bytes, "x.csv");
    expect(parsed[0]!.national_id).toBe(ana);
    expect(parsed[1]!.national_id).not.toBe(mobileThatLooksLikeCedula());
    expect(parsed.every((row) => row.outreach_phone?.startsWith("+5939"))).toBe(true);
  });

  it("columna sin título con cédulas de Guayas (09…) sigue siendo el documento", async () => {
    const cedulas = ["091234567", "091876543", "090111222"].map((nine) => makeCedula(nine));
    const bytes = await xlsx([["Nombres", "Apellidos", null], ...cedulas.map((id, index) => [`Persona${"abc"[index]}`, "Ficticia", id])]);
    const parsed = await parseImportFile(bytes, "guayas.xlsx");
    expect(parsed.map((row) => row.national_id)).toEqual(cedulas);
    expect(parsed.every((row) => !row.outreach_phone)).toBe(true);
  });

  it("CSV con una fila de título antes de los encabezados", async () => {
    const id = makeCedula("170987654");
    const parsed = await parseImportFile(csv(["Reporte de asegurados", "Cédula,Nombres,Apellidos,Teléfono", `${id},Ana,Pérez,${fakeMobile(30)}`]), "x.csv");
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.national_id).toBe(id);
    expect(parsed[0]!.row).toBe(3);
  });

  it("un número en el campo de nombre queda como marcador, no como nombre", async () => {
    const id = makeCedula("170555444");
    const parsed = await parseImportFile(csv(["Cédula,Nombres,Apellidos", `${id},12,0981234567`]), "x.csv");
    const { valid } = validateImportRows(parsed);
    expect(valid[0]!.first_names).toBe("Sin nombre");
    expect(valid[0]!.last_names).toBe("Registrado");
  });

  it("archivo con títulos pero sin cédula ni teléfono: el mensaje de plantilla de siempre", async () => {
    await expect(parseImportFile(csv(["Nombres,Apellidos", "Ana,Pérez"]), "x.csv")).rejects.toThrow(ImportFileError);
  });
});
