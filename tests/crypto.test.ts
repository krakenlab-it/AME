import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, keyedHash, randomToken, sha256 } from "@/lib/encryption/crypto";
import { maskAccount, maskCedula } from "@/lib/security/masking";
import { verifyTotp, totpCode, generateTotpSecret } from "@/lib/security/totp";
import { hashPassword, verifyPassword } from "@/lib/security/password";

describe("cifrado y hashing", () => {
  it("cifra y descifra (AES-256-GCM) con IV distinto cada vez", () => {
    const a = encrypt("2200004821");
    const b = encrypt("2200004821");
    expect(a).not.toBe(b);
    expect(a).not.toContain("2200004821");
    expect(decrypt(a)).toBe("2200004821");
  });

  it("detecta manipulación del texto cifrado", () => {
    const parts = encrypt("secreto").split(".");
    parts[3] = Buffer.from("otro").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });

  it("descifra con la llave anterior durante una rotación", () => {
    const old = encrypt("dato");
    const previous = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY_PREVIOUS = previous;
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(decrypt(old)).toBe("dato");
    process.env.ENCRYPTION_KEY = previous;
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
  });

  it("hash con clave determinista y separado por propósito", () => {
    expect(keyedHash("1710034065", "national_id")).toBe(keyedHash("1710034065", "national_id"));
    expect(keyedHash("1710034065", "national_id")).not.toBe(keyedHash("1710034065", "ip"));
    expect(keyedHash("1710034065", "national_id")).not.toContain("1710034065");
  });

  it("tokens de 256 bits, sin datos personales", () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sha256(t)).toHaveLength(64);
  });

  it("enmascara cédula y cuenta", () => {
    expect(maskCedula("1710034065")).toBe("17******65");
    expect(maskCedula("BH823158")).toBe("BH****58");
    expect(maskAccount("4821")).toBe("••••••••4821");
  });

  it("TOTP acepta el código actual y rechaza otros", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    expect(verifyTotp(secret, totpCode(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now - 5 * 60_000), now)).toBe(false);
    expect(verifyTotp(secret, "abc", now)).toBe(false);
  });

  it("contraseñas con scrypt", async () => {
    const h = await hashPassword("Contraseña-segura-2026");
    expect(await verifyPassword("Contraseña-segura-2026", h)).toBe(true);
    expect(await verifyPassword("otra", h)).toBe(false);
  });
});
