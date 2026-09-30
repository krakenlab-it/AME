/**
 * Crea un usuario administrativo. Uso:
 *   npm run admin:create -- --email persona@dominio.com --name "Nombre Apellido" --role ADMIN
 * Roles: ADMIN | REVIEWER | EXPORTER. La contraseña se pide por consola (no queda en el historial).
 * En el primer ingreso, el sistema obliga a configurar la verificación en dos pasos (TOTP).
 */
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { hashPassword, passwordPolicyError } from "../lib/security/password";
import { ADMIN_ROLES, type AdminRole } from "../lib/security/rbac";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function askHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  let muted = false;
  out._writeToOutput = (s: string) => { if (!muted) out.output.write(s); };
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
    muted = true;
  });
}

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    try { process.loadEnvFile(f); } catch { /* archivo opcional */ }
  }
}

async function main() {
  loadEnv();
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  const role = (arg("role") ?? "ADMIN").toUpperCase() as AdminRole;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
    console.error('Uso: npm run admin:create -- --email correo@dominio.com --name "Nombre" --role ADMIN|REVIEWER|EXPORTER');
    process.exit(1);
  }
  if (!ADMIN_ROLES.includes(role)) {
    console.error(`Rol inválido. Usa: ${ADMIN_ROLES.join(", ")}`);
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (por ejemplo con: node --env-file=.env ...).");
    process.exit(1);
  }
  const password = process.env.ADMIN_PASSWORD ?? (await askHidden("Contraseña (mínimo 12 caracteres, letras y números): "));
  const policy = passwordPolicyError(password);
  if (policy) {
    console.error(policy);
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await db.from("admin_users").insert({ email, full_name: name, role, password_hash: await hashPassword(password) });
  if (error) {
    console.error(`No se pudo crear el usuario: ${error.message}`);
    process.exit(1);
  }
  console.log(`Usuario ${email} creado con rol ${role}. Al ingresar en /admin se le pedirá configurar MFA.`);
}

main();
