import "server-only";
import { cookies } from "next/headers";
import { getRepo } from "@/lib/database";
import { isMemoryRepo } from "@/lib/database/memory-repo";
import { isDemoMode } from "@/lib/demo-mode";
import { decrypt } from "@/lib/encryption/crypto";
import { ADMIN_COOKIE } from "@/lib/security/cookies";
import { verifyTotp } from "@/lib/security/totp";
import { createAuthClient } from "@/lib/supabase/server";
import { readAuthSnapshot } from "@/lib/services/admin-auth";
import { gateForAuthUser, normalizeTotpCode } from "@/lib/services/admin-gate";
import { isDemoAdminMfaBypass } from "@/lib/demo/admin-sandbox";
import { getDemoAdminContext } from "@/lib/services/demo-admin-auth";

const BAD_CODE = "El código no es correcto o ya venció.";
const RATE = "Demasiados intentos. Espera 15 minutos.";

/** Vuelve a comprobar el TOTP del administrador que ya está en el panel. No abre una sesión nueva. */
export async function reconfirmAdminTotp(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const clean = normalizeTotpCode(code);
  if (!clean) return { ok: false, error: "Escribe el código de 6 dígitos de tu aplicación autenticadora." };
  const repo = getRepo();

  if (isDemoMode()) {
    if (!isMemoryRepo(repo)) return { ok: false, error: "El modo demostración no está disponible." };
    const ctx = await getDemoAdminContext(repo, (await cookies()).get(ADMIN_COOKIE())?.value);
    if (!ctx?.totpEncrypted) return { ok: false, error: "Primero configura la verificación en dos pasos." };
    const limit = await repo.rateLimitHit(`manual-mfa:${ctx.admin.id}`, 6, 15 * 60);
    if (!limit.allowed) return { ok: false, error: RATE };
    if (!isDemoAdminMfaBypass(clean) && !verifyTotp(decrypt(ctx.totpEncrypted), clean)) {
      await repo.logSecurityEvent({ event_type: "MANUAL_EDIT_MFA_FAILED", ip_hash: null });
      return { ok: false, error: BAD_CODE };
    }
    return { ok: true };
  }

  const supabase = await createAuthClient();
  if (!supabase) return { ok: false, error: "El acceso administrativo no está configurado." };
  const gate = await gateForAuthUser(repo, await readAuthSnapshot());
  if (gate.kind !== "panel") return { ok: false, error: "Vuelve a ingresar." };
  const limit = await repo.rateLimitHit(`manual-mfa:${gate.admin.id}`, 6, 15 * 60);
  if (!limit.allowed) return { ok: false, error: RATE };
  const listed = await supabase.auth.mfa.listFactors();
  const factorId = listed.data?.totp.find((factor) => factor.status === "verified")?.id ?? listed.data?.totp[0]?.id ?? "";
  if (!factorId) return { ok: false, error: "Primero configura la verificación en dos pasos." };
  const verified = await supabase.auth.mfa.challengeAndVerify({ factorId, code: clean });
  if (verified.error) {
    await repo.logSecurityEvent({ event_type: "MANUAL_EDIT_MFA_FAILED", ip_hash: null });
    return { ok: false, error: BAD_CODE };
  }
  return { ok: true };
}
