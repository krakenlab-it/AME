/**
 * Credenciales públicas de Supabase Auth para el panel.
 * La clave anon no abre las tablas de datos personales: RLS sigue en DENY ALL
 * y el servidor sigue usando service_role después de comprobar la sesión.
 */
export function supabasePublicConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !anonKey) return null;
  return { url, anonKey };
}
