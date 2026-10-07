/** 1712345645 -> 17******45. BH823158 -> BH****58. Conserva letras del pasaporte. */
export function maskCedula(cedula: string | null | undefined): string {
  if (!cedula) return "**********";
  const v = cedula.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (v.length < 4) return "*".repeat(v.length);
  return `${v.slice(0, 2)}${"*".repeat(v.length - 4)}${v.slice(-2)}`;
}

/** Solo los 2 últimos dígitos: ********45 */
export function maskCedulaTail(last2: string | null | undefined): string {
  return `********${last2 ?? "**"}`;
}

/** ••••••••4821 */
export function maskAccount(last4: string | null | undefined): string {
  return `••••••••${last4 ?? "••••"}`;
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return "";
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  return `${user.slice(0, 1)}${"*".repeat(Math.max(user.length - 1, 2))}@${domain}`;
}

/** +593991234567 -> ••••4567 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `••••${digits.slice(-4)}`;
}
