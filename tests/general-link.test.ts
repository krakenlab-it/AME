import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { decrypt, keyedHash } from "@/lib/encryption/crypto";
import { totpCode } from "@/lib/security/totp";
import { can } from "@/lib/security/rbac";
import { confirmGeneralTotp, resetPersonGeneralAuth, startGeneralAccess, totpAccountLabel, type GeneralDeps } from "@/lib/services/general-link";
import { importFingerprintCodes } from "@/lib/services/fingerprint-import";
import { identify, submitResponse } from "@/lib/services/respondent";
import { sha256 } from "@/lib/encryption/crypto";
import { GENERIC_GENERAL_ERROR, PASSPORT_GENERAL_MESSAGE } from "@/lib/validation/constants";
import { normalizeFingerprintCode } from "@/lib/validation/fingerprint";
import { generalIdentifySchema } from "@/lib/validation/schemas";
import { validSubmission } from "./helpers/fixtures";
import { makeCedula } from "./helpers/cedula";

const JUAN = "1710034065";
const CODE = "V1234V1234";
const OTHER = "A9876B4321";

function deps(ip = "ip-1"): GeneralDeps {
  return { ipHash: `hash-${ip}`, captchaEnabled: false, verifyCaptcha: async () => true };
}

function quiet() {
  return {
    log: vi.spyOn(console, "log").mockImplementation(() => {}),
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
}

function dumped(repo: MemoryRepo, extra = ""): string {
  return JSON.stringify({ audit: repo.auditLog, security: repo.securityEvents, auth: [...repo.generalAuth.values()] }) + extra;
}

describe("código dactilar", () => {
  it("normaliza espacios, guiones y mayúsculas", () => {
    expect(normalizeFingerprintCode(" v1234-v1234 ")).toBe(CODE);
    expect(normalizeFingerprintCode("v 1234 v 1234")).toBe(CODE);
    expect(generalIdentifySchema.safeParse({ cedula: JUAN, codigoDactilar: "v1234-v1234" }).success).toBe(true);
    expect(generalIdentifySchema.safeParse({ cedula: JUAN, codigoDactilar: "" }).success).toBe(true);
    expect(generalIdentifySchema.safeParse({ cedula: JUAN }).success).toBe(true);
    expect(generalIdentifySchema.safeParse({ cedula: JUAN, codigoDactilar: "V123V1234" }).success).toBe(false);
  });

  it("no usa el enlace general para un pasaporte", () => {
    const parsed = generalIdentifySchema.safeParse({ cedula: "BH823158", codigoDactilar: CODE });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((issue) => issue.message === PASSPORT_GENERAL_MESSAGE)).toBe(true);
  });
});

describe("ingreso general", () => {
  it("acepta el primer código, exige TOTP y deja el enlace personal intacto", async () => {
    const logs = quiet();
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Juan Carlos", "Pérez López", JUAN);
    const token = "personal-token-juan-123456789012345678901234";
    repo.addToken(personId, sha256(token));

    const first = await startGeneralAccess(repo, { cedula: JUAN, codigoDactilar: "v 1234-v1234" }, deps());
    expect(first).toMatchObject({ ok: true, phase: "enroll" });
    if (!first.ok || first.phase !== "enroll") return;
    const secret = decrypt(repo.generalAuth.get(personId)!.totp_secret_encrypted!);
    expect(repo.generalAuth.get(personId)!.totp_enabled_at).toBeNull();
    expect(first.qrDataUrl.startsWith("data:image/")).toBe(true);
    expect(first.qrDataUrl).not.toContain(CODE);
    expect(first.qrDataUrl).not.toContain(JUAN);
    expect(first.otpauthUrl.startsWith("otpauth://totp/")).toBe(true);
    expect(first.otpauthUrl).toContain("AME%20Portal");
    expect(first.otpauthUrl).not.toContain(JUAN);
    expect(first.manualKey.replace(/\s/g, "")).toBe(secret);
    const label = totpAccountLabel({ first_names: "Juan Carlos", last_names: "Pérez López", national_id_last2: "65" });
    expect(label).not.toContain(JUAN);
    expect(label).toContain("65");

    const confirmed = await confirmGeneralTotp(repo, first.challengeToken, { code: totpCode(secret) }, deps("ip-2"));
    expect(confirmed).toMatchObject({ ok: true, destination: "form" });
    if (!confirmed.ok) return;
    expect(repo.generalAuth.get(personId)!.totp_enabled_at).toBeTruthy();
    expect(repo.auditLog.some((event) => event.action === "FINGERPRINT_CLAIMED")).toBe(true);
    expect(repo.auditLog.some((event) => event.action === "TOTP_ENROLLED")).toBe(true);

    const session = [...repo.sessions.values()].find((item) => item.person_id === personId && item.entry_method === "general");
    expect(session?.access_token_id).toBeNull();
    const submitted = await submitResponse(repo, confirmed.sessionToken, validSubmission(), {
      activeNoticeVersion: "1.0",
      consentTexts: { PRIVACY_NOTICE: "a", DATA_SHARING_AIG: "b", ACCURACY_DECLARATION: "c", BANK_ACCOUNT_AUTHORIZATION: "d" },
      retentionMonths: 12,
      portalBlocked: false,
    });
    expect(submitted.ok).toBe(true);
    expect([...repo.tokens.values()][0]?.used_at).toBeNull();

    const personal = await identify(repo, { token, cedula: JUAN }, { ipHash: "otro", captchaEnabled: false, verifyCaptcha: async () => true });
    expect(personal.ok).toBe(true);
    expect([...repo.sessions.values()].some((item) => item.entry_method === "token")).toBe(true);

    const text = dumped(repo);
    expect(text).not.toContain(CODE);
    expect(text).not.toContain(secret);
    expect(text).not.toContain(JUAN);
    for (const spy of Object.values(logs)) {
      const printed = spy.mock.calls.flat().join(" ");
      expect(printed).not.toContain(CODE);
      expect(printed).not.toContain(secret);
      spy.mockRestore();
    }
  });

  it("usa el mismo error genérico si la cédula no existe, el código no coincide o la persona está bloqueada", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Ana", "Gómez", JUAN);
    repo.generalAuth.set(personId, {
      fingerprint_code_hash: keyedHash(CODE, "fingerprint_code"),
      fingerprint_claimed_at: null,
      totp_secret_encrypted: null,
      totp_enabled_at: null,
      failed_attempts: 0,
      locked_until: null,
      challenge_hash: null,
      challenge_expires_at: null,
      challenge_purpose: null,
    });

    const unknown = await startGeneralAccess(repo, { cedula: makeCedula("171003407"), codigoDactilar: CODE }, deps("u"));
    const mismatch = await startGeneralAccess(repo, { cedula: JUAN, codigoDactilar: OTHER }, deps("m"));
    expect(unknown).toMatchObject({ ok: false, error: GENERIC_GENERAL_ERROR });
    expect(mismatch).toMatchObject({ ok: false, error: GENERIC_GENERAL_ERROR });
    expect(unknown).toEqual(mismatch);

    for (let i = 0; i < 4; i++) await startGeneralAccess(repo, { cedula: JUAN, codigoDactilar: OTHER }, deps(`lock-${i}`));
    const locked = await startGeneralAccess(repo, { cedula: JUAN, codigoDactilar: CODE }, deps("lock-ok"));
    expect(locked).toMatchObject({ ok: false, error: GENERIC_GENERAL_ERROR });
    expect(repo.generalAuth.get(personId)!.locked_until).toBeTruthy();
    expect(repo.auditLog.filter((event) => event.action === "GENERAL_IDENTIFY_FAILED").length).toBeGreaterThanOrEqual(5);
  });

  it("limita por IP y por cédula", async () => {
    const repo = new MemoryRepo();
    repo.addPerson("Ana", "Gómez", JUAN);
    for (let i = 0; i < 10; i++) {
      expect((await startGeneralAccess(repo, { cedula: makeCedula(`09000000${i}`), codigoDactilar: CODE }, deps("same-ip"))).ok).toBe(false);
    }
    const blockedIp = await startGeneralAccess(repo, { cedula: JUAN, codigoDactilar: CODE }, deps("same-ip"));
    expect(blockedIp).toMatchObject({ ok: false, error: "Hiciste demasiados intentos. Espera 15 minutos y vuelve a intentarlo." });

    const other = new MemoryRepo();
    const ana = other.addPerson("Ana", "Gómez", JUAN);
    other.generalAuth.set(ana, {
      fingerprint_code_hash: keyedHash(CODE, "fingerprint_code"),
      fingerprint_claimed_at: null,
      totp_secret_encrypted: null,
      totp_enabled_at: null,
      failed_attempts: 0,
      locked_until: null,
      challenge_hash: null,
      challenge_expires_at: null,
      challenge_purpose: null,
    });
    for (let i = 0; i < 8; i++) {
      expect((await startGeneralAccess(other, { cedula: JUAN, codigoDactilar: OTHER }, deps(`cedula-${i}`))).ok).toBe(false);
    }
    const blockedCedula = await startGeneralAccess(other, { cedula: JUAN, codigoDactilar: CODE }, deps("cedula-fresh"));
    expect(blockedCedula).toMatchObject({ ok: false, error: "Hiciste demasiados intentos. Espera 15 minutos y vuelve a intentarlo." });
  });

  it("pide el TOTP en la siguiente visita y lo cuenta para el bloqueo", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Ana", "Gómez", JUAN);
    const started = await startGeneralAccess(repo, { cedula: JUAN, codigoDactilar: CODE }, deps("e1"));
    expect(started).toMatchObject({ ok: true, phase: "enroll" });
    if (!started.ok || started.phase !== "enroll") return;
    const secret = decrypt(repo.generalAuth.get(personId)!.totp_secret_encrypted!);
    expect((await confirmGeneralTotp(repo, started.challengeToken, { code: totpCode(secret) }, deps("e2"))).ok).toBe(true);

    const again = await startGeneralAccess(repo, { cedula: JUAN, codigoDactilar: CODE }, deps("e3"));
    expect(again).toMatchObject({ ok: true, phase: "totp" });
    if (!again.ok || again.phase !== "totp") return;
    const wrong = await confirmGeneralTotp(repo, again.challengeToken, { code: "000000" }, deps("e4"));
    expect(wrong).toMatchObject({ ok: false, error: "El código de verificación no es correcto. Inténtalo otra vez." });

    for (let i = 0; i < 3; i++) await confirmGeneralTotp(repo, again.challengeToken, { code: "111111" }, deps(`e5-${i}`));
    const fifth = await confirmGeneralTotp(repo, again.challengeToken, { code: "222222" }, deps("e6"));
    expect(fifth).toMatchObject({ ok: false, error: GENERIC_GENERAL_ERROR });
    expect(repo.generalAuth.get(personId)!.locked_until).toBeTruthy();
  });

  it("el administrador puede borrar el código y el TOTP para un nuevo registro", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Ana", "Gómez", JUAN);
    const adminId = repo.createAdminSync({ email: "admin@demo.local", full_name: "Ada", role: "ADMIN", auth_user_id: null }).id;
    const started = await startGeneralAccess(repo, { cedula: JUAN, codigoDactilar: CODE }, deps("r1"));
    if (!started.ok || started.phase !== "enroll") throw new Error("esperaba enrolamiento");
    const secret = decrypt(repo.generalAuth.get(personId)!.totp_secret_encrypted!);
    const confirmed = await confirmGeneralTotp(repo, started.challengeToken, { code: totpCode(secret) }, deps("r2"));
    expect(confirmed.ok).toBe(true);

    expect(can("REVIEWER", "people:reset-factors")).toBe(false);
    expect(can("ADMIN", "people:reset-factors")).toBe(true);
    expect(await resetPersonGeneralAuth(repo, personId, adminId)).toBe(true);
    expect(repo.generalAuth.get(personId)!.fingerprint_code_hash).toBeNull();
    expect(repo.generalAuth.get(personId)!.totp_secret_encrypted).toBeNull();
    expect(repo.auditLog.some((event) => event.action === "FINGERPRINT_RESET" && event.actor_id === adminId)).toBe(true);
    expect(repo.auditLog.some((event) => event.action === "TOTP_RESET")).toBe(true);
    if (confirmed.ok) {
      expect((await submitResponse(repo, confirmed.sessionToken, validSubmission(), {
        activeNoticeVersion: "1.0",
        consentTexts: { PRIVACY_NOTICE: "a", DATA_SHARING_AIG: "b", ACCURACY_DECLARATION: "c", BANK_ACCOUNT_AUTHORIZATION: "d" },
        retentionMonths: 12,
        portalBlocked: false,
      })).ok).toBe(false);
    }

    const fresh = await startGeneralAccess(repo, { cedula: JUAN, codigoDactilar: OTHER }, deps("r3"));
    expect(fresh).toMatchObject({ ok: true, phase: "enroll" });
    expect(repo.auditLog.filter((event) => event.action === "FINGERPRINT_CLAIMED")).toHaveLength(2);
  });

  it("deja pasar la cédula sola y guarda el código solo si lo escriben", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Ana", "Gómez", JUAN);
    const blank = await startGeneralAccess(repo, { cedula: JUAN, codigoDactilar: "" }, deps("opt-1"));
    expect(blank).toMatchObject({ ok: true, phase: "enroll" });
    expect(repo.generalAuth.get(personId)?.fingerprint_code_hash ?? null).toBeNull();
    expect(repo.auditLog.some((event) => event.action === "FINGERPRINT_CLAIMED")).toBe(false);

    const withCode = new MemoryRepo();
    const claimedId = withCode.addPerson("Ana", "Gómez", JUAN);
    const claimed = await startGeneralAccess(withCode, { cedula: JUAN, codigoDactilar: "v1234-v1234" }, deps("opt-2"));
    expect(claimed).toMatchObject({ ok: true, phase: "enroll" });
    expect(withCode.generalAuth.get(claimedId)!.fingerprint_code_hash).toBe(keyedHash(CODE, "fingerprint_code"));
    expect(JSON.stringify([...withCode.generalAuth.values()])).not.toContain(CODE);

    const preloaded = new MemoryRepo();
    const loadedId = preloaded.addPerson("Ana", "Gómez", JUAN);
    preloaded.generalAuth.set(loadedId, {
      fingerprint_code_hash: keyedHash(CODE, "fingerprint_code"),
      fingerprint_claimed_at: null,
      totp_secret_encrypted: null,
      totp_enabled_at: null,
      failed_attempts: 0,
      locked_until: null,
      challenge_hash: null,
      challenge_expires_at: null,
      challenge_purpose: null,
    });
    const missing = await startGeneralAccess(preloaded, { cedula: JUAN }, deps("opt-3"));
    const wrong = await startGeneralAccess(preloaded, { cedula: JUAN, codigoDactilar: OTHER }, deps("opt-4"));
    const right = await startGeneralAccess(preloaded, { cedula: JUAN, codigoDactilar: CODE }, deps("opt-5"));
    expect(missing).toMatchObject({ ok: false, error: GENERIC_GENERAL_ERROR });
    expect(wrong).toMatchObject({ ok: false, error: GENERIC_GENERAL_ERROR });
    expect(right).toMatchObject({ ok: true, phase: "enroll" });
  });

  it("exige el código dactilar cuando AME_REQUIRE_FINGERPRINT_CODE está activo", async () => {
    process.env.AME_REQUIRE_FINGERPRINT_CODE = "true";
    try {
      const repo = new MemoryRepo();
      repo.addPerson("Ana", "Gómez", JUAN);
      const blocked = await startGeneralAccess(repo, { cedula: JUAN, codigoDactilar: "  " }, deps("flag"));
      expect(blocked).toMatchObject({ ok: false, fieldErrors: { codigoDactilar: expect.any(String) } });
      expect(repo.auditLog).toHaveLength(0);
      const allowed = await startGeneralAccess(repo, { cedula: JUAN, codigoDactilar: CODE }, deps("flag-2"));
      expect(allowed).toMatchObject({ ok: true, phase: "enroll" });
    } finally {
      delete process.env.AME_REQUIRE_FINGERPRINT_CODE;
    }
  });

  it("abre la cuenta en lectura si la persona ya envió sus datos", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Ana", "Gómez", JUAN, "COMPLETED");
    repo.people.get(personId)!.submitted_at = new Date().toISOString();
    const started = await startGeneralAccess(repo, { cedula: JUAN, codigoDactilar: CODE }, deps("h1"));
    if (!started.ok || started.phase !== "enroll") throw new Error("esperaba enrolamiento");
    const secret = decrypt(repo.generalAuth.get(personId)!.totp_secret_encrypted!);
    const confirmed = await confirmGeneralTotp(repo, started.challengeToken, { code: totpCode(secret) }, deps("h2"));
    expect(confirmed).toMatchObject({ ok: true, destination: "home" });
  });
});

describe("importación de códigos", () => {
  it("empareja por cédula, no guarda el código en claro y no pisa uno distinto", async () => {
    const repo = new MemoryRepo();
    const juan = repo.addPerson("Juan", "Pérez", JUAN);
    const maria = repo.addPerson("María", "Andrade", "0900000027");
    repo.generalAuth.set(maria, {
      fingerprint_code_hash: keyedHash(OTHER, "fingerprint_code"),
      fingerprint_claimed_at: null,
      totp_secret_encrypted: null,
      totp_enabled_at: null,
      failed_attempts: 0,
      locked_until: null,
      challenge_hash: null,
      challenge_expires_at: null,
      challenge_purpose: null,
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("codigos");
    ws.addRow(["cedula", "codigo_dactilar"]);
    ws.addRow([JUAN, "v1234-v1234"]);
    ws.addRow(["0900000027", CODE]);
    ws.addRow(["0000000000", CODE]);
    ws.addRow([JUAN, OTHER]);
    ws.addRow(["no-es-cedula", "XXXX"]);
    const bytes = await wb.xlsx.writeBuffer();
    const report = await importFingerprintCodes(repo, bytes, "codigos.xlsx", "admin-1");
    expect(report).toMatchObject({ total: 5, updated: 1, conflicts: 1, duplicates: 1, invalid: 2, notFound: 0 });
    expect(repo.generalAuth.get(juan)!.fingerprint_code_hash).toBe(keyedHash(CODE, "fingerprint_code"));
    expect(repo.generalAuth.get(maria)!.fingerprint_code_hash).toBe(keyedHash(OTHER, "fingerprint_code"));
    const stored = JSON.stringify([...repo.generalAuth.values()]);
    expect(stored).not.toContain(CODE);
    expect(stored).not.toContain(OTHER);
    expect(repo.auditLog.some((event) => event.action === "FINGERPRINT_IMPORTED" && event.metadata?.updated === 1)).toBe(true);

    const same = await importFingerprintCodes(repo, bytes, "codigos.xlsx", "admin-1");
    expect(same.unchanged).toBe(1);
  });
});

describe("migración del enlace general", () => {
  const sql = readFileSync("supabase/migrations/20261008160000_general_onboarding_link.sql", "utf8");

  it("agrega el hash, el TOTP cifrado, el bloqueo y la sesión sin token", () => {
    expect(sql).toMatch(/fingerprint_code_hash/);
    expect(sql).toMatch(/totp_secret_encrypted/);
    expect(sql).toMatch(/general_locked_until/);
    expect(sql).toMatch(/entry_method/);
    expect(sql).toMatch(/access_token_id drop not null/);
    expect(sql).toMatch(/FINGERPRINT_CLAIMED/);
    expect(sql).toMatch(/GENERAL_IDENTIFY_FAILED/);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toMatch(/revoke all on function register_general_failure\(uuid, int, int\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function register_general_failure\(uuid, int, int\) to service_role/);
    expect(sql).toMatch(/fingerprint_code_hash = null/);
    expect(sql).toMatch(/entry_method = 'general'/);
  });
});
