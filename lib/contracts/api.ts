import { z } from "zod";
import { safeEqual } from "@/lib/encryption/crypto";
import { identifySchema } from "@/lib/validation/schemas";

/**
 * Contratos de las rutas HTTP y de las acciones que usa el panel y /verificar.
 * Las rutas importan estos esquemas: un cuerpo distinto responde 400.
 * No hay alta pública. El panel solo entra por invitación.
 */

export const EXPORT_PROFILE_IDS = ["RECLAMOS", "REEMBOLSOS"] as const;
export const EXPORT_FORMATS = ["xlsx", "csv"] as const;
export const LINK_STATES = ["valid", "expired", "used", "revoked", "invalid"] as const;

export const apiErrorSchema = z.object({ error: z.string().min(1).max(500) }).strict();

export const healthResponseSchema = z.object({ ok: z.literal(true) }).strict();

export const retentionResponseSchema = z
  .object({
    ok: z.literal(true),
    anonymized: z.number().int().nonnegative(),
  })
  .strict();

export const exportRequestSchema = z
  .object({
    profile: z.enum(EXPORT_PROFILE_IDS),
    format: z.enum(EXPORT_FORMATS),
    purpose: z.string(),
  })
  .strict();

export const identifyFailureSchema = z
  .object({
    error: z.string().optional(),
    fieldError: z.string().optional(),
    requireCaptcha: z.boolean().optional(),
    linkState: z.enum(LINK_STATES).optional(),
  })
  .strict();

export type ExportRequest = z.infer<typeof exportRequestSchema>;

export function apiErrorBody(error: string): { error: string } {
  return apiErrorSchema.parse({ error });
}

export function parseExportRequest(body: unknown): { ok: true; value: ExportRequest } | { ok: false } {
  const parsed = exportRequestSchema.safeParse(body);
  if (!parsed.success) return { ok: false };
  return { ok: true, value: parsed.data };
}

/** La exportación exige el mismo origen (además de la cookie SameSite=Strict). */
export function isSameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Vercel Cron envía Authorization: Bearer $CRON_SECRET. El secreto tiene al menos 16 caracteres. */
export function cronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || authorization == null) return false;
  return safeEqual(authorization, `Bearer ${secret}`);
}

export type ContractAuth =
  | { kind: "public" }
  | { kind: "admin-session"; assurance: "aal2"; permission: "export:create"; csrf: "same-origin" }
  | { kind: "cron-bearer"; env: "CRON_SECRET" }
  | { kind: "individual-link"; factors: ["token", "cedula"] }
  | { kind: "invite-magic-link" };

export interface HttpContract {
  id: string;
  method: "GET" | "POST";
  path: string;
  auth: ContractAuth;
  summary: string;
}

export interface ActionContract {
  id: string;
  exportName: string;
  module: string;
  auth: ContractAuth;
  summary: string;
}

export const HTTP_CONTRACTS: readonly HttpContract[] = [
  {
    id: "health",
    method: "GET",
    path: "/api/health",
    auth: { kind: "public" },
    summary: "Disponibilidad. Solo { ok: true }. No expone configuración ni datos personales.",
  },
  {
    id: "admin-export",
    method: "POST",
    path: "/api/admin/export",
    auth: { kind: "admin-session", assurance: "aal2", permission: "export:create", csrf: "same-origin" },
    summary: "Archivo AIG en memoria. Sesión de administrador con MFA, permiso de exportación y mismo origen. La finalidad queda en la auditoría (10 a 300 caracteres).",
  },
  {
    id: "cron-retention",
    method: "GET",
    path: "/api/cron/retention",
    auth: { kind: "cron-bearer", env: "CRON_SECRET" },
    summary: "Anonimiza registros vencidos. Solo el cron de Vercel, con el secreto. No es una ruta pública.",
  },
];

export const ACTION_CONTRACTS: readonly ActionContract[] = [
  {
    id: "verificar-identify",
    exportName: "identifyAction",
    module: "app/verificar/actions.ts",
    auth: { kind: "individual-link", factors: ["token", "cedula"] },
    summary: "El titular confirma el enlace individual y la cédula. No usa la sesión del panel ni la clave anónima para leer PII.",
  },
  {
    id: "admin-confirm-link",
    exportName: "confirmLinkAction",
    module: "app/admin/auth-actions.ts",
    auth: { kind: "invite-magic-link" },
    summary: "Canjea el enlace de invitación o de restablecimiento (verifyOtp o code). No crea cuentas nuevas.",
  },
  {
    id: "admin-adopt-session",
    exportName: "adoptSessionAction",
    module: "app/admin/auth-actions.ts",
    auth: { kind: "invite-magic-link" },
    summary: "Adopta la sesión que Supabase deja en el fragmento del enlace. El destino se queda dentro de /admin.",
  },
];

export { identifySchema };
