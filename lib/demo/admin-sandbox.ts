import "server-only";
import { PRODUCT_SEED_DEMO_ADMIN, PRODUCT_SEED_DEMO_TOTP_SECRET } from "@/lib/seed/ci-seed";
import { totpCode } from "@/lib/security/totp";

/** Credenciales visibles solo en sandbox / modo demostración (nunca producción real). */
export const DEMO_ADMIN_CREDENTIALS = PRODUCT_SEED_DEMO_ADMIN;

/** Código fijo aceptado en MFA de demostración (sin app autenticadora). */
export const DEMO_ADMIN_MFA_BYPASS_CODE = "000000";

export function normalizeMfaCode(code: string): string {
  return code.replace(/\s/g, "");
}

export function isDemoAdminMfaBypass(code: string): boolean {
  return normalizeMfaCode(code) === DEMO_ADMIN_MFA_BYPASS_CODE;
}

/** Código TOTP actual del seed de demostración (cambia cada 30 s). */
export function currentDemoAdminTotpCode(now = Date.now()): string {
  return totpCode(PRODUCT_SEED_DEMO_TOTP_SECRET, now);
}
