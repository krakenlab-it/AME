/**
 * Invita a un administrador por Supabase Auth y lo vincula en admin_users.
 * Uso:
 *   npm run admin:create -- --email persona@dominio.com --name "Nombre Apellido" --role ADMIN
 * Roles: ADMIN | REVIEWER | EXPORTER.
 * No pide contraseña: la persona la elige al abrir el correo de invitación
 * y configura TOTP en el primer ingreso.
 * Si el correo ya está en admin_users sin auth_user_id, vincula esa fila
 * (sirve para migrar los administradores que existían antes de Supabase Auth).
 */
import { createClient } from "@supabase/supabase-js";
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
  const existing = await db.from("admin_users").select("id, auth_user_id").eq("email", email).maybeSingle();
  if (existing.error) {
    console.error(`No se pudo leer admin_users: ${existing.error.message}`);
    process.exit(1);
  }
  if (existing.data?.auth_user_id) {
    console.error(`Ese correo ya está vinculado a Supabase Auth. Para una clave nueva usa /admin/recuperar.`);
    process.exit(1);
  }

  const redirectTo = `${baseUrl()}/admin/auth/confirm?next=${encodeURIComponent("/admin/registro")}`;
  const invited = await db.auth.admin.inviteUserByEmail(email, { redirectTo, data: { full_name: name } });
  let authUserId = invited.data.user?.id ?? null;
  let actionLink: string | null = null;

  if (invited.error || !authUserId) {
    const recovery = await db.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${baseUrl()}/admin/auth/confirm?next=${encodeURIComponent("/admin/restablecer")}` },
    });
    if (recovery.error || !recovery.data.user) {
      console.error(`No se pudo invitar: ${invited.error?.message ?? recovery.error?.message ?? "sin usuario"}`);
      process.exit(1);
    }
    authUserId = recovery.data.user.id;
    actionLink = recovery.data.properties?.action_link ?? null;
  }

  const row = { email, full_name: name, role, auth_user_id: authUserId, active: true };
  const saved = existing.data
    ? await db.from("admin_users").update(row).eq("id", existing.data.id)
    : await db.from("admin_users").insert(row);
  if (saved.error) {
    console.error(`Auth quedó creado (${authUserId}) pero no se pudo guardar admin_users: ${saved.error.message}`);
    process.exit(1);
  }

  console.log(`Usuario ${email} vinculado con rol ${role}.`);
  console.log("Supabase envía el correo de invitación. Al abrirlo elige contraseña y configura el TOTP del teléfono en /admin/mfa.");
  if (actionLink) {
    console.log("Ese correo ya existía en Auth. Enlace de un solo uso para elegir contraseña (no lo reenvíes en masa):");
    console.log(actionLink);
  }
}

main();
