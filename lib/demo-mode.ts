import { deployStage } from "@/lib/privacy/readiness";

function isNextProductionBuild(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

function vercelPreviewHost(): boolean {
  const blob = [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return blob.includes(".vercel.app") && blob.includes("-git-");
}

/** Marcado en `next.config` durante el build de un despliegue Preview en Vercel (-git- en VERCEL_URL). */
export function isPreviewSandboxBuild(): boolean {
  return process.env.PORTAL_PREVIEW_SANDBOX_BUILD === "true";
}

/**
 * Preview de Jaime: base en memoria vacía (solo cuentas demo del panel).
 * Importaciones nuevas llenan el Resumen; no arrastrar seeds ni cargas anteriores entre instancias.
 */
export function previewSandboxEmptyPeople(): boolean {
  if (process.env.SANDBOX_PREVIEW_EMPTY === "false") return false;
  if (isPreviewSandboxBuild()) return true;
  if (isNextProductionBuild()) return false;
  return deployStage() === "preview" || vercelPreviewHost();
}

/** URL pública del despliegue Preview (-git-) para enlaces /verificar en CSV. */
export function previewSandboxPublicBaseUrl(): string | null {
  if (!isPreviewSandboxDeployment() && !isPreviewSandboxBuild()) return null;
  const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  if (!host || !host.includes("-git-")) return null;
  return `https://${host.replace(/\/$/, "")}`;
}

/** Despliegue Preview / sandbox (runtime o build). Nunca producción real en vercel.app sin -git-. */
export function isPreviewSandboxDeployment(): boolean {
  if (isNextProductionBuild()) return false;
  if (isPreviewSandboxBuild()) return true;
  if (deployStage() === "preview") return true;
  return vercelPreviewHost();
}

/**
 * Base en memoria solo para pruebas locales y el servidor de e2e.
 * Nunca en Vercel (producción ni Preview) y nunca si APP_STAGE es production.
 * PORTAL_E2E lo enciende el runner de Playwright; next start usa NODE_ENV=production.
 */
export function memoryRepoAllowed(): boolean {
  if (isNextProductionBuild()) return false;
  if (process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") return false;
  if (process.env.APP_STAGE === "production") return false;
  if (process.env.PORTAL_E2E === "true" && !process.env.VERCEL) return true;
  if (process.env.NODE_ENV === "production") return false;
  return process.env.DEMO_MODE === "true";
}

/** Alias histórico: el panel y las pruebas hablan de modo demostración. */
export function isDemoMode(): boolean {
  return memoryRepoAllowed();
}

/** Se niega a arrancar si alguien intenta encender la base de prueba en producción. */
export function assertDemoAllowed(): void {
  const production = process.env.VERCEL_ENV === "production" || process.env.APP_STAGE === "production";
  if (process.env.DEMO_MODE === "true" && production) {
    throw new Error("DEMO_MODE no está permitido en producción");
  }
  if (process.env.PORTAL_E2E === "true" && (process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview")) {
    throw new Error("PORTAL_E2E no está permitido en Vercel");
  }
}

/** Producción y Preview usan solo Supabase. Si faltan las variables, no hay base de respaldo. */
export function assertSupabaseConfigured(): void {
  if (memoryRepoAllowed()) return;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("El portal no puede arrancar: faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. En este entorno no hay una base en memoria de respaldo.");
  }
}
