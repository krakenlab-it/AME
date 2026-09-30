import { destinationAfterConfirm } from "@/lib/services/admin-gate";

/**
 * Tipos de enlace que Supabase puede devolver en el correo.
 * "signup" es un tipo de OTP del proveedor, no un alta pública de este portal.
 * Las cuentas de administrador se crean solo con invitación (scripts/create-admin.ts).
 */
export const EMAIL_OTP_TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;

export type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

export type MagicLinkVerify =
  | { method: "otp"; tokenHash: string; type: EmailOtpType; next: string }
  | { method: "code"; code: string; next: string };

const OTP_HASH_MAX = 2048;
const CODE_MAX = 2048;
const SESSION_TOKEN_MAX = 20_000;

function asEmailOtpType(value: string | undefined): EmailOtpType | null {
  if (!value) return null;
  for (const type of EMAIL_OTP_TYPES) {
    if (type === value) return type;
  }
  return null;
}

/** Valida el enlace de invitación o restablecimiento antes de hablar con Supabase Auth. */
export function parseMagicLinkVerify(input: {
  tokenHash?: string;
  type?: string;
  code?: string;
  next?: string;
}): { ok: true; verify: MagicLinkVerify } | { ok: false } {
  const next = destinationAfterConfirm(input.type, input.next);
  const tokenHash = input.tokenHash?.trim() ?? "";
  const code = input.code?.trim() ?? "";

  if (tokenHash) {
    if (tokenHash.length > OTP_HASH_MAX) return { ok: false };
    const type = asEmailOtpType(input.type);
    if (!type) return { ok: false };
    return { ok: true, verify: { method: "otp", tokenHash, type, next } };
  }

  if (code) {
    if (code.length > CODE_MAX) return { ok: false };
    return { ok: true, verify: { method: "code", code, next } };
  }

  return { ok: false };
}

/** Fragmento #access_token del enlace. No acepta un destino externo. */
export function parseAdoptSession(input: {
  accessToken?: string;
  refreshToken?: string;
  type?: string;
}): { ok: true; accessToken: string; refreshToken: string; next: string } | { ok: false } {
  const accessToken = input.accessToken?.trim() ?? "";
  const refreshToken = input.refreshToken?.trim() ?? "";
  if (!accessToken || !refreshToken) return { ok: false };
  if (accessToken.length > SESSION_TOKEN_MAX || refreshToken.length > SESSION_TOKEN_MAX) return { ok: false };
  return { ok: true, accessToken, refreshToken, next: destinationAfterConfirm(input.type, null) };
}
