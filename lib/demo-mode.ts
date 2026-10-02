import { deployStage } from "@/lib/privacy/readiness";

function isNextProductionBuild(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/**
 * Modo demostración explícito (DEMO_MODE=true) o automático en Vercel Preview en runtime.
 * Nunca durante `next build`: evita sembrar memoria en el paso de compilación.
 */
function vercelPreviewHost(): boolean {
  const blob = `${process.env.VERCEL_URL ?? ""} ${process.env.VERCEL_BRANCH_URL ?? ""}`.toLowerCase();
  return blob.includes(".vercel.app") && blob.includes("-git-");
}

function demoModeRequested(): boolean {
  if (process.env.DEMO_MODE === "false") return false;
  if (process.env.DEMO_MODE === "true") return true;
  if (process.env.SANDBOX_PREVIEW_DEMO === "true") return true;
  if (isNextProductionBuild()) return false;
  if (deployStage() === "preview") return true;
  return vercelPreviewHost();
}

/** Datos ficticios en memoria. Nunca en producción, aunque la variable esté presente. */
export function isDemoMode(): boolean {
  return demoModeRequested() && deployStage() !== "production";
}

/** El proceso debe negarse a arrancar si DEMO_MODE llega a producción. */
export function assertDemoAllowed(): void {
  if (demoModeRequested() && deployStage() === "production") {
    throw new Error("DEMO_MODE no está permitido en producción");
  }
}
