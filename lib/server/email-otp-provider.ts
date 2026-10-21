import "server-only";
import { createClient } from "@supabase/supabase-js";
import { isDemoMode } from "@/lib/demo-mode";
import { demoEmailOtpProvider, type EmailOtpProvider } from "@/lib/services/email-otp";
import { supabasePublicConfig } from "@/lib/supabase/public-env";

/**
 * Supabase Auth como motor del código por correo: signInWithOtp + verifyOtp(type "email").
 * Cliente sin cookies (persistSession false): la sesión de Auth no llega al navegador y no
 * se mezcla con la del panel. Después de verificar se cierra (signOut local revoca el refresh token).
 * La sesión del titular sigue siendo respondent_sessions, igual que antes.
 *
 * El correo sale por el SMTP configurado en Supabase (Auth → SMTP). La plantilla
 * "Magic Link" y "Confirm signup" tienen que mostrar {{ .Token }}.
 */
function supabaseEmailOtpProvider(url: string, anonKey: string): EmailOtpProvider {
  const client = () =>
    createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: "implicit" },
      global: { headers: { "x-application-name": "portal-actualizacion-ame" } },
    });

  return {
    async send(email) {
      try {
        const { error } = await client().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
        if (!error) return { ok: true };
        // Nunca se registra el correo: solo el código del error.
        console.error(`[otp] envío rechazado (${error.status ?? ""} ${error.code ?? ""})`);
        return { ok: false, reason: error.status === 429 ? "rate_limited" : "unavailable" };
      } catch {
        console.error("[otp] error de red al enviar");
        return { ok: false, reason: "unavailable" };
      }
    },
    async verify(email, token) {
      try {
        const supabase = client();
        const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
        if (error || !data.user) {
          if (error?.status === 429) return { ok: false, reason: "rate_limited" };
          if (error && (error.status ?? 0) >= 500) return { ok: false, reason: "unavailable" };
          return { ok: false, reason: "invalid" };
        }
        if (data.session) await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        return { ok: true, authUserId: data.user.id, email: (data.user.email ?? email).toLowerCase() };
      } catch {
        console.error("[otp] error de red al verificar");
        return { ok: false, reason: "unavailable" };
      }
    },
  };
}

const globalOtp = globalThis as unknown as { __portalEmailOtp?: EmailOtpProvider };

export function getEmailOtpProvider(): EmailOtpProvider | null {
  if (globalOtp.__portalEmailOtp) return globalOtp.__portalEmailOtp;
  if (isDemoMode()) {
    globalOtp.__portalEmailOtp = demoEmailOtpProvider();
    return globalOtp.__portalEmailOtp;
  }
  const cfg = supabasePublicConfig();
  if (!cfg) return null;
  globalOtp.__portalEmailOtp = supabaseEmailOtpProvider(cfg.url, cfg.anonKey);
  return globalOtp.__portalEmailOtp;
}
