import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAdoptSession, parseMagicLinkVerify } from "@/lib/contracts/magic-link";
import type { AdminRepo } from "@/lib/database/types";
import { sha256 } from "@/lib/encryption/crypto";
import { passwordPolicyError } from "@/lib/security/password";
import { createAuthClient } from "@/lib/supabase/server";
import {
  gateForAuthUser,
  normalizeAdminEmail,
  normalizeTotpCode,
  totpQrDataUrl,
  type AuthSnapshot,
} from "./admin-gate";
import { settings } from "./settings";

const GENERIC_LOGIN_ERROR = "Correo o contraseña incorrectos.";
const RATE_LIMIT_ERROR = "Demasiados intentos. Espera 15 minutos.";
const UNAVAILABLE_ERROR = "El servicio no está disponible. Intenta más tarde.";
const CONFIG_ERROR = "El acceso administrativo no está configurado.";
const LINK_ERROR = "El enlace no es válido o ya venció. Pide una nueva invitación o restablece la contraseña.";
export const RESET_SENT_MESSAGE = "Si ese correo tiene un acceso de administrador, enviaremos un enlace para elegir una contraseña nueva.";

export async function readAuthSnapshot(): Promise<AuthSnapshot> {
  const supabase = await createAuthClient();
  if (!supabase) return { userId: null, currentLevel: null, nextLevel: null };
  return readSnapshot(supabase);
}

async function readSnapshot(supabase: SupabaseClient): Promise<AuthSnapshot> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) return { userId: null, currentLevel: null, nextLevel: null };
  const userId = data.claims.sub;
  const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal.error || !aal.data) return { userId, currentLevel: null, nextLevel: null };
  return {
    userId,
    currentLevel: aal.data.currentLevel === "aal2" ? "aal2" : aal.data.currentLevel === "aal1" ? "aal1" : null,
    nextLevel: aal.data.nextLevel === "aal2" ? "aal2" : aal.data.nextLevel === "aal1" ? "aal1" : null,
  };
}

async function limited(repo: AdminRepo, email: string, ipHash: string): Promise<string | null> {
  const ipLimit = await repo.rateLimitHit(`admin-login-ip:${ipHash}`, settings.adminLoginLimitPerIp, 15 * 60);
  const emailLimit = await repo.rateLimitHit(`admin-login-email:${sha256(email)}`, settings.adminLoginLimitPerEmail, 15 * 60);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    await repo.logSecurityEvent({ event_type: "ADMIN_LOGIN_RATE_LIMITED", ip_hash: ipHash });
    return RATE_LIMIT_ERROR;
  }
  return null;
}

export async function signInAdmin(
  repo: AdminRepo,
  email: string,
  password: string,
  ipHash: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = normalizeAdminEmail(email);
  if (!normalized || !password || password.length > 256) return { ok: false, error: "Ingresa tu correo y contraseña." };
  const blocked = await limited(repo, normalized, ipHash);
  if (blocked) return { ok: false, error: blocked };

  const supabase = await createAuthClient();
  if (!supabase) return { ok: false, error: CONFIG_ERROR };
  const signed = await supabase.auth.signInWithPassword({ email: normalized, password });
  if (signed.error || !signed.data.user) {
    await repo.logSecurityEvent({ event_type: "ADMIN_LOGIN_UNKNOWN", ip_hash: ipHash });
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  const gate = await gateForAuthUser(repo, await readSnapshot(supabase));
  if (gate.kind === "anonymous" || gate.kind === "unlinked") {
    await supabase.auth.signOut();
    await repo.logSecurityEvent({ event_type: "ADMIN_LOGIN_UNKNOWN", ip_hash: ipHash });
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
  return { ok: true };
}

export async function requestPasswordReset(
  repo: AdminRepo,
  email: string,
  ipHash: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const normalized = normalizeAdminEmail(email);
  if (!normalized) return { ok: false, error: "Ingresa un correo válido." };
  const blocked = await limited(repo, normalized, ipHash);
  if (blocked) return { ok: false, error: blocked };

  const admin = await repo.findAdminByEmail(normalized);
  if (!admin?.active || !admin.auth_user_id) return { ok: true, message: RESET_SENT_MESSAGE };

  const supabase = await createAuthClient();
  if (!supabase) return { ok: false, error: CONFIG_ERROR };
  const redirectTo = `${settings.baseUrl()}/admin/auth/confirm?next=${encodeURIComponent("/admin/restablecer")}`;
  const { error } = await supabase.auth.resetPasswordForEmail(normalized, { redirectTo });
  if (error) {
    console.error(`[auth] reset: ${error.code ?? ""}`);
    return { ok: true, message: RESET_SENT_MESSAGE };
  }
  return { ok: true, message: RESET_SENT_MESSAGE };
}

export async function setAdminPassword(password: string, confirm: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const policy = passwordPolicyError(password);
  if (policy) return { ok: false, error: policy };
  if (password !== confirm) return { ok: false, error: "Las contraseñas no coinciden." };
  const supabase = await createAuthClient();
  if (!supabase) return { ok: false, error: CONFIG_ERROR };
  const snapshot = await readSnapshot(supabase);
  if (!snapshot.userId) return { ok: false, error: "Abre el enlace de invitación o de restablecimiento que recibiste por correo." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: "No se pudo guardar la contraseña. Pide un enlace nuevo." };
  return { ok: true };
}

export async function confirmEmailLink(input: {
  tokenHash?: string;
  type?: string;
  code?: string;
  next?: string;
}): Promise<{ ok: true; next: string } | { ok: false; error: string }> {
  const parsed = parseMagicLinkVerify(input);
  if (!parsed.ok) return { ok: false, error: LINK_ERROR };
  const supabase = await createAuthClient();
  if (!supabase) return { ok: false, error: CONFIG_ERROR };

  switch (parsed.verify.method) {
    case "otp": {
      const { error } = await supabase.auth.verifyOtp({ token_hash: parsed.verify.tokenHash, type: parsed.verify.type });
      if (error) return { ok: false, error: LINK_ERROR };
      return { ok: true, next: parsed.verify.next };
    }
    case "code": {
      const { error } = await supabase.auth.exchangeCodeForSession(parsed.verify.code);
      if (error) return { ok: false, error: LINK_ERROR };
      return { ok: true, next: parsed.verify.next };
    }
    default: {
      const unreachable: never = parsed.verify;
      return unreachable;
    }
  }
}

export async function adoptAuthSession(input: {
  accessToken: string;
  refreshToken: string;
  type?: string;
}): Promise<{ ok: true; next: string } | { ok: false; error: string }> {
  const parsed = parseAdoptSession(input);
  if (!parsed.ok) return { ok: false, error: LINK_ERROR };
  const supabase = await createAuthClient();
  if (!supabase) return { ok: false, error: CONFIG_ERROR };
  const { error } = await supabase.auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken });
  if (error) return { ok: false, error: LINK_ERROR };
  return { ok: true, next: parsed.next };
}

export async function beginTotpEnrollment(): Promise<{ qr: string; secret: string; factorId: string }> {
  const supabase = await createAuthClient();
  if (!supabase) throw new Error(CONFIG_ERROR);
  const listed = await supabase.auth.mfa.listFactors();
  if (listed.error || !listed.data) throw new Error(UNAVAILABLE_ERROR);
  for (const factor of listed.data.all) {
    if (factor.factor_type === "totp" && factor.status !== "verified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }
  const enrolled = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Portal AME",
    issuer: "Portal AME",
  });
  if (enrolled.error || !enrolled.data) throw new Error(UNAVAILABLE_ERROR);
  return {
    factorId: enrolled.data.id,
    secret: enrolled.data.totp.secret,
    qr: totpQrDataUrl(enrolled.data.totp.qr_code),
  };
}

export async function verifyAdminTotp(
  repo: AdminRepo,
  input: { code: string; factorId: string },
  ipHash: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = normalizeTotpCode(input.code);
  if (!code) return { ok: false, error: "Escribe el código de 6 dígitos." };
  const supabase = await createAuthClient();
  if (!supabase) return { ok: false, error: CONFIG_ERROR };
  const gate = await gateForAuthUser(repo, await readSnapshot(supabase));
  if (gate.kind === "anonymous" || gate.kind === "unlinked") return { ok: false, error: "Vuelve a ingresar." };

  const limit = await repo.rateLimitHit(`admin-mfa:${gate.admin.id}`, 6, 15 * 60);
  if (!limit.allowed) {
    await repo.logSecurityEvent({ event_type: "ADMIN_MFA_RATE_LIMITED", ip_hash: ipHash });
    return { ok: false, error: RATE_LIMIT_ERROR };
  }

  let factorId = input.factorId.trim();
  const enrolling = factorId.length > 0;
  if (!factorId) {
    const listed = await supabase.auth.mfa.listFactors();
    factorId = listed.data?.totp[0]?.id ?? "";
  }
  if (!factorId) return { ok: false, error: "Primero configura tu aplicación autenticadora." };

  const verified = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (verified.error) {
    await repo.audit({ actor_type: "admin", actor_id: gate.admin.id, action: "ADMIN_LOGIN_FAILED", metadata: { step: "mfa" } });
    return { ok: false, error: "El código no es correcto o ya venció." };
  }

  await repo.updateAdmin(gate.admin.id, { mfa_enabled: true, last_login_at: new Date().toISOString() });
  if (enrolling) await repo.audit({ actor_type: "admin", actor_id: gate.admin.id, action: "MFA_ENROLLED" });
  await repo.audit({ actor_type: "admin", actor_id: gate.admin.id, action: "ADMIN_LOGIN" });
  return { ok: true };
}

export async function signOutAdmin(repo: AdminRepo): Promise<void> {
  const supabase = await createAuthClient();
  if (!supabase) return;
  const gate = await gateForAuthUser(repo, await readSnapshot(supabase));
  if (gate.kind !== "anonymous" && gate.kind !== "unlinked") {
    await repo.audit({ actor_type: "admin", actor_id: gate.admin.id, action: "ADMIN_LOGOUT" });
  }
  await supabase.auth.signOut();
}

export { CONFIG_ERROR, UNAVAILABLE_ERROR };
