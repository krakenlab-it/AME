import { describe, expect, it, vi } from "vitest";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { demoEmailOtpProvider, type EmailOtpProvider } from "@/lib/services/email-otp";
import { confirmGeneralEmailCode, startGeneralEmailAccess, type GeneralEmailDeps } from "@/lib/services/general-email";
import { generalEmailCodeSchema, generalTotpSchema, normalizeOtpInput } from "@/lib/validation/schemas";

const JUAN = "1710034065";
const EMAIL = "juan.perez@example.com";

function deps(otp: EmailOtpProvider, ip = "ip-1"): GeneralEmailDeps {
  return { ipHash: `hash-${ip}`, captchaEnabled: false, verifyCaptcha: async () => true, otp };
}

/** Supabase envía el largo configurado en auth.email.otp_length (6 a 10). */
async function signInWith(expected: string, typed: string) {
  const repo = new MemoryRepo();
  repo.addPerson("Juan Carlos", "Pérez López", JUAN);
  const demo = demoEmailOtpProvider(expected);
  const otp = { send: vi.fn(demo.send), verify: vi.fn(demo.verify) };
  const started = await startGeneralEmailAccess(repo, { email: EMAIL, termsAccepted: true }, deps(otp));
  if (!started.ok) throw new Error("start failed");
  const confirmed = await confirmGeneralEmailCode(repo, started.challengeToken, { code: typed }, deps(otp, "ip-2"));
  return { confirmed, otp };
}

describe("largo del código por correo", () => {
  it("acepta un código de 6 dígitos", async () => {
    const { confirmed, otp } = await signInWith("123456", "123456");
    expect(confirmed.ok).toBe(true);
    expect(otp.verify).toHaveBeenCalledWith(EMAIL, "123456");
  });

  it("acepta un código de 8 dígitos (Supabase con otp_length = 8)", async () => {
    const { confirmed, otp } = await signInWith("04745378", "04745378");
    expect(confirmed.ok).toBe(true);
    expect(otp.verify).toHaveBeenCalledWith(EMAIL, "04745378");
  });

  it("quita espacios y guiones del código pegado antes de verificarlo", async () => {
    const { confirmed, otp } = await signInWith("04745378", " 0474 5378 ");
    expect(confirmed.ok).toBe(true);
    expect(otp.verify).toHaveBeenCalledWith(EMAIL, "04745378");
    const dashed = await signInWith("04745378", "0474-5378");
    expect(dashed.confirmed.ok).toBe(true);
    expect(dashed.otp.verify).toHaveBeenCalledWith(EMAIL, "04745378");
  });

  it("no corta un código de 8 dígitos a 6", async () => {
    const { confirmed, otp } = await signInWith("04745378", "047453");
    expect(confirmed.ok).toBe(false);
    expect(otp.verify).toHaveBeenCalledWith(EMAIL, "047453");
  });

  it("el esquema admite 6 a 10 dígitos y rechaza el resto", () => {
    for (const code of ["123456", "1234567", "12345678", "1234567890", "12 34 56 78", "1234\t5678", "1234\u00a05678"]) {
      expect(generalEmailCodeSchema.safeParse({ code }).success, code).toBe(true);
    }
    for (const code of ["", "12345", "12345678901", "12ab5678", "1234567a", "abcdef"]) {
      expect(generalEmailCodeSchema.safeParse({ code }).success, code).toBe(false);
    }
    expect(normalizeOtpInput(" 12-34 56–78 ")).toBe("12345678");
  });

  it("el código de la aplicación autenticadora sigue siendo de 6 dígitos", () => {
    expect(generalTotpSchema.safeParse({ code: "123456" }).success).toBe(true);
    expect(generalTotpSchema.safeParse({ code: "12345678" }).success).toBe(false);
  });
});
