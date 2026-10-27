import { execFileSync } from "node:child_process";

export interface LocalStack {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  mailUrl: string;
}

/** Claves del Supabase local (supabase start). Nunca son claves de producción. */
export function readLocalStack(): LocalStack {
  let raw: string;
  try {
    raw = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    throw new Error("No hay Supabase local. Ejecuta `supabase start` (Docker) y vuelve a intentar.");
  }
  const env = new Map<string, string>();
  for (const line of raw.split("\n")) {
    const match = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (match) env.set(match[1]!, match[2]!);
  }
  const apiUrl = env.get("API_URL");
  const anonKey = env.get("ANON_KEY");
  const serviceRoleKey = env.get("SERVICE_ROLE_KEY");
  const mailUrl = env.get("MAILPIT_URL") ?? env.get("INBUCKET_URL");
  if (!apiUrl || !anonKey || !serviceRoleKey || !mailUrl) throw new Error("`supabase status` no devolvió las claves locales.");
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(apiUrl)) throw new Error("Estas pruebas solo corren contra un Supabase local.");
  return { apiUrl, anonKey, serviceRoleKey, mailUrl };
}
