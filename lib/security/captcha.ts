/**
 * CAPTCHA adaptativo (Cloudflare Turnstile). Solo se exige después de varios intentos
 * fallidos desde la misma IP. Si no hay llaves configuradas, el sistema confía en el
 * rate limiting y en el bloqueo por token.
 */
export function captchaEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export async function verifyCaptcha(token: string | undefined, ip: string): Promise<boolean> {
  if (!captchaEnabled()) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token, remoteip: ip });
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
