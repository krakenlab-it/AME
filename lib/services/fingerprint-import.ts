import Papa from "papaparse";
import ExcelJS from "exceljs";
import { keyedHash } from "@/lib/encryption/crypto";
import type { AdminRepo } from "@/lib/database/types";
import { assessNationalId } from "@/lib/validation/document";
import { isFingerprintCode, normalizeFingerprintCode } from "@/lib/validation/fingerprint";

export const FINGERPRINT_IMPORT_MAX_ROWS = 5_000;
export const FINGERPRINT_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

export class FingerprintImportError extends Error {}

export interface FingerprintImportReport {
  total: number;
  updated: number;
  unchanged: number;
  notFound: number;
  invalid: number;
  duplicates: number;
  conflicts: number;
}

interface ParsedRow {
  cedula: string;
  code: string;
}

/** Precarga opcional. No pisa un código ya registrado si el hash es distinto. */
export async function importFingerprintCodes(repo: AdminRepo, bytes: ArrayBuffer, filename: string, adminId: string): Promise<FingerprintImportReport> {
  if (bytes.byteLength > FINGERPRINT_IMPORT_MAX_BYTES) throw new FingerprintImportError("El archivo supera 5 MB.");
  const rows = await readRows(bytes, filename);
  if (rows.length > FINGERPRINT_IMPORT_MAX_ROWS) throw new FingerprintImportError(`El archivo supera el máximo de ${FINGERPRINT_IMPORT_MAX_ROWS} filas.`);

  const report: FingerprintImportReport = { total: rows.length, updated: 0, unchanged: 0, notFound: 0, invalid: 0, duplicates: 0, conflicts: 0 };
  const seen = new Set<string>();

  for (const row of rows) {
    const assessed = assessNationalId(row.cedula);
    const code = normalizeFingerprintCode(row.code);
    if (!assessed.ok || assessed.kind !== "cedula" || !isFingerprintCode(code)) {
      report.invalid += 1;
      continue;
    }
    const idHash = keyedHash(assessed.value, "national_id");
    if (seen.has(idHash)) {
      report.duplicates += 1;
      continue;
    }
    seen.add(idHash);
    const codeHash = keyedHash(code, "fingerprint_code");
    const result = await repo.assignFingerprintHash(idHash, codeHash);
    switch (result) {
      case "updated":
        report.updated += 1;
        break;
      case "unchanged":
        report.unchanged += 1;
        break;
      case "not_found":
        report.notFound += 1;
        break;
      case "conflict":
        report.conflicts += 1;
        break;
      default: {
        const unexpected: never = result;
        throw new FingerprintImportError(`Resultado no reconocido: ${unexpected}`);
      }
    }
  }

  await repo.audit({
    actor_type: "admin",
    actor_id: adminId,
    action: "FINGERPRINT_IMPORTED",
    metadata: {
      updated: report.updated,
      unchanged: report.unchanged,
      not_found: report.notFound,
      invalid: report.invalid,
      duplicates: report.duplicates,
      conflicts: report.conflicts,
    },
  });
  return report;
}

async function readRows(bytes: ArrayBuffer, filename: string): Promise<ParsedRow[]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return readCsv(bytes);
  if (lower.endsWith(".xlsx")) return readXlsx(bytes);
  throw new FingerprintImportError("Formato no soportado. Usa un archivo .xlsx o .csv.");
}

function headerKey(header: string): string {
  return header.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function pick(cells: Record<string, string>, names: string[]): string {
  for (const name of names) {
    const value = cells[name];
    if (value) return value;
  }
  return "";
}

function readCsv(bytes: ArrayBuffer): ParsedRow[] {
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
  const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: "greedy" });
  const [headerRow, ...data] = parsed.data;
  const headers = (headerRow ?? []).map((header) => headerKey(String(header ?? "")));
  if (!headers.some(Boolean)) throw new FingerprintImportError("No encontramos las columnas cedula y codigo_dactilar.");
  return data.map((record) => {
    const cells: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (header) cells[header] = String(record[index] ?? "").trim();
    });
    return toRow(cells);
  }).filter((row) => row.cedula || row.code);
}

async function readXlsx(bytes: ArrayBuffer): Promise<ParsedRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  const ws = wb.worksheets[0];
  if (!ws) throw new FingerprintImportError("El archivo no tiene hojas.");
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = headerKey(cellText(cell));
  });
  if (!headers.some(Boolean)) throw new FingerprintImportError("No encontramos las columnas cedula y codigo_dactilar.");
  const rows: ParsedRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: Record<string, string> = {};
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const header = headers[col];
      if (header) cells[header] = cellText(cell).trim();
    });
    const parsed = toRow(cells);
    if (parsed.cedula || parsed.code) rows.push(parsed);
  });
  return rows;
}

function toRow(cells: Record<string, string>): ParsedRow {
  return {
    cedula: pick(cells, ["cedula", "national_id", "documento"]),
    code: pick(cells, ["codigo_dactilar", "codigo", "fingerprint_code"]),
  };
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return "";
  if (typeof value === "object" && "text" in value && typeof value.text === "string") return value.text;
  if (typeof value === "object" && "result" in value && (typeof value.result === "string" || typeof value.result === "number")) return String(value.result);
  return cell.text ?? "";
}
