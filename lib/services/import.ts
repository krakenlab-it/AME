import Papa from "papaparse";
import ExcelJS from "exceljs";
import { encrypt, keyedHash } from "@/lib/encryption/crypto";
import type { AdminRepo } from "@/lib/database/types";
import { assessNationalId } from "@/lib/validation/document";
import { cleanText } from "@/lib/validation/sanitize";
import { maskCedula } from "@/lib/security/masking";
import {
  classifyImportColumns,
  HEADER_SCAN_ROWS,
  interpretImportCells,
  isNumericJunk,
  looksLikeEmail,
  pickHeaderRow,
  type HeaderRole,
  type ImportCell,
} from "./import-layout";
import { issueLinks, linksToCsv } from "./links";

export const IMPORT_MAX_ROWS = 20_000;
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const NAME_RE = /^[\p{L}][\p{L}\p{M}' .-]*$/u;
const TEMPLATE_HINT =
  "No encontramos una cédula ni un pasaporte. La plantilla recomendada usa las columnas Nombres, Apellidos y Cédula. Esos mismos datos también se aceptan como first_names, last_names y national_id.";

export interface RawImportRow {
  row: number; // número de fila en el archivo (el encabezado puede no estar en la fila 1)
  first_names: string;
  last_names: string;
  national_id: string;
  /** Correo opcional para el enlace. Vacío si el archivo no lo trae. */
  outreach_email?: string;
  /** Celular en E.164 si el archivo trae una columna de teléfono. Nunca se usa como cédula. */
  outreach_phone?: string;
}

export interface ImportError {
  row: number;
  reason: string;
  /** Cédula enmascarada para ubicar la fila sin exponer el dato completo. */
  cedula: string;
}

export interface ImportNote {
  row: number;
  cedula: string;
  text: string;
}

export interface ValidatedImport {
  valid: RawImportRow[];
  errors: ImportError[];
  notes: ImportNote[];
  total: number;
}

export async function parseImportFile(bytes: ArrayBuffer, filename: string): Promise<RawImportRow[]> {
  if (bytes.byteLength > IMPORT_MAX_BYTES) throw new ImportFileError("El archivo supera 5 MB.");
  const lower = filename.toLowerCase();
  let grid: GridRow[];
  if (lower.endsWith(".csv")) {
    grid = parseCsvGrid(bytes);
  } else if (lower.endsWith(".xlsx")) {
    grid = await parseXlsxGrid(bytes);
  } else {
    throw new ImportFileError("Formato no soportado. Usa un archivo .csv o .xlsx.");
  }
  const table = buildTable(grid);
  if (table.rows.length > IMPORT_MAX_ROWS) throw new ImportFileError(`El archivo supera el máximo de ${IMPORT_MAX_ROWS} registros.`);
  const rows = table.rows.map((entry) => {
    const { outreach_phone: phone, ...rest } = interpretImportCells(entry.cells);
    const row: RawImportRow = { row: entry.row, ...rest };
    if (phone) row.outreach_phone = phone;
    return row;
  });
  if (rows.length > 0 && rows.every((row) => !row.national_id)) {
    const phoneHeaders = table.headers.filter((_, index) => table.roles[index] === "phone");
    if (phoneHeaders.length > 0) throw new ImportFileError(noIdColumnMessage(phoneHeaders));
    throw new ImportFileError(TEMPLATE_HINT);
  }
  return rows;
}

/** Error claro cuando el archivo trae teléfonos pero ninguna cédula ni pasaporte. */
export function noIdColumnMessage(phoneHeaders: string[]): string {
  const named = phoneHeaders.map((header) => header.trim()).filter(Boolean);
  const which = named.length ? `La columna «${named[0]}» tiene números de teléfono, no cédulas.` : "Una columna sin título tiene números de teléfono, no cédulas.";
  return `El archivo no tiene una columna de cédula ni de pasaporte. ${which} Agrega una columna «Cédula» con el número de cada persona y vuelve a subirlo. El teléfono se puede dejar en su propia columna.`;
}

interface GridRow {
  /** Número de fila en el archivo (1 = primera fila). */
  row: number;
  /** Valores por columna, desde la columna 0. */
  values: string[];
}

interface ImportTable {
  headerRow: number;
  headers: string[];
  roles: HeaderRole[];
  rows: { row: number; cells: ImportCell[] }[];
}

/**
 * La fila de títulos no siempre es la primera (el archivo de Marista trae un título arriba).
 * Se busca en las primeras filas, y cada columna recibe un rol mirando el título y todo su contenido.
 */
function buildTable(grid: GridRow[]): ImportTable {
  const headerIndex = pickHeaderRow(grid.slice(0, HEADER_SCAN_ROWS).map((row) => row.values));
  const headerRow = grid[headerIndex];
  if (!headerRow || !headerRow.values.some((value) => value.trim())) throw new ImportFileError(TEMPLATE_HINT);
  const data = grid.slice(headerIndex + 1).filter((entry) => entry.values.some((value) => value.trim()));
  const width = Math.max(headerRow.values.length, ...data.map((entry) => entry.values.length));
  const headers = Array.from({ length: width }, (_, column) => String(headerRow.values[column] ?? "").trim());
  const columns = headers.map((_, column) => data.map((entry) => entry.values[column] ?? ""));
  const roles = classifyImportColumns(headers, columns);
  // Una columna sin título ni contenido útil se ignora. Una sin título pero con datos sí cuenta
  // (por ejemplo, teléfonos o nombres pegados al lado de la tabla).
  const used = headers.map((header, column) => Boolean(header) || columns[column]!.some((value) => value.trim()));
  const rows = data.map((entry) => ({
    row: entry.row,
    cells: headers.flatMap((header, column) => (used[column] ? [{ header, value: entry.values[column] ?? "", role: roles[column] }] : [])),
  }));
  return { headerRow: headerRow.row, headers, roles, rows };
}

function parseCsvGrid(bytes: ArrayBuffer): GridRow[] {
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
  const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: false });
  return parsed.data
    .map((record, index) => ({ row: index + 1, values: (record ?? []).map((value) => String(value ?? "")) }))
    .filter((entry) => entry.values.some((value) => value.trim()));
}

async function parseXlsxGrid(bytes: ArrayBuffer): Promise<GridRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  const ws = wb.worksheets[0];
  if (!ws) throw new ImportFileError("El archivo no tiene hojas.");
  const grid: GridRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      values[col - 1] = excelCellString(cell);
    });
    for (let i = 0; i < values.length; i += 1) values[i] = values[i] ?? "";
    if (values.some((value) => value.trim())) grid.push({ row: rowNumber, values });
  });
  return grid;
}

/** Si la cédula está guardada como texto, conserva el cero inicial. Un número de Excel ya lo perdió: se escribe en dígitos, sin notación científica. */
function excelCellString(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isSafeInteger(value) ? String(value) : (cell.text ?? "");
  if (typeof value === "boolean" || value instanceof Date) return cell.text ?? "";
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? "").join("");
    }
    if ("result" in value) {
      const result = value.result;
      if (typeof result === "string") return result;
      if (typeof result === "number" && Number.isSafeInteger(result)) return String(result);
    }
    if ("text" in value && typeof value.text === "string") return value.text;
  }
  return cell.text ?? "";
}

export class ImportFileError extends Error {}

function duplicateDocumentLabel(kind: "cedula" | "foreign"): string {
  switch (kind) {
    case "cedula":
      return "Cédula duplicada";
    case "foreign":
      return "Documento duplicado";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

/** Valida formato, cédula y duplicados dentro del archivo. Nada se descarta en silencio. */
export function validateImportRows(rows: RawImportRow[]): ValidatedImport {
  const valid: RawImportRow[] = [];
  const errors: ImportError[] = [];
  const notes: ImportNote[] = [];
  const seen = new Map<string, number>();
  for (const raw of rows) {
    const first = cleanText(raw.first_names);
    const last = cleanText(raw.last_names);
    const assessed = assessNationalId(cleanText(raw.national_id));
    const id = assessed.value;
    const masked = id.length >= 4 ? maskCedula(id) : "—";
    const reasons: string[] = [];
    if (!assessed.ok) reasons.push(assessed.message);
    else if (seen.has(id)) reasons.push(`${duplicateDocumentLabel(assessed.kind)} en el archivo (fila ${seen.get(id)})`);
    if (reasons.length) {
      errors.push({ row: raw.row, reason: reasons.join("; "), cedula: masked });
      continue;
    }
    seen.set(id, raw.row);
    let resolvedFirst = first;
    let resolvedLast = last;
    if (resolvedFirst.length < 2 || !NAME_RE.test(resolvedFirst) || isNumericJunk(resolvedFirst)) resolvedFirst = "Sin nombre";
    if (resolvedLast.length < 2 || !NAME_RE.test(resolvedLast) || isNumericJunk(resolvedLast)) resolvedLast = "Registrado";
    if (resolvedFirst === "Sin nombre" || resolvedLast === "Registrado") {
      notes.push({
        row: raw.row,
        cedula: masked,
        text: "Faltaban nombres o apellidos en el archivo; se importó solo con la cédula. Puede completarlos después en la ficha.",
      });
    }
    let outreach = cleanText(raw.outreach_email ?? "").toLowerCase();
    if (outreach && !looksLikeEmail(outreach)) {
      notes.push({ row: raw.row, cedula: masked, text: "El correo no tiene un formato válido y no se guardó. La persona sí se importa." });
      outreach = "";
    }
    const entry: RawImportRow = { row: raw.row, first_names: resolvedFirst, last_names: resolvedLast, national_id: id, outreach_email: outreach };
    if (raw.outreach_phone) entry.outreach_phone = raw.outreach_phone;
    valid.push(entry);
  }
  return { valid, errors, notes, total: rows.length };
}

export interface ImportOutcome {
  imported: number;
  rejected: ImportError[];
  notes: ImportNote[];
  total: number;
  linksCsv: string | null;
  committed: boolean;
  noteTitle: string;
  noteBody: string;
}

export function importNovedades(input: { committed: boolean; imported: number; rejected: number; notes: number }): { noteTitle: string; noteBody: string } {
  if (input.committed && input.rejected === 0 && input.notes === 0) {
    const personas = input.imported === 1 ? "persona" : "personas";
    return { noteTitle: "La carga fue exitosa", noteBody: `Se importaron ${input.imported} ${personas}. No hay novedades.` };
  }
  if (!input.committed) {
    const filas = input.rejected === 1 ? "fila con novedades" : "filas con novedades";
    return {
      noteTitle: "Nota de novedades",
      noteBody: `No se importó ningún registro. Hay ${input.rejected} ${filas}. Corrige las filas indicadas o marca la opción para importar solo las válidas.`,
    };
  }
  const observaciones = input.notes === 1 ? "observación" : "observaciones";
  return {
    noteTitle: "Nota de novedades",
    noteBody: `Se importaron ${input.imported} personas. ${input.rejected} filas no entraron. Hay ${input.notes} ${observaciones} en filas que sí se importaron.`,
  };
}

/**
 * Importa personas. Si hay errores y allowPartial = false, NO importa nada y devuelve el reporte.
 * Si allowPartial = true, importa solo las filas válidas y reporta explícitamente las rechazadas.
 */
export async function importPeople(repo: AdminRepo, input: { rows: RawImportRow[]; filename: string; adminId: string; allowPartial: boolean }): Promise<ImportOutcome> {
  const { valid, errors, notes, total } = validateImportRows(input.rows);
  const hashes = valid.map((r) => keyedHash(r.national_id, "national_id"));
  const existing = await repo.existingNationalIdHashes(hashes);
  const toInsert = valid.filter((r, i) => {
    if (existing.has(hashes[i]!)) {
      errors.push({ row: r.row, reason: "La cédula ya existe en la base de datos", cedula: maskCedula(r.national_id) });
      return false;
    }
    return true;
  });
  errors.sort((a, b) => a.row - b.row);

  if ((errors.length && !input.allowPartial) || toInsert.length === 0) {
    const note = importNovedades({ committed: false, imported: 0, rejected: errors.length, notes: notes.length });
    return { imported: 0, rejected: errors, notes, total, linksCsv: null, committed: false, ...note };
  }

  const batchId = await repo.createImportBatch({ admin_id: input.adminId, filename: input.filename.slice(0, 200), total_rows: total, imported_rows: toInsert.length, rejected_rows: errors.length });
  const inserted = await repo.insertPeople(
    toInsert.map((r) => ({
      first_names: r.first_names,
      last_names: r.last_names,
      national_id_encrypted: encrypt(r.national_id),
      national_id_hash: keyedHash(r.national_id, "national_id"),
      national_id_last2: r.national_id.slice(-2),
      outreach_email: r.outreach_email || null,
      outreach_phone: r.outreach_phone || null,
    })),
    batchId,
  );
  const byHash = new Map(toInsert.map((r) => [keyedHash(r.national_id, "national_id"), r]));
  const links = await issueLinks(repo, inserted.map((p) => p.id), input.adminId);
  const linkByPerson = new Map(links.map((l) => [l.person_id, l]));
  const csvRows = inserted.map((p) => {
    const r = byHash.get(p.national_id_hash)!;
    const link = linkByPerson.get(p.id)!;
    return { row: r.row, first_names: r.first_names, last_names: r.last_names, cedula_masked: maskCedula(r.national_id), url: link.url, expires_at: link.expires_at };
  });
  await repo.audit({ actor_type: "admin", actor_id: input.adminId, action: "IMPORT_CREATED", metadata: { batch_id: batchId, imported: inserted.length, rejected: errors.length, notes: notes.length } });
  const note = importNovedades({ committed: true, imported: inserted.length, rejected: errors.length, notes: notes.length });
  return { imported: inserted.length, rejected: errors, notes, total, linksCsv: linksToCsv(csvRows), committed: true, ...note };
}
