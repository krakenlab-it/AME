import "server-only";
import { deployStage } from "@/lib/privacy/readiness";
import { createDemoRepo } from "./demo";
import { SupabaseRepo } from "./supabase-repo";
import type { Repo } from "./types";

const globalRepo = globalThis as unknown as { __portalRepo?: Repo };

/** Repositorio único por instancia serverless. Solo se usa en el servidor. */
export function getRepo(): Repo {
  if (globalRepo.__portalRepo) return globalRepo.__portalRepo;
  if (process.env.DEMO_MODE === "true") {
    if (deployStage() === "production") throw new Error("DEMO_MODE no está permitido en producción");
    globalRepo.__portalRepo = createDemoRepo();
  } else {
    globalRepo.__portalRepo = SupabaseRepo.fromEnv();
  }
  return globalRepo.__portalRepo;
}
