import { sha256 } from "@/lib/encryption/crypto";
import { normalizeAdminEmail } from "./admin-gate";
import { staffConfirmRedirect } from "./staff-invite";

/**
 * Recuperación del acceso al panel por variable de entorno.
 * ADMIN_BOOTSTRAP_EMAILS="persona@dominio.com, otra@dominio.com"
 *
 * En el arranque del servidor, por cada correo que todavía no tiene un acceso vinculado:
 * - crea o reactiva su fila en admin_users con rol ADMIN y must_change_password,
 * - y le pide a Supabase Auth (service_role) que mande el correo: invitación si la cuenta
 *   no existe, o enlace de restablecimiento si ya existía.
 * Los tokens los genera Supabase en ese momento y viajan solo en su correo: aquí no se guardan,
 * no se registran y no se devuelven. Un acceso ya vinculado no se toca (ni su contraseña ni su TOTP).
 * El TOTP sigue siendo obligatorio: la invitación lleva a /admin/registro y luego a /admin/mfa.
 * No toca /ingresar, /verificar ni nada del titular.
 */

export const BOOTSTRAP_MAX_EMAILS = 10;
export const BOOTSTRAP_FULL_NAME = "Administrador inicial";
/** Un intento por correo y por hora, aunque haya muchos arranques en frío. */
export const BOOTSTRAP_WINDOW_SECONDS = 60 * 60;

export interface BootstrapDirectory {
  findByEmail(email: string): Promise<{ id: string; auth_user_id: string | null } | null>;
  /** Crea la fila o vuelve a vincular una existente sin acceso. Siempre ADMIN, activa y con cambio obligatorio. */
  save(row: { existingId: string | null; email: string; auth_user_id: string }): Promise<void>;
  rateLimitHit(bucket: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean }>;
  logSecurityEvent(e: { event_type: string; ip_hash: string | null; detail?: Record<string, unknown> }): Promise<void>;
}

export interface BootstrapAuth {
  inviteByEmail(email: string, redirectTo: string, fullName: string): Promise<{ userId: string | null; failed: boolean }>;
  /**
   * Id de una cuenta de Auth que ya existe (función admin_bootstrap_auth_user_id, solo service_role).
   * No se usa generateLink(recovery) para esto: deja recovery_sent_at y Supabase rechaza el correo
   * de restablecimiento que sigue (límite de 60 s por usuario), y además su token reemplaza al del correo.
   */
  findAuthUserId(email: string): Promise<{ userId: string | null; failed: boolean }>;
  /** Supabase manda el correo de restablecimiento. */
  sendRecoveryEmail(email: string, redirectTo: string): Promise<{ failed: boolean }>;
}

export type BootstrapStatus = "already_linked" | "invited" | "recovery_sent" | "linked_without_email" | "rate_limited" | "failed";

export interface BootstrapOutcome {
  /** Huella del correo, para registros sin el correo en claro. */
  emailHash: string;
  status: BootstrapStatus;
}

export function parseBootstrapEmails(raw: string | undefined): { emails: string[]; invalid: number } {
  if (!raw) return { emails: [], invalid: 0 };
  const seen = new Set<string>();
  let invalid = 0;
  for (const part of raw.split(/[,;\s]+/)) {
    if (!part) continue;
    const email = normalizeAdminEmail(part);
    if (!email) {
      invalid++;
      continue;
    }
    seen.add(email);
  }
  const emails = [...seen];
  if (emails.length > BOOTSTRAP_MAX_EMAILS) invalid += emails.length - BOOTSTRAP_MAX_EMAILS;
  return { emails: emails.slice(0, BOOTSTRAP_MAX_EMAILS), invalid };
}

export async function bootstrapAdmins(
  directory: BootstrapDirectory,
  auth: BootstrapAuth,
  emails: string[],
  baseUrl: string,
): Promise<BootstrapOutcome[]> {
  const outcomes: BootstrapOutcome[] = [];
  for (const email of emails) {
    const emailHash = sha256(email).slice(0, 12);
    let status: BootstrapStatus;
    try {
      status = await bootstrapOne(directory, auth, email, baseUrl);
    } catch {
      status = "failed";
    }
    outcomes.push({ emailHash, status });
    if (status !== "already_linked") {
      await directory
        .logSecurityEvent({ event_type: "ADMIN_BOOTSTRAP", ip_hash: null, detail: { email_hash: emailHash, status } })
        .catch(() => undefined);
    }
  }
  return outcomes;
}

async function bootstrapOne(directory: BootstrapDirectory, auth: BootstrapAuth, email: string, baseUrl: string): Promise<BootstrapStatus> {
  const existing = await directory.findByEmail(email);
  // Un acceso vinculado se recupera con /admin/recuperar; la variable no le cambia nada.
  if (existing?.auth_user_id) return "already_linked";

  const limit = await directory.rateLimitHit(`admin-bootstrap:${sha256(email)}`, 1, BOOTSTRAP_WINDOW_SECONDS);
  if (!limit.allowed) return "rate_limited";

  const invited = await auth.inviteByEmail(email, staffConfirmRedirect(baseUrl, "/admin/registro"), BOOTSTRAP_FULL_NAME);
  if (!invited.failed && invited.userId) {
    await directory.save({ existingId: existing?.id ?? null, email, auth_user_id: invited.userId });
    return "invited";
  }

  // La cuenta ya existe en Auth (por ejemplo, la fila de admin_users se perdió o quedó sin vínculo).
  const resetRedirect = staffConfirmRedirect(baseUrl, "/admin/restablecer");
  const found = await auth.findAuthUserId(email);
  if (found.failed || !found.userId) return "failed";
  // Se guarda primero el vínculo con cambio obligatorio: aunque el correo no llegue,
  // la contraseña anterior ya no abre el panel sin elegir una nueva.
  await directory.save({ existingId: existing?.id ?? null, email, auth_user_id: found.userId });
  const sent = await auth.sendRecoveryEmail(email, resetRedirect);
  return sent.failed ? "linked_without_email" : "recovery_sent";
}
