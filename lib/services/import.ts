import Papa from "papaparse";
import ExcelJS from "exceljs";
import { encrypt, keyedHash } from "@/lib/encryption/crypto";
import type { AdminRepo } from "@/lib/database/types";
import { isValidCedula, normalizeCedula } from "@/lib/validation/cedula";
import { cleanText } from "@/lib/validation/sanitize";
import { maskCedula } from "@/lib/security/masking";
import { interpretImportCells, type ImportCell } from "./import-layout";
import { issueLinks, linksToCsv } from "./links";

export const IMPORT_MAX_ROWS = 20_000;
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const NAME_RE = /^[\p{L}][\p{L}\p{M}' .-]*$/u;
const TEMPLATE_HINT =
  "No encontramos un nombre y una cédula de 10 dígitos. La plantilla recomendada usa las columnas first_names, last_names y national_id.";

export interface RawImportRow {
  row: number; // número de fila en el archivo (1 = encabezado)
  first_names: string;
  last_names: string;
  national_id: string;
}

export interface ImportError {
  row: number;
  reason: string;
  /** Cédula enmascarada para ubicar la fila sin exponer el dato completo. */
  cedula: string;
}

export interface ValidatedImport {
  valid: RawImportRow[];
  errors: ImportError[];
  total: number;
}

export async function parseImportFile(bytes: ArrayBuffer, filename: string): Promise<RawImportRow[]> {
  if (bytes.byteLength > IMPORT_MAX_BYTES) throw new ImportFileError("El archivo supera 5 MB.");
  const lower = filename.toLowerCase();
  let table: { row: number; cells: ImportCell[] }[];
  if (lower.endsWith(".csv")) {
    table = parseCsvTable(bytes);
  } else if (lower.endsWith(".xlsx")) {
    table = await parseXlsxTable(bytes);
  } else {
    throw new ImportFileError("Formato no soportado. Usa un archivo .csv o .xlsx.");
  }
  if (table.length > IMPORT_MAX_ROWS) throw new ImportFileError(`El archivo supera el máximo de ${IMPORT_MAX_ROWS} registros.`);
  const rows = table.map((entry) => ({ row: entry.row, ...interpretImportCells(entry.cells) }));
  if (rows.length > 0 && rows.every((row) => !row.first_names && !row.last_names && !row.national_id)) {
    throw new ImportFileError(TEMPLATE_HINT);
  }
  return rows;
}

function parseCsvTable(bytes: ArrayBuffer): { row: number; cells: ImportCell[] }[] {
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
  const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: "greedy" });
  const [headerRow, ...data] = parsed.data;
  const headers = (headerRow ?? []).map((header) => String(header ?? "").trim());
  if (!headers.some(Boolean)) throw new ImportFileError(TEMPLATE_HINT);
  return data.map((record, index) => ({
    row: index + 2,
    cells: headers.flatMap((header, column) => {
      if (!header) return [];
      return [{ header, value: String(record[column] ?? "") }];
    }),
  })).filter((entry) => entry.cells.some((cell) => cell.value.trim()));
}

async function parseXlsxTable(bytes: ArrayBuffer): Promise<{ row: number; cells: ImportCell[] }[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  const ws = wb.worksheets[0];
  if (!ws) throw new ImportFileError("El archivo no tiene hojas.");
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = excelCellString(cell).trim();
  });
  if (!headers.some(Boolean)) throw new ImportFileError(TEMPLATE_HINT);
  const table: { row: number; cells: ImportCell[] }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: ImportCell[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const header = headers[col];
      if (!header) return;
      cells.push({ header, value: excelCellString(cell) });
    });
    if (cells.some((cell) => cell.value.trim())) table.push({ row: rowNumber, cells });
  });
  return table;
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

/** Valida formato, cédula y duplicados dentro del archivo. Nada se descarta en silencio. */
export function validateImportRows(rows: RawImportRow[]): ValidatedImport {
  const valid: RawImportRow[] = [];
  const errors: ImportError[] = [];
  const seen = new Map<string, number>();
  for (const raw of rows) {
    const first = cleanText(raw.first_names);
    const last = cleanText(raw.last_names);
    // Excel puede eliminar el 0 inicial de las cédulas de Azuay, Bolívar… (01–09)
    let id = normalizeCedula(cleanText(raw.national_id));
    if (/^\d{9}$/.test(id)) id = `0${id}`;
    const masked = /^\d{10}$/.test(id) ? maskCedula(id) : "—";
    const reasons: string[] = [];
    if (first.length < 2 || !NAME_RE.test(first)) reasons.push("Nombres vacíos o con caracteres no permitidos");
    if (last.length < 2 || !NAME_RE.test(last)) reasons.push("Apellidos vacíos o con caracteres no permitidos");
    if (!isValidCedula(id)) reasons.push("Cédula inválida");
    else if (seen.has(id)) reasons.push(`Cédula duplicada en el archivo (fila ${seen.get(id)})`);
    if (reasons.length) {
      errors.push({ row: raw.row, reason: reasons.join("; "), cedula: masked });
      continue;
    }
    seen.set(id, raw.row);
    valid.push({ row: raw.row, first_names: first, last_names: last, national_id: id });
  }
  return { valid, errors, total: rows.length };
}

export interface ImportOutcome {
  imported: number;
  rejected: ImportError[];
  total: number;
  linksCsv: string | null;
  committed: boolean;
}

/**
 * Importa personas. Si hay errores y allowPartial = false, NO importa nada y devuelve el reporte.
 * Si allowPartial = true, importa solo las filas válidas y reporta explícitamente las rechazadas.
 */
export async function importPeople(repo: AdminRepo, input: { rows: RawImportRow[]; filename: string; adminId: string; allowPartial: boolean }): Promise<ImportOutcome> {
  const { valid, errors, total } = validateImportRows(input.rows);
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
    return { imported: 0, rejected: errors, total, linksCsv: null, committed: false };
  }

  const batchId = await repo.createImportBatch({ admin_id: input.adminId, filename: input.filename.slice(0, 200), total_rows: total, imported_rows: toInsert.length, rejected_rows: errors.length });
  const inserted = await repo.insertPeople(
    toInsert.map((r) => ({
      first_names: r.first_names,
      last_names: r.last_names,
      national_id_encrypted: encrypt(r.national_id),
      national_id_hash: keyedHash(r.national_id, "national_id"),
      national_id_last2: r.national_id.slice(-2),
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
  await repo.audit({ actor_type: "admin", actor_id: input.adminId, action: "IMPORT_CREATED", metadata: { batch_id: batchId, imported: inserted.length, rejected: errors.length } });
  return { imported: inserted.length, rejected: errors, total, linksCsv: linksToCsv(csvRows), committed: true };
}
