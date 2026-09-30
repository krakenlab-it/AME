import { keyedHash } from "@/lib/encryption/crypto";

/** IP del cliente detrás del proxy de Vercel. Solo se usa hasheada (nunca se guarda en claro). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "0.0.0.0";
}

export function ipHash(headers: Headers): string {
  return keyedHash(clientIp(headers), "ip");
}
