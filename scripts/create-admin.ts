/**
 * Invita a un administrador por Supabase Auth y lo vincula en admin_users.
 * Uso:
 *   npm run admin:create -- --email persona@dominio.com --name "Nombre Apellido" --role ADMIN
 * Roles: ADMIN | REVIEWER | EXPORTER.
 * No pide contraseña: la persona la elige al abrir el correo de invitación
 * y configura TOTP en el primer ingreso.
 * Si el correo ya está en admin_users sin auth_user_id, vincula esa fila
 * (sirve para migrar los administradores que existían antes de Supabase Auth).
 * El mismo flujo está en el panel: /admin/invitar (solo rol ADMIN).
 */
import { createClient } from "@supabase/supabase-js";
import { staffAuthFromSupabase } from "../lib/services/staff-auth-admin";
import { inviteStaffMember } from "../lib/services/staff-invite";
import { ADMIN_ROLES, type AdminRole } from "../lib/security/rbac";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    try { process.loadEnvFile(f); } catch { /* archivo opcional */ }
  }
}

function baseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
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
    console.error("Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await inviteStaffMember(
    {
      findByEmail: async (normalized) => {
        const existing = await db.from("admin_users").select("id, auth_user_id").eq("email", normalized).maybeSingle();
        if (existing.error) {
          console.error(`No se pudo leer admin_users: ${existing.error.message}`);
          throw new Error("lookup");
        }
        return existing.data ? { id: existing.data.id, auth_user_id: existing.data.auth_user_id } : null;
      },
      link: async (row) => {
        const payload = { email: row.email, full_name: row.full_name, role: row.role, auth_user_id: row.auth_user_id, active: true };
        const saved = row.existingId
          ? await db.from("admin_users").update(payload).eq("id", row.existingId)
          : await db.from("admin_users").insert(payload);
        if (saved.error) {
          console.error(`Auth quedó creado (${row.auth_user_id}) pero no se pudo guardar admin_users: ${saved.error.message}`);
          throw new Error("save");
        }
      },
    },
    staffAuthFromSupabase(db),
    "ADMIN",
    { email, fullName: name, role },
    baseUrl(),
  );

  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }

  console.log(`Usuario ${result.email} vinculado con rol ${result.role}.`);
  if (result.emailed) {
    console.log("Supabase envía el correo de invitación. Al abrirlo elige contraseña y configura el TOTP del teléfono en /admin/mfa.");
  }
  if (result.confirmUrl) {
    console.log("Ese correo ya existía en Auth. Enlace de un solo uso para elegir contraseña (no lo reenvíes en masa):");
    console.log(result.confirmUrl);
  }
}

main();
