import ExcelJS from "exceljs";
import { decrypt } from "@/lib/encryption/crypto";
import type { AdminRepo, ExportSourceRow } from "@/lib/database/types";
import { assertCan, type AdminRole } from "@/lib/security/rbac";
import { settings } from "./settings";

/**
 * Perfiles de exportación para AIG — minimización: cada perfil incluye solo
 * los campos necesarios para su finalidad.
 */
export const EXPORT_PROFILES = {
  RECLAMOS: {
    label: "Gestión de reclamos (contacto, sin datos bancarios)",
    columns: [
      ["confirmation_code", "Número de confirmación"],
      ["first_names", "Nombres"],
      ["last_names", "Apellidos"],
      ["national_id", "Cédula"],
      ["primary_email", "Correo principal"],
      ["secondary_email", "Correo alternativo"],
      ["mobile_phone", "Celular"],
      ["address", "Dirección"],
      ["city", "Ciudad"],
      ["province", "Provincia"],
      ["country", "País"],
      ["consent_accepted_at", "Fecha de consentimiento (UTC)"],
      ["privacy_notice_version", "Versión del aviso"],
    ],
  },
  REEMBOLSOS: {
    label: "Pago de reembolsos (incluye datos bancarios)",
    columns: [
      ["confirmation_code", "Número de confirmación"],
      ["first_names", "Nombres"],
      ["last_names", "Apellidos"],
      ["national_id", "Cédula"],
      ["primary_email", "Correo principal"],
      ["mobile_phone", "Celular"],
      ["bank", "Institución financiera"],
      ["account_type", "Tipo de cuenta"],
      ["account_number", "Número de cuenta"],
      ["account_holder_name", "Titular de la cuenta"],
      ["account_holder_national_id", "Cédula del titular"],
      ["consent_accepted_at", "Fecha de consentimiento (UTC)"],
      ["privacy_notice_version", "Versión del aviso"],
    ],
  },
} as const;

export type ExportProfile = keyof typeof EXPORT_PROFILES;
export type ExportFormat = "xlsx" | "csv";

type FieldKey = (typeof EXPORT_PROFILES)[ExportProfile]["columns"][number][0];

function safeDecrypt(v: string | null): string {
  if (!v) return "";
  try {
    return decrypt(v);
  } catch {
    return "ERROR_DESCIFRADO";
  }
}

function fieldValue(row: ExportSourceRow, key: FieldKey): string {
  switch (key) {
    case "national_id": return safeDecrypt(row.national_id_encrypted);
    case "account_number": return safeDecrypt(row.account_number_encrypted);
    case "account_holder_national_id": return safeDecrypt(row.account_holder_national_id_encrypted);
    case "address": return [row.address_line_1, row.address_line_2].filter(Boolean).join(", ");
    case "bank": return row.bank_other_name ? `${row.bank_name}: ${row.bank_other_name}` : (row.bank_name ?? "");
    default: return String(row[key as keyof ExportSourceRow] ?? "");
  }
}

/** Evita inyección de fórmulas al abrir el archivo en Excel. */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function buildExportTable(rows: ExportSourceRow[], profile: ExportProfile): { headers: string[]; data: string[][]; fields: string[] } {
  const cols = EXPORT_PROFILES[profile].columns;
  // Solo registros con consentimiento vigente para comunicar datos a AIG
  const eligible = rows.filter((r) => r.consent_accepted_at);
  return {
    headers: cols.map(([, label]) => label),
    fields: cols.map(([key]) => key),
    data: eligible.map((r) => cols.map(([key]) => neutralizeFormula(fieldValue(r, key)))),
  };
}

export async function toFile(table: { headers: string[]; data: string[][] }, format: ExportFormat, sheetName = "Datos AIG"): Promise<Buffer> {
  if (format === "csv") {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [table.headers, ...table.data].map((r) => r.map(esc).join(","));
    return Buffer.from("\uFEFF" + lines.join("\r\n"), "utf8");
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "Portal de actualización de datos";
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.addRow(table.headers).font = { bold: true };
  for (const row of table.data) ws.addRow(row);
  ws.columns.forEach((c) => (c.width = 24));
  // Todas las celdas como texto (conserva ceros iniciales de cédulas y cuentas)
  ws.eachRow((row) => row.eachCell((cell) => (cell.numFmt = "@")));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export class ExportError extends Error {}

export async function createAigExport(
  repo: AdminRepo,
  input: { adminId: string; role: AdminRole; profile: ExportProfile; format: ExportFormat; purpose: string; ipHash: string },
): Promise<{ buffer: Buffer; filename: string; count: number; contentType: string }> {
  assertCan(input.role, "export:create");
  const purpose = input.purpose.trim().replace(/\s+/g, " ");
  if (purpose.length < 10 || purpose.length > 300) throw new ExportError("Describe la finalidad de la exportación (entre 10 y 300 caracteres).");
  if (!(input.profile in EXPORT_PROFILES)) throw new ExportError("Perfil de exportación no válido.");
  const limit = await repo.rateLimitHit(`export:${input.adminId}`, settings.exportLimitPerHour, 3600);
  if (!limit.allowed) throw new ExportError("Alcanzaste el límite de exportaciones por hora.");

  const table = buildExportTable(await repo.getExportRows(), input.profile);
  const buffer = await toFile(table, input.format);
  await repo.recordExport({ admin_id: input.adminId, purpose, profile: input.profile, record_count: table.data.length, fields: table.fields, format: input.format });
  await repo.audit({ actor_type: "admin", actor_id: input.adminId, action: "EXPORT_CREATED", metadata: { profile: input.profile, records: table.data.length, format: input.format, purpose } });

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    buffer,
    filename: `AIG_${input.profile.toLowerCase()}_${stamp}.${input.format}`,
    count: table.data.length,
    contentType: input.format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}
