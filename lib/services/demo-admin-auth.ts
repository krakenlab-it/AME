import { randomUUID } from "node:crypto";
import type { AdminUserRecord } from "@/lib/database/types";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { decrypt, encrypt, randomToken, sha256 } from "@/lib/encryption/crypto";
import { ADMIN_ABSOLUTE_HOURS, ADMIN_IDLE_MINUTES } from "@/lib/security/cookies";
import { hashPassword, hashPasswordSync, verifyPassword } from "@/lib/security/password";
import type { AdminRole } from "@/lib/security/rbac";
import { generateTotpSecret, verifyTotp } from "@/lib/security/totp";
import { settings } from "./settings";

const GENERIC_LOGIN_ERROR = "Correo o contraseña incorrectos.";

/**
 * Login local solo para DEMO_MODE (sin Supabase).
 * La contraseña y el secreto TOTP viven en memoria, no en admin_users.
 */

interface DemoCredential {
  passwordHash: string;
  totpEncrypted: string | null;
  failedLogins: number;
  lockedUntil: string | null;
}

interface DemoSession {
  id: string;
  sessionHash: string;
  adminId: string;
  mfaVerified: boolean;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

interface DemoState {
  credentials: Map<string, DemoCredential>;
  sessions: Map<string, DemoSession>;
}

/** Compartido vía globalThis: Next puede instanciar este módulo en varios bundles (páginas y acciones). */
const shared = globalThis as unknown as { __demoAdminStates?: WeakMap<MemoryRepo, DemoState> };
const states = (shared.__demoAdminStates ??= new WeakMap<MemoryRepo, DemoState>());
let dummyHash: Promise<string> | null = null;

function state(repo: MemoryRepo): DemoState {
  let current = states.get(repo);
  if (!current) {
    current = { credentials: new Map(), sessions: new Map() };
    states.set(repo, current);
  }
  return current;
}

function remember(repo: MemoryRepo, adminId: string, passwordHash: string, totpSecret: string | null) {
  state(repo).credentials.set(adminId, {
    passwordHash,
    totpEncrypted: totpSecret ? encrypt(totpSecret) : null,
    failedLogins: 0,
    lockedUntil: null,
  });
}

export async function createDemoAdmin(
  repo: MemoryRepo,
  input: { email: string; full_name: string; role: AdminRole; password: string; totpSecret?: string },
): Promise<AdminUserRecord> {
  const admin = await repo.createAdmin({
    email: input.email,
    full_name: input.full_name,
    role: input.role,
    auth_user_id: `demo:${randomUUID()}`,
  });
  remember(repo, admin.id, await hashPassword(input.password), input.totpSecret ?? null);
  if (input.totpSecret) await repo.updateAdmin(admin.id, { mfa_enabled: true });
  return admin;
}

/** Siembra síncrona al arrancar el modo demostración. */
export function seedDemoAdmin(
  repo: MemoryRepo,
  input: { email: string; full_name: string; role: AdminRole; password: string; totpSecret: string },
): AdminUserRecord {
  const admin = repo.createAdminSync({
    email: input.email,
    full_name: input.full_name,
    role: input.role,
    auth_user_id: `demo:${randomUUID()}`,
  });
  remember(repo, admin.id, hashPasswordSync(input.password), input.totpSecret);
  admin.mfa_enabled = true;
  return admin;
}

export async function changeDemoPassword(repo: MemoryRepo, adminId: string, password: string): Promise<void> {
  const cred = state(repo).credentials.get(adminId);
  if (!cred) return;
  cred.passwordHash = await hashPassword(password);
}

export type DemoLoginResult = { ok: true; sessionToken: string; needsEnrollment: boolean } | { ok: false; error: string };

export async function loginWithPassword(repo: MemoryRepo, email: string, password: string, ipHash: string): Promise<DemoLoginResult> {
  const normalized = email.trim().toLowerCase().slice(0, 254);
  const ipLimit = await repo.rateLimitHit(`admin-login-ip:${ipHash}`, settings.adminLoginLimitPerIp, 15 * 60);
  const emailLimit = await repo.rateLimitHit(`admin-login-email:${sha256(normalized)}`, settings.adminLoginLimitPerEmail, 15 * 60);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    await repo.logSecurityEvent({ event_type: "ADMIN_LOGIN_RATE_LIMITED", ip_hash: ipHash });
    return { ok: false, error: "Demasiados intentos. Espera 15 minutos." };
  }

  const admin = await repo.findAdminByEmail(normalized);
  const cred = admin ? state(repo).credentials.get(admin.id) : undefined;
  if (!admin || !admin.active || !cred) {
    dummyHash ??= hashPassword(randomToken(16));
    await verifyPassword(password, await dummyHash);
    await repo.logSecurityEvent({ event_type: "ADMIN_LOGIN_UNKNOWN", ip_hash: ipHash });
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
  if (cred.lockedUntil && new Date(cred.lockedUntil).getTime() > Date.now()) {
    return { ok: false, error: "La cuenta está bloqueada temporalmente. Intenta más tarde." };
  }

  const valid = await verifyPassword(password, cred.passwordHash);
  if (!valid) {
    const failed = cred.failedLogins + 1;
    const lock = failed >= settings.adminMaxFailedLogins;
    cred.failedLogins = lock ? 0 : failed;
    cred.lockedUntil = lock ? new Date(Date.now() + settings.adminLockMinutes * 60_000).toISOString() : cred.lockedUntil;
    await repo.audit({ actor_type: "admin", actor_id: admin.id, action: "ADMIN_LOGIN_FAILED", metadata: { locked: lock } });
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  cred.failedLogins = 0;
  cred.lockedUntil = null;
  const sessionToken = randomToken(32);
  const now = new Date().toISOString();
  const session: DemoSession = {
    id: randomUUID(),
    sessionHash: sha256(sessionToken),
    adminId: admin.id,
    mfaVerified: false,
    lastSeenAt: now,
    expiresAt: new Date(Date.now() + ADMIN_ABSOLUTE_HOURS * 3_600_000).toISOString(),
    revokedAt: null,
  };
  state(repo).sessions.set(session.id, session);
  return { ok: true, sessionToken, needsEnrollment: !admin.mfa_enabled };
}

/** Atajo de pruebas: abre una sesión con MFA ya resuelto. Solo se invoca bajo isDemoMode() sobre la base en memoria. */
export function startDemoSession(repo: MemoryRepo, adminId: string): string {
  const sessionToken = randomToken(32);
  const now = new Date().toISOString();
  const session: DemoSession = {
    id: randomUUID(),
    sessionHash: sha256(sessionToken),
    adminId,
    mfaVerified: true,
    lastSeenAt: now,
    expiresAt: new Date(Date.now() + ADMIN_ABSOLUTE_HOURS * 3_600_000).toISOString(),
    revokedAt: null,
  };
  state(repo).sessions.set(session.id, session);
  return sessionToken;
}

export interface DemoAdminContext {
  admin: AdminUserRecord;
  session: DemoSession;
  totpEncrypted: string | null;
}

export async function getDemoAdminContext(
  repo: MemoryRepo,
  sessionToken: string | undefined,
  opts: { requireMfa?: boolean } = {},
): Promise<DemoAdminContext | null> {
  if (!sessionToken || !/^[A-Za-z0-9_-]{32,128}$/.test(sessionToken)) return null;
  const bag = state(repo);
  const session = [...bag.sessions.values()].find((item) => item.sessionHash === sha256(sessionToken));
  if (!session || session.revokedAt) return null;
  const now = Date.now();
  if (new Date(session.expiresAt).getTime() <= now) return null;
  if (now - new Date(session.lastSeenAt).getTime() > ADMIN_IDLE_MINUTES * 60_000) {
    session.revokedAt = new Date().toISOString();
    return null;
  }
  if ((opts.requireMfa ?? true) && !session.mfaVerified) return null;
  const admin = await repo.getAdmin(session.adminId);
  if (!admin || !admin.active) return null;
  if (now - new Date(session.lastSeenAt).getTime() > 60_000) session.lastSeenAt = new Date().toISOString();
  return { admin, session, totpEncrypted: bag.credentials.get(admin.id)?.totpEncrypted ?? null };
}

export async function ensureMfaSecret(repo: MemoryRepo, admin: AdminUserRecord): Promise<string> {
  if (admin.mfa_enabled) throw new Error("MFA ya está activo");
  const cred = state(repo).credentials.get(admin.id);
  if (!cred) throw new Error("MFA ya está activo");
  if (cred.totpEncrypted) return decrypt(cred.totpEncrypted);
  const secret = generateTotpSecret();
  cred.totpEncrypted = encrypt(secret);
  return secret;
}

export async function verifyMfa(
  repo: MemoryRepo,
  ctx: DemoAdminContext,
  code: string,
  ipHash: string,
): Promise<{ ok: true; sessionToken: string } | { ok: false; error: string }> {
  const limit = await repo.rateLimitHit(`admin-mfa:${ctx.admin.id}`, 6, 15 * 60);
  if (!limit.allowed) {
    await repo.logSecurityEvent({ event_type: "ADMIN_MFA_RATE_LIMITED", ip_hash: ipHash });
    return { ok: false, error: "Demasiados intentos. Espera 15 minutos." };
  }
  if (!ctx.totpEncrypted) return { ok: false, error: "Primero configura tu aplicación autenticadora." };
  const secret = decrypt(ctx.totpEncrypted);
  if (!verifyTotp(secret, code)) {
    await repo.audit({ actor_type: "admin", actor_id: ctx.admin.id, action: "ADMIN_LOGIN_FAILED", metadata: { step: "mfa" } });
    return { ok: false, error: "El código no es correcto o ya venció." };
  }
  if (!ctx.admin.mfa_enabled) {
    await repo.updateAdmin(ctx.admin.id, { mfa_enabled: true });
    await repo.audit({ actor_type: "admin", actor_id: ctx.admin.id, action: "MFA_ENROLLED" });
  }
  const newToken = randomToken(32);
  ctx.session.sessionHash = sha256(newToken);
  ctx.session.mfaVerified = true;
  ctx.session.lastSeenAt = new Date().toISOString();
  await repo.updateAdmin(ctx.admin.id, { last_login_at: new Date().toISOString() });
  await repo.audit({ actor_type: "admin", actor_id: ctx.admin.id, action: "ADMIN_LOGIN" });
  return { ok: true, sessionToken: newToken };
}

export async function logoutDemo(repo: MemoryRepo, sessionToken: string | undefined): Promise<void> {
  const ctx = await getDemoAdminContext(repo, sessionToken, { requireMfa: false });
  if (!ctx) return;
  ctx.session.revokedAt = new Date().toISOString();
  await repo.audit({ actor_type: "admin", actor_id: ctx.admin.id, action: "ADMIN_LOGOUT" });
}
