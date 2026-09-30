import { deployStage } from "@/lib/privacy/readiness";

function demoModeRequested(): boolean {
  return process.env.DEMO_MODE === "true";
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
