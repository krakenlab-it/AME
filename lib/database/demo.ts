import "server-only";
import { randomToken, sha256 } from "@/lib/encryption/crypto";
import { seedDemoAdmin } from "@/lib/services/demo-admin-auth";
import { generateTotpSecret } from "@/lib/security/totp";
import { PRODUCT_PERSONAS } from "@/lib/seed/product-personas";
import { MemoryRepo } from "./memory-repo";

/**
 * Modo demostración: base en memoria con datos ficticios para probar el portal sin Supabase.
 * Solo se activa con DEMO_MODE=true y NUNCA en producción (ver lib/database/index.ts).
 * El panel de demostración no usa Supabase Auth: la contraseña y el TOTP quedan solo en memoria.
 */
export function createDemoRepo(): MemoryRepo {
  const repo = new MemoryRepo();
  const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const people: [string, string, string][] = [
    ["Juan Carlos", "Pérez López", "1710034065"],
    ["María José", "Andrade Vega", "0102030400"],
  ];
  const lines: string[] = [];
  for (const [first, last, ced] of people) {
    const id = repo.addPerson(first, last, ced);
    const token = randomToken();
    repo.addToken(id, sha256(token));
    lines.push(`  ${first} ${last} · cédula ${ced}\n    ${base}/verificar/${token}`);
  }
  for (const persona of PRODUCT_PERSONAS) {
    const id = repo.addPerson(persona.currentFirstNames, persona.currentLastNames, persona.cedula, persona.status);
    const person = repo.people.get(id);
    if (person) {
      person.confirmation_code = persona.confirmationCode;
      person.review_reasons = [...persona.reviewReasons];
      if (persona.status === "COMPLETED" || persona.status === "NEEDS_REVIEW") person.submitted_at = new Date().toISOString();
    }
    const token = randomToken();
    repo.addToken(id, sha256(token));
    lines.push(`  ${persona.currentFirstNames} ${persona.currentLastNames} · cédula ${persona.cedula} (${persona.status})\n    ${base}/verificar/${token}`);
  }
  const secret = generateTotpSecret();
  const admins: [string, string, "ADMIN" | "REVIEWER" | "EXPORTER"][] = [
    ["admin@demo.local", "Administración (demo)", "ADMIN"],
    ["revisor@demo.local", "Revisión (demo)", "REVIEWER"],
    ["exportador@demo.local", "Exportación (demo)", "EXPORTER"],
  ];
  for (const [email, full_name, role] of admins) {
    seedDemoAdmin(repo, { email, full_name, role, password: "Demo-portal-2026", totpSecret: secret });
  }
  console.warn(`\n[DEMO_MODE] Base en memoria con datos ficticios. Enlaces:\n${lines.join("\n")}\n  Admin: admin@demo.local / Demo-portal-2026 · TOTP secreto: ${secret}\n`);
  return repo;
}
