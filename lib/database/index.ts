import "server-only";
import { assertDemoAllowed, isDemoMode } from "@/lib/demo-mode";
import { createDemoRepo } from "./demo";
import { SupabaseRepo } from "./supabase-repo";
import type { Repo } from "./types";

const globalRepo = globalThis as unknown as { __portalRepo?: Repo };

/** Repositorio único por instancia serverless. Solo se usa en el servidor. */
export function getRepo(): Repo {
  if (globalRepo.__portalRepo) return globalRepo.__portalRepo;
  assertDemoAllowed();
  if (isDemoMode()) {
    globalRepo.__portalRepo = createDemoRepo();
  } else {
    globalRepo.__portalRepo = SupabaseRepo.fromEnv();
  }
  return globalRepo.__portalRepo;
}
