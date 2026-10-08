import "server-only";
import { assertDemoAllowed, assertSupabaseConfigured, memoryRepoAllowed } from "@/lib/demo-mode";
import { createDemoRepo } from "./demo";
import { SupabaseRepo } from "./supabase-repo";
import type { Repo } from "./types";

const globalRepo = globalThis as unknown as { __portalRepo?: Repo };

/** Repositorio único por instancia serverless. Solo se usa en el servidor. */
export function getRepo(): Repo {
  if (globalRepo.__portalRepo) return globalRepo.__portalRepo;
  assertDemoAllowed();
  if (memoryRepoAllowed()) {
    globalRepo.__portalRepo = createDemoRepo();
  } else {
    assertSupabaseConfigured();
    globalRepo.__portalRepo = SupabaseRepo.fromEnv();
  }
  return globalRepo.__portalRepo;
}
