import { ADMIN_ROLES, assertCan, type AdminRole } from "@/lib/security/rbac";
import { cleanText } from "@/lib/validation/sanitize";
import { normalizeAdminEmail } from "./admin-gate";

const NAME_RE = /^[\p{L}][\p{L}\p{M}' .-]*$/u;

export const STAFF_ALREADY_LINKED_ERROR =
  "Ese correo ya está vinculado a un acceso del panel. Para una clave nueva usa la recuperación de contraseña.";

const INVALID_EMAIL = "Ingresa un correo válido.";
const INVALID_NAME = "Escribe el nombre completo, solo con letras, espacios, apóstrofes o guiones.";
const INVALID_ROLE = "Elige un rol: administrador, revisor de fichas o exportación a AIG.";
const INVITE_FAILED = "No se pudo crear la invitación. Si esa persona ya tiene acceso, pídele que use la recuperación de contraseña.";
const LOOKUP_FAILED = "No se pudo revisar si ese correo ya tiene acceso. Intenta de nuevo.";
const SAVE_FAILED = "El acceso quedó creado, pero no se pudo guardar el rol en el panel. Avisa al equipo técnico antes de volver a invitar ese correo.";

export interface StaffDirectory {
  findByEmail(email: string): Promise<{ id: string; auth_user_id: string | null } | null>;
  link(row: { existingId: string | null; email: string; full_name: string; role: AdminRole; auth_user_id: string }): Promise<void>;
}

/** Auth de administración. El nombre en metadata es solo para el correo; el rol vive en admin_users. */
export interface StaffAuthAdmin {
  inviteByEmail(email: string, redirectTo: string, fullName: string): Promise<{ userId: string | null; failed: boolean }>;
  generateRecoveryLink(email: string, redirectTo: string): Promise<{
    userId: string | null;
    hashedToken: string | null;
    actionLink: string | null;
    failed: boolean;
  }>;
}

export type InviteStaffResult =
  | { ok: true; email: string; role: AdminRole; emailed: boolean; confirmUrl: string | null }
  | { ok: false; error: string };

export function staffConfirmRedirect(baseUrl: string, next: "/admin/registro" | "/admin/restablecer"): string {
  return `${trimBase(baseUrl)}/admin/auth/confirm?next=${encodeURIComponent(next)}`;
}

/** Enlace del portal para verifyOtp. El token de un solo uso no se guarda. */
export function portalConfirmUrl(baseUrl: string, hashedToken: string, type: "invite" | "recovery"): string {
  const next = type === "recovery" ? "/admin/restablecer" : "/admin/registro";
  const params = new URLSearchParams({ token_hash: hashedToken, type, next });
  return `${trimBase(baseUrl)}/admin/auth/confirm?${params.toString()}`;
}

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function parseRole(value: string): AdminRole | null {
  const role = value.trim().toUpperCase();
  for (const known of ADMIN_ROLES) {
    if (known === role) return known;
  }
  return null;
}

/**
 * Invita a alguien del panel. Solo el rol ADMIN puede llamarla.
 * Si Auth ya tiene el correo y no está vinculado, entrega un enlace de recuperación
 * para que el administrador lo copie. No reenvía ese enlace por correo masivo.
 */
export async function inviteStaffMember(
  directory: StaffDirectory,
  auth: StaffAuthAdmin,
  callerRole: AdminRole,
  input: { email: string; fullName: string; role: string },
  baseUrl: string,
): Promise<InviteStaffResult> {
  assertCan(callerRole, "staff:invite");

  const email = normalizeAdminEmail(input.email);
  if (!email) return { ok: false, error: INVALID_EMAIL };
  const fullName = cleanText(input.fullName);
  if (fullName.length < 2 || fullName.length > 120 || !NAME_RE.test(fullName)) return { ok: false, error: INVALID_NAME };
  const role = parseRole(input.role);
  if (!role) return { ok: false, error: INVALID_ROLE };

  let existing: { id: string; auth_user_id: string | null } | null;
  try {
    existing = await directory.findByEmail(email);
  } catch {
    return { ok: false, error: LOOKUP_FAILED };
  }
  if (existing?.auth_user_id) return { ok: false, error: STAFF_ALREADY_LINKED_ERROR };

  const inviteRedirect = staffConfirmRedirect(baseUrl, "/admin/registro");
  const invited = await auth.inviteByEmail(email, inviteRedirect, fullName);

  let authUserId = invited.userId;
  let emailed = !invited.failed && Boolean(authUserId);
  let confirmUrl: string | null = null;

  if (invited.failed || !authUserId) {
    const recovery = await auth.generateRecoveryLink(email, staffConfirmRedirect(baseUrl, "/admin/restablecer"));
    if (recovery.failed || !recovery.userId) return { ok: false, error: INVITE_FAILED };
    authUserId = recovery.userId;
    emailed = false;
    confirmUrl = recovery.hashedToken
      ? portalConfirmUrl(baseUrl, recovery.hashedToken, "recovery")
      : recovery.actionLink;
  }

  try {
    await directory.link({ existingId: existing?.id ?? null, email, full_name: fullName, role, auth_user_id: authUserId });
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }

  return { ok: true, email, role, emailed, confirmUrl };
}
