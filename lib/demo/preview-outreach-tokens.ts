/** Slug público del enlace de demostración en Preview (happy path Jaime). */
export const PREVIEW_OUTREACH_RAW_TOKEN = "verificacióndedatospersonales";
/** Enlace anterior; redirige al slug nuevo. */
export const PREVIEW_OUTREACH_LEGACY_RAW_TOKEN = "PreviewJaimeDatosCompletar2026SandboxX";
export const PREVIEW_OUTREACH_SIMULATION_TO = "yepezmancheno@gmail.com";

const PREVIEW_DEMO_TOKENS = new Set([PREVIEW_OUTREACH_RAW_TOKEN, PREVIEW_OUTREACH_LEGACY_RAW_TOKEN]);

export function normalizePreviewDemoToken(raw: string): string {
  if (!raw) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function isPreviewDemoAccessToken(raw: string): boolean {
  return PREVIEW_DEMO_TOKENS.has(normalizePreviewDemoToken(raw));
}
