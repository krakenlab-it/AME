/**
 * Código de ingreso por correo. Los servicios dependen de esta interfaz, no de Supabase,
 * para probar el recorrido en memoria y en el navegador de CI sin enviar correos.
 */
export type EmailOtpSendResult = { ok: true } | { ok: false; reason: "rate_limited" | "unavailable" };

export type EmailOtpVerifyResult =
  | { ok: true; authUserId: string | null; email: string }
  | { ok: false; reason: "invalid" | "rate_limited" | "unavailable" };

export interface EmailOtpProvider {
  /** Envía un código de acceso (6 a 10 dígitos, según Supabase) al correo. Crea el usuario de Auth si no existe. */
  send(email: string): Promise<EmailOtpSendResult>;
  /** Comprueba el código. No deja una sesión de Supabase abierta en el navegador. */
  verify(email: string, code: string): Promise<EmailOtpVerifyResult>;
}

/** Código fijo del modo demostración (solo memoria local y e2e; nunca en Vercel). */
export const DEMO_EMAIL_OTP_CODE = "246810";

/** Proveedor del modo demostración: no envía nada y acepta DEMO_EMAIL_OTP_CODE. */
export function demoEmailOtpProvider(code = DEMO_EMAIL_OTP_CODE): EmailOtpProvider & { sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    async send(email) {
      sent.push(email);
      return { ok: true };
    },
    async verify(email, token) {
      return token === code ? { ok: true, authUserId: null, email } : { ok: false, reason: "invalid" };
    },
  };
}
