import "server-only";
import { randomToken, sha256, encrypt } from "@/lib/encryption/crypto";
import { hashPasswordSync } from "@/lib/security/password";
import { generateTotpSecret } from "@/lib/security/totp";
import { MemoryRepo } from "./memory-repo";

/**
 * Modo demostración: base en memoria con datos ficticios para probar el portal sin Supabase.
 * Solo se activa con DEMO_MODE=true y NUNCA en producción (ver lib/database/index.ts).
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
  const secret = generateTotpSecret();
  const admin = repo.createAdminSync({ email: "admin@demo.local", full_name: "Administración (demo)", role: "ADMIN", password_hash: hashPasswordSync("Demo-portal-2026") });
  Object.assign(admin, { mfa_secret_encrypted: encrypt(secret), mfa_enabled: true });
  console.warn(`\n[DEMO_MODE] Base en memoria con datos ficticios. Enlaces:\n${lines.join("\n")}\n  Admin: admin@demo.local / Demo-portal-2026 · TOTP secreto: ${secret}\n`);
  return repo;
}
