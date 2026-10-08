import "server-only";
import { randomToken, sha256 } from "@/lib/encryption/crypto";
import { isPreviewSandboxDeployment, previewSandboxEmptyPeople } from "@/lib/demo-mode";
import { PRODUCT_SEED_DEMO_ADMIN, PRODUCT_SEED_DEMO_TOTP_SECRET } from "@/lib/seed/ci-seed";
import { loadProductSeed } from "@/lib/seed/load-memory";
import { PRODUCT_PERSONAS } from "@/lib/seed/product-personas";
import { seedDemoAdmin } from "@/lib/services/demo-admin-auth";
import { generateTotpSecret } from "@/lib/security/totp";
import { ensurePreviewOutreachAnchor } from "@/lib/seed/preview-outreach-anchor";
import { MemoryRepo } from "./memory-repo";

/**
 * Modo demostración: base en memoria con datos ficticios para probar el portal sin Supabase.
 * Solo cuando memoryRepoAllowed() es verdadero (pruebas locales o PORTAL_E2E). Nunca en Vercel.
 */
function seedProductUsers(): boolean {
  if (process.env.SEED_PRODUCT_USERS === "false") return false;
  if (process.env.SEED_PRODUCT_USERS === "true") return true;
  return isPreviewSandboxDeployment();
}

export function createDemoRepo(): MemoryRepo {
  const repo = new MemoryRepo();
  if (!previewSandboxEmptyPeople()) {
    const people: [string, string, string][] = [
      ["Juan Carlos", "Pérez López", "1710034065"],
      ["María José", "Andrade Vega", "0102030400"],
    ];
    for (const [first, last, ced] of people) {
      const id = repo.addPerson(first, last, ced);
      repo.addToken(id, sha256(randomToken()));
    }
    if (seedProductUsers()) {
      loadProductSeed(repo);
    } else {
      for (const persona of PRODUCT_PERSONAS) {
        const id = repo.addPerson(persona.currentFirstNames, persona.currentLastNames, persona.cedula, persona.status);
        const person = repo.people.get(id);
        if (person) {
          person.confirmation_code = persona.confirmationCode;
          person.review_reasons = [...persona.reviewReasons];
          if (persona.status === "COMPLETED" || persona.status === "NEEDS_REVIEW") person.submitted_at = new Date().toISOString();
        }
        repo.addToken(id, sha256(randomToken()));
      }
    }
  }
  const secret = seedProductUsers() ? PRODUCT_SEED_DEMO_TOTP_SECRET : generateTotpSecret();
  const admins: [string, string, "ADMIN" | "REVIEWER" | "EXPORTER"][] = [
    [PRODUCT_SEED_DEMO_ADMIN.email, "Administración (demo)", "ADMIN"],
    ["revisor@demo.local", "Revisión (demo)", "REVIEWER"],
    ["exportador@demo.local", "Exportación (demo)", "EXPORTER"],
  ];
  for (const [email, full_name, role] of admins) {
    seedDemoAdmin(repo, { email, full_name, role, password: PRODUCT_SEED_DEMO_ADMIN.password, totpSecret: secret });
  }
  ensurePreviewOutreachAnchor(repo);
  const seedNote = previewSandboxEmptyPeople()
    ? " Preview sandbox vacío: importe personas desde el panel."
    : seedProductUsers()
      ? " Seed KAN-106 con enlaces fijos para las pruebas."
      : "";
  console.warn(`\n[DEMO_MODE] Base en memoria para pruebas locales.${seedNote}\n`);
  return repo;
}
