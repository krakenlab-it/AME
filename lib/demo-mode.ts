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

/** Despliegue Preview / sandbox (runtime o build). Nunca producción real en vercel.app sin -git-. */
export function isPreviewSandboxDeployment(): boolean {
  if (isNextProductionBuild()) return false;
  if (isPreviewSandboxBuild()) return true;
  if (deployStage() === "preview") return true;
  return vercelPreviewHost();
}

/**
 * Modo demostración explícito (DEMO_MODE=true), automático en Preview de Vercel,
 * o build Preview (PORTAL_PREVIEW_SANDBOX_BUILD). DEMO_MODE=false no apaga el sandbox Preview.
 */
function demoModeRequested(): boolean {
  if (process.env.SANDBOX_PREVIEW_DEMO === "false") return false;
  if (process.env.DEMO_MODE === "true") return true;
  if (isPreviewSandboxDeployment()) return true;
  if (process.env.DEMO_MODE === "false") return false;
  return false;
}

/** Datos ficticios en memoria. Nunca en producción, aunque la variable esté presente. */
export function isDemoMode(): boolean {
  if (isNextProductionBuild()) return false;
  if (deployStage() === "production" && !isPreviewSandboxBuild()) return false;
  return demoModeRequested();
}

/** El proceso debe negarse a arrancar si DEMO_MODE llega a producción. */
export function assertDemoAllowed(): void {
  if (deployStage() === "production" && !isPreviewSandboxBuild() && isDemoMode()) {
    throw new Error("DEMO_MODE no está permitido en producción");
  }
  if (process.env.DEMO_MODE === "true" && deployStage() === "production" && !isPreviewSandboxBuild()) {
    throw new Error("DEMO_MODE no está permitido en producción");
  }
}
