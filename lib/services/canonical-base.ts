/**
 * Base canónica de los correos del panel (invitación y restablecer contraseña).
 * El verificador PKCE vive en una cookie del host que pidió el enlace. Si el correo apunta al dominio
 * sin "www" y este redirige a "www", el código nunca se canjea. Un dominio de dos etiquetas
 * (ejemplo.site) pasa a www.ejemplo.site; localhost, IP y subdominios (previews) no cambian.
 */
export function canonicalAdminBase(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }
  const host = url.hostname;
  const labels = host.split(".");
  const isIp = /^\d+(\.\d+){3}$/.test(host) || host.includes(":");
  if (isIp || labels.length !== 2 || labels.some((label) => label.length === 0)) return trimmed;
  url.hostname = `www.${host}`;
  return url.toString().replace(/\/+$/, "");
}
