import { deployStage } from "@/lib/privacy/readiness";

/** Datos ficticios en memoria. Nunca en producción, aunque la variable esté presente. */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true" && deployStage() !== "production";
}
