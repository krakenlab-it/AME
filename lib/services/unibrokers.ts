import type { AdminRepo, UnibrokersSourceRow } from "@/lib/database/types";
import { decrypt } from "@/lib/encryption/crypto";
import { assertCan, type AdminRole } from "@/lib/security/rbac";
import { STATUS_LABELS } from "@/lib/validation/constants";
import { ExportError, neutralizeFormula, toFile, type ExportFormat } from "./export";
import { settings } from "./settings";

export const UNIBROKERS_HOLD =
  "El envío en vivo a Unibrokers está en espera. Faltan UNIBROKERS_API_URL y UNIBROKERS_API_KEY, y la confirmación del formato que acepta su sistema. Mientras tanto, descarga el paquete de carga de contacto y entrégalo a operaciones.";

const COLUMNS = [
  ["status", "Estado"],
  ["confirmation_code", "Número de confirmación"],
  ["first_names", "Nombres"],
  ["last_names", "Apellidos"],
  ["national_id", "Cédula"],
  ["primary_email", "Correo de contacto"],
  ["outreach_email", "Correo para el enlace"],
  ["mobile_phone", "Celular"],
  ["city", "Ciudad"],
  ["province", "Provincia"],
  ["submitted_at", "Fecha de envío (UTC)"],
] as const;

type ColumnKey = (typeof COLUMNS)[number][0];

export function unibrokersColumnLabels(): string[] {
  return COLUMNS.map(([, label]) => label);
}

export function unibrokersSyncMissing(env: NodeJS.ProcessEnv = process.env): string[] {
  const missing: string[] = [];
  if (!env.UNIBROKERS_API_URL?.trim()) missing.push("UNIBROKERS_API_URL");
  if (!env.UNIBROKERS_API_KEY?.trim()) missing.push("UNIBROKERS_API_KEY");
  return missing;
}

function safeDecrypt(value: string | null): string {
  if (!value) return "";
  try {
    return decrypt(value);
  } catch {
    return "ERROR_DESCIFRADO";
  }
}

function cell(row: UnibrokersSourceRow, key: ColumnKey): string {
  switch (key) {
    case "status":
      return STATUS_LABELS[row.status];
    case "national_id":
      return safeDecrypt(row.national_id_encrypted);
    case "confirmation_code":
    case "first_names":
    case "last_names":
    case "primary_email":
    case "outreach_email":
    case "mobile_phone":
    case "city":
    case "province":
    case "submitted_at":
      return row[key] ?? "";
    default: {
      const exhaustive: never = key;
      return exhaustive;
    }
  }
}

export function buildUnibrokersTable(rows: UnibrokersSourceRow[]): { headers: string[]; data: string[][]; fields: string[]; records: Record<string, string>[] } {
  const headers = COLUMNS.map(([, label]) => label);
  const fields = COLUMNS.map(([key]) => key);
  const data = rows.map((row) => COLUMNS.map(([key]) => neutralizeFormula(cell(row, key))));
  const records = data.map((line) => Object.fromEntries(headers.map((header, index) => [header, line[index] ?? ""])));
  return { headers, data, fields, records };
}

export interface UnibrokersPackage {
  buffer: Buffer;
  filename: string;
  count: number;
  contentType: string;
  sync: { state: "local" | "sent" | "failed"; detail: string };
}

export async function createUnibrokersPackage(
  repo: AdminRepo,
  input: {
    adminId: string;
    role: AdminRole;
    format: ExportFormat;
    purpose: string;
    fetchImpl?: typeof fetch;
  },
): Promise<UnibrokersPackage> {
  assertCan(input.role, "export:create");
  const purpose = input.purpose.trim().replace(/\s+/g, " ");
  if (purpose.length < 10 || purpose.length > 300) throw new ExportError("Describe para qué se entrega esta carga (entre 10 y 300 caracteres).");
  const limit = await repo.rateLimitHit(`unibrokers:${input.adminId}`, settings.exportLimitPerHour, 3600);
  if (!limit.allowed) throw new ExportError("Alcanzaste el límite de exportaciones por hora.");

  const table = buildUnibrokersTable(await repo.getUnibrokersRows());
  const buffer = await toFile(table, input.format, "Contacto Unibrokers");
  await repo.recordExport({
    admin_id: input.adminId,
    purpose,
    profile: "UNIBROKERS_CONTACT",
    record_count: table.data.length,
    fields: table.fields,
    format: input.format,
  });

  const missing = unibrokersSyncMissing();
  let sync: UnibrokersPackage["sync"] = { state: "local", detail: UNIBROKERS_HOLD };
  if (missing.length === 0) {
    const endpoint = process.env.UNIBROKERS_API_URL!.trim();
    const key = process.env.UNIBROKERS_API_KEY!.trim();
    try {
      const response = await (input.fetchImpl ?? fetch)(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ source: "portal-ame", purpose, records: table.records }),
      });
      sync = response.ok
        ? { state: "sent", detail: "Unibrokers aceptó la carga. Igual descarga el paquete para tu archivo." }
        : { state: "failed", detail: `Unibrokers respondió ${response.status}. La descarga local sí se generó.` };
    } catch {
      sync = { state: "failed", detail: "No se pudo contactar a Unibrokers. La descarga local sí se generó." };
    }
  }

  await repo.audit({
    actor_type: "admin",
    actor_id: input.adminId,
    action: "UNIBROKERS_EXPORT_CREATED",
    metadata: { records: table.data.length, format: input.format, purpose, sync: sync.state },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    buffer,
    filename: `Unibrokers_contacto_${stamp}.${input.format}`,
    count: table.data.length,
    contentType: input.format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sync,
  };
}
