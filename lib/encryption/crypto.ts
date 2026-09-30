import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Cifrado a nivel de aplicación (AES-256-GCM) para campos de riesgo elevado:
 * cédula, número de cuenta, cédula del titular y secretos MFA.
 *
 * Formato almacenado:  v1.<iv>.<authTag>.<ciphertext>  (base64url)
 * Para rotar la llave: mover la actual a ENCRYPTION_KEY_PREVIOUS y poner una nueva en ENCRYPTION_KEY.
 */

const ALGO = "aes-256-gcm";
const CURRENT_VERSION = "v1";

function decodeKey(raw: string | undefined, name: string): Buffer {
  if (!raw) throw new Error(`${name} no está configurada`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error(`${name} debe ser de 32 bytes codificados en base64`);
  return key;
}

function currentKey(): Buffer {
  return decodeKey(process.env.ENCRYPTION_KEY, "ENCRYPTION_KEY");
}

function keysForDecrypt(): Buffer[] {
  const keys = [currentKey()];
  if (process.env.ENCRYPTION_KEY_PREVIOUS) {
    keys.push(decodeKey(process.env.ENCRYPTION_KEY_PREVIOUS, "ENCRYPTION_KEY_PREVIOUS"));
  }
  return keys;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, currentKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [CURRENT_VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [version, ivB64, tagB64, ctB64] = payload.split(".");
  if (version !== CURRENT_VERSION || !ivB64 || !tagB64 || ctB64 === undefined) {
    throw new Error("Formato de dato cifrado no reconocido");
  }
  let lastError: unknown;
  for (const key of keysForDecrypt()) {
    try {
      const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64url"));
      decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No se pudo descifrar");
}

/** Hash con clave (HMAC-SHA256 + pepper) para búsquedas exactas sin guardar el valor en claro. */
export function keyedHash(value: string, purpose: "national_id" | "ip" | "bucket"): string {
  const pepper = process.env.HASH_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("HASH_PEPPER no está configurado (mínimo 32 caracteres)");
  return createHmac("sha256", pepper).update(`${purpose}:${value}`).digest("hex");
}

/** Hash para tokens aleatorios de alta entropía (256 bits): SHA-256 es suficiente. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Token criptográficamente aleatorio (256 bits por defecto) en base64url. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
