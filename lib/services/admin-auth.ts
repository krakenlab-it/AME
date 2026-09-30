import { decrypt, encrypt, randomToken, sha256 } from "@/lib/encryption/crypto";
import type { AdminRepo, AdminSessionRecord, AdminUserRecord } from "@/lib/database/types";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { generateTotpSecret, verifyTotp } from "@/lib/security/totp";
import { ADMIN_ABSOLUTE_HOURS, ADMIN_IDLE_MINUTES } from "@/lib/security/cookies";
import { settings } from "./settings";

const GENERIC_LOGIN_ERROR = "Correo o contraseña incorrectos.";
let dummyHash: Promise<string> | null = null;

export type LoginResult = { ok: true; sessionToken: string; needsEnrollment: boolean } | { ok: false; error: string };

export async function loginWithPassword(repo: AdminRepo, email: string, password: string, ipHash: string): Promise<LoginResult> {
  const normalized = email.trim().toLowerCase().slice(0, 254);
  const ipLimit = await repo.rateLimitHit(`admin-login-ip:${ipHash}`, settings.adminLoginLimitPerIp, 15 * 60);
  const emailLimit = await repo.rateLimitHit(`admin-login-email:${sha256(normalized)}`, settings.adminLoginLimitPerEmail, 15 * 60);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    await repo.logSecurityEvent({ event_type: "ADMIN_LOGIN_RATE_LIMITED", ip_hash: ipHash });
    return { ok: false, error: "Demasiados intentos. Espera 15 minutos." };
  }

  const admin = await repo.findAdminByEmail(normalized);
  if (!admin || !admin.active) {
    // Igualar tiempos para no revelar si el correo existe
    dummyHash ??= hashPassword(randomToken(16));
    await verifyPassword(password, await dummyHash);
    await repo.logSecurityEvent({ event_type: "ADMIN_LOGIN_UNKNOWN", ip_hash: ipHash });
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
  if (admin.locked_until && new Date(admin.locked_until).getTime() > Date.now()) {
    return { ok: false, error: "La cuenta está bloqueada temporalmente. Intenta más tarde." };
  }

  const valid = await verifyPassword(password, admin.password_hash);
  if (!valid) {
    const failed = admin.failed_logins + 1;
    const lock = failed >= settings.adminMaxFailedLogins;
    await repo.updateAdmin(admin.id, {
      failed_logins: lock ? 0 : failed,
      locked_until: lock ? new Date(Date.now() + settings.adminLockMinutes * 60_000).toISOString() : admin.locked_until,
    });
    await repo.audit({ actor_type: "admin", actor_id: admin.id, action: "ADMIN_LOGIN_FAILED", metadata: { locked: lock } });
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  await repo.updateAdmin(admin.id, { failed_logins: 0, locked_until: null });
  const sessionToken = randomToken(32);
  await repo.createAdminSession({
    session_hash: sha256(sessionToken),
    admin_id: admin.id,
    expires_at: new Date(Date.now() + ADMIN_ABSOLUTE_HOURS * 3_600_000).toISOString(),
  });
  return { ok: true, sessionToken, needsEnrollment: !admin.mfa_enabled };
}

export interface AdminContext {
  admin: AdminUserRecord;
  session: AdminSessionRecord;
}

/** Valida la cookie: vigencia absoluta, inactividad y (opcionalmente) MFA completado. */
export async function getAdminContext(repo: AdminRepo, sessionToken: string | undefined, opts: { requireMfa?: boolean } = {}): Promise<AdminContext | null> {
  if (!sessionToken || !/^[A-Za-z0-9_-]{32,128}$/.test(sessionToken)) return null;
  const session = await repo.findAdminSession(sha256(sessionToken));
  if (!session || session.revoked_at) return null;
  const now = Date.now();
  if (new Date(session.expires_at).getTime() <= now) return null;
  if (now - new Date(session.last_seen_at).getTime() > ADMIN_IDLE_MINUTES * 60_000) {
    await repo.updateAdminSession(session.id, { revoked_at: new Date().toISOString() });
    return null;
  }
  if ((opts.requireMfa ?? true) && !session.mfa_verified) return null;
  const admin = await repo.getAdmin(session.admin_id);
  if (!admin || !admin.active) return null;
  if (now - new Date(session.last_seen_at).getTime() > 60_000) {
    await repo.updateAdminSession(session.id, { last_seen_at: new Date().toISOString() });
  }
  return { admin, session };
}

/** Devuelve el secreto TOTP en claro (solo para mostrar el QR durante el enrolamiento). */
export async function ensureMfaSecret(repo: AdminRepo, admin: AdminUserRecord): Promise<string> {
  if (admin.mfa_enabled) throw new Error("MFA ya está activo");
  if (admin.mfa_secret_encrypted) return decrypt(admin.mfa_secret_encrypted);
  const secret = generateTotpSecret();
  await repo.updateAdmin(admin.id, { mfa_secret_encrypted: encrypt(secret) });
  return secret;
}

/**
 * Verifica el código TOTP. Si es correcto, rota el identificador de sesión
 * (evita session fixation) y marca la sesión como verificada.
 */
export async function verifyMfa(repo: AdminRepo, ctx: AdminContext, code: string, ipHash: string): Promise<{ ok: true; sessionToken: string } | { ok: false; error: string }> {
  const limit = await repo.rateLimitHit(`admin-mfa:${ctx.admin.id}`, 6, 15 * 60);
  if (!limit.allowed) {
    await repo.logSecurityEvent({ event_type: "ADMIN_MFA_RATE_LIMITED", ip_hash: ipHash });
    return { ok: false, error: "Demasiados intentos. Espera 15 minutos." };
  }
  if (!ctx.admin.mfa_secret_encrypted) return { ok: false, error: "Primero configura tu aplicación autenticadora." };
  const secret = decrypt(ctx.admin.mfa_secret_encrypted);
  if (!verifyTotp(secret, code)) {
    await repo.audit({ actor_type: "admin", actor_id: ctx.admin.id, action: "ADMIN_LOGIN_FAILED", metadata: { step: "mfa" } });
    return { ok: false, error: "El código no es correcto o ya venció." };
  }
  if (!ctx.admin.mfa_enabled) {
    await repo.updateAdmin(ctx.admin.id, { mfa_enabled: true });
    await repo.audit({ actor_type: "admin", actor_id: ctx.admin.id, action: "MFA_ENROLLED" });
  }
  const newToken = randomToken(32);
  await repo.updateAdminSession(ctx.session.id, { session_hash: sha256(newToken), mfa_verified: true, last_seen_at: new Date().toISOString() });
  await repo.updateAdmin(ctx.admin.id, { last_login_at: new Date().toISOString() });
  await repo.audit({ actor_type: "admin", actor_id: ctx.admin.id, action: "ADMIN_LOGIN" });
  return { ok: true, sessionToken: newToken };
}

export async function logout(repo: AdminRepo, ctx: AdminContext | null): Promise<void> {
  if (!ctx) return;
  await repo.updateAdminSession(ctx.session.id, { revoked_at: new Date().toISOString() });
  await repo.audit({ actor_type: "admin", actor_id: ctx.admin.id, action: "ADMIN_LOGOUT" });
}
