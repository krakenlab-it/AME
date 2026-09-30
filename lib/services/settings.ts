/** Parámetros operativos (con valores por defecto seguros). */
export const settings = {
  tokenTtlDays: () => clampInt(process.env.TOKEN_TTL_DAYS, 30, 1, 180),
  tokenLockThreshold: 5,
  identifyLimitPerIp: 10,
  identifyWindowSeconds: 15 * 60,
  captchaAfterAttempts: 3,
  adminLoginLimitPerIp: 10,
  adminLoginLimitPerEmail: 5,
  adminLockMinutes: 15,
  adminMaxFailedLogins: 5,
  exportLimitPerHour: 20,
  baseUrl: () => (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
};

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.round(n), min), max);
}
