import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { documentStepCopy } from "@/components/forms/document-step-copy";
import { HowItWorks } from "@/components/portal/how-it-works";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { demoEmailOtpProvider, DEMO_EMAIL_OTP_CODE, type EmailOtpProvider } from "@/lib/services/email-otp";
import {
  confirmGeneralCedula,
  confirmGeneralEmailCode,
  startGeneralEmailAccess,
  WRONG_CEDULA_ERROR,
  WRONG_FINGERPRINT_ERROR,
  type GeneralEmailDeps,
} from "@/lib/services/general-email";
import { settings } from "@/lib/services/settings";
import { PASSPORT_GENERAL_MESSAGE } from "@/lib/validation/constants";
import { generalCedulaOnlyStepSchema, generalCedulaStepSchema, generalIdentifySchema } from "@/lib/validation/schemas";

const PASSPORT = "BH823158";
const CEDULA = "1710034065";
const OTHER_CEDULA = "1710034008";
const CODE = "V1234V1234";

afterEach(() => {
  vi.unstubAllEnvs();
});

function fakeOtp(): EmailOtpProvider {
  const demo = demoEmailOtpProvider();
  return {
    send: vi.fn(demo.send),
    verify: vi.fn(async (email: string, code: string) => {
      const result = await demo.verify(email, code);
      return result.ok ? { ...result, authUserId: `auth-${email}` } : result;
    }),
  };
}

function deps(otp: EmailOtpProvider, ip: string): GeneralEmailDeps {
  return { ipHash: `hash-${ip}`, captchaEnabled: false, verifyCaptcha: async () => true, otp };
}

let counter = 0;
async function attemptOnce(repo: MemoryRepo, input: { email: string; cedula: string; codigoDactilar?: string }) {
  counter += 1;
  const ip = `kill-switch-ip-${counter}`;
  const otp = fakeOtp();
  const started = await startGeneralEmailAccess(repo, { email: input.email, termsAccepted: true }, deps(otp, ip));
  if (!started.ok) throw new Error(started.error);
  const coded = await confirmGeneralEmailCode(repo, started.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, ip));
  if (!coded.ok) throw new Error(coded.error);
  return confirmGeneralCedula(repo, started.challengeToken, { cedula: input.cedula, codigoDactilar: input.codigoDactilar ?? CODE }, deps(otp, ip));
}

/** Resultado sin lo que cambia en cada corrida (token de sesión y vencimiento). */
function stable(result: Awaited<ReturnType<typeof attemptOnce>>) {
  return result.ok ? { ok: true, destination: result.destination } : { ok: false, error: result.error, fieldErrors: result.fieldErrors };
}

function auditActions(repo: MemoryRepo) {
  return repo.auditLog.map((entry) => entry.action);
}

describe("AME_PASSPORT_SIGNIN: lectura del interruptor", () => {
  it.each([
    [undefined, true],
    ["", true],
    ["on", true],
    ["ON", true],
    ["true", true],
    ["1", true],
    ["false", true],
    ["0", true],
    ["disabled", true],
    ["off", false],
    ["OFF", false],
    ["Off", false],
    ["  off  ", false],
  ])("valor %j → ingreso con pasaporte %s", (value, enabled) => {
    if (value === undefined) vi.stubEnv("AME_PASSPORT_SIGNIN", undefined as unknown as string);
    else vi.stubEnv("AME_PASSPORT_SIGNIN", value);
    expect(settings.passportSignInEnabled()).toBe(enabled);
  });

  it("se lee en cada llamada, no al cargar el módulo", () => {
    vi.stubEnv("AME_PASSPORT_SIGNIN", "off");
    expect(settings.passportSignInEnabled()).toBe(false);
    vi.stubEnv("AME_PASSPORT_SIGNIN", "on");
    expect(settings.passportSignInEnabled()).toBe(true);
    vi.stubEnv("AME_PASSPORT_SIGNIN", "OFF");
    expect(settings.passportSignInEnabled()).toBe(false);
  });
});

describe("AME_PASSPORT_SIGNIN=off: /ingresar trata el pasaporte como main", () => {
  it("rechaza un pasaporte ya importado con PASSPORT_GENERAL_MESSAGE y no vincula nada", async () => {
    vi.stubEnv("AME_PASSPORT_SIGNIN", "off");
    const repo = new MemoryRepo();
    const person = repo.addPerson("Ana", "Pérez", PASSPORT);
    const result = await attemptOnce(repo, { email: "ana@example.com", cedula: PASSPORT });
    expect(result).toMatchObject({ ok: false, error: PASSPORT_GENERAL_MESSAGE });
    const after = await repo.getPerson(person);
    expect(after?.login_email).toBeFalsy();
    expect(repo.generalAuth.get(person)?.fingerprint_code_hash).toBeFalsy();
    expect(auditActions(repo)).not.toContain("PERSON_AUTO_LINKED");
    expect([...repo.people.values()].filter((row) => row.self_registered_at)).toHaveLength(1);
  });

  it("también rechaza el pasaporte en minúsculas y con espacios, y uno que no está en la base", async () => {
    vi.stubEnv("AME_PASSPORT_SIGNIN", "OFF");
    const repo = new MemoryRepo();
    repo.addPerson("Ana", "Pérez", PASSPORT);
    expect(await attemptOnce(repo, { email: "ana@example.com", cedula: " bh 823 158 " })).toMatchObject({ ok: false, error: PASSPORT_GENERAL_MESSAGE });
    expect(await attemptOnce(repo, { email: "otro@example.com", cedula: "QQ999999" })).toMatchObject({ ok: false, error: PASSPORT_GENERAL_MESSAGE });
  });

  it("apagarlo y encenderlo se nota en la siguiente petición, sin reiniciar", async () => {
    const repo = new MemoryRepo();
    repo.addPerson("Ana", "Pérez", PASSPORT);
    vi.stubEnv("AME_PASSPORT_SIGNIN", "off");
    expect(await attemptOnce(repo, { email: "ana@example.com", cedula: PASSPORT })).toMatchObject({ ok: false, error: PASSPORT_GENERAL_MESSAGE });
    vi.stubEnv("AME_PASSPORT_SIGNIN", "on");
    expect(await attemptOnce(repo, { email: "ana@example.com", cedula: PASSPORT })).toMatchObject({ ok: true, destination: "form" });
  });

  it("el esquema solo de cédula rechaza el pasaporte igual que el esquema histórico", () => {
    const input = { cedula: PASSPORT, codigoDactilar: CODE };
    const only = generalCedulaOnlyStepSchema.safeParse(input);
    const legacy = generalIdentifySchema.safeParse(input);
    expect(only.success).toBe(false);
    expect(legacy.success).toBe(false);
    if (!only.success) expect(only.error.issues.map((issue) => issue.message)).toEqual([PASSPORT_GENERAL_MESSAGE]);
    expect(generalCedulaStepSchema.safeParse(input).success).toBe(true);
  });
});

describe("AME_PASSPORT_SIGNIN=on: el pasaporte importado entra", () => {
  it.each([undefined, "on", "cualquier otro valor"])("con el valor %j el primer ingreso con pasaporte funciona", async (value) => {
    vi.stubEnv("AME_PASSPORT_SIGNIN", value as string);
    const repo = new MemoryRepo();
    const person = repo.addPerson("Ana", "Pérez", PASSPORT);
    expect(await attemptOnce(repo, { email: "ana@example.com", cedula: PASSPORT })).toMatchObject({ ok: true, destination: "form" });
    expect((await repo.getPerson(person))?.login_email).toBe("ana@example.com");
  });
});

describe("la cédula se comporta igual con el interruptor apagado o encendido", () => {
  async function cedulaScenario() {
    const repo = new MemoryRepo();
    const imported = repo.addPerson("Ana", "Pérez", CEDULA);
    const attempt = async (input: Parameters<typeof attemptOnce>[1]) => {
      repo.buckets.clear();
      return attemptOnce(repo, input);
    };
    const results = {
      autoLink: stable(await attempt({ email: "ana@example.com", cedula: CEDULA })),
      returning: stable(await attempt({ email: "ana@example.com", cedula: CEDULA })),
      wrongFingerprint: stable(await attempt({ email: "ana@example.com", cedula: CEDULA, codigoDactilar: "Z9999Z9999" })),
      wrongCedula: stable(await attempt({ email: "ana@example.com", cedula: OTHER_CEDULA })),
      otherEmail: stable(await attempt({ email: "intruso@example.com", cedula: CEDULA })),
      spaced: stable(await attempt({ email: "ana@example.com", cedula: " 1710 034 065 " })),
      brandNew: stable(await attempt({ email: "nueva@example.com", cedula: OTHER_CEDULA })),
      malformed: stable(await attempt({ email: "nueva@example.com", cedula: "12345" })),
    };
    return { results, audit: auditActions(repo), loginEmail: (await repo.getPerson(imported))?.login_email };
  }

  it("mismos resultados, mismos mensajes y misma auditoría", async () => {
    vi.stubEnv("AME_PASSPORT_SIGNIN", "off");
    const off = await cedulaScenario();
    vi.stubEnv("AME_PASSPORT_SIGNIN", "on");
    const on = await cedulaScenario();
    expect(off).toEqual(on);
    expect(on.results.autoLink).toEqual({ ok: true, destination: "form" });
    expect(on.results.wrongFingerprint).toMatchObject({ ok: false, error: WRONG_FINGERPRINT_ERROR });
    expect(on.results.wrongCedula).toMatchObject({ ok: false, error: WRONG_CEDULA_ERROR });
    expect(on.results.otherEmail).toMatchObject({ ok: false, error: expect.stringContaining("Esta cédula ya ingresó con otro correo") });
    expect(on.results.spaced).toEqual({ ok: true, destination: expect.any(String) });
  });
});

describe("textos de /ingresar con el interruptor", () => {
  it("apagado vuelve al texto de solo cédula de main", () => {
    expect(documentStepCopy(false, false)).toEqual({
      heading: "Tu cédula",
      intro: "Escribe tu número de cédula y el código dactilar del reverso.",
      legend: "Tu cédula",
      label: "Número de cédula",
      hint: "10 números, como en tu cédula.",
      inputMode: "numeric",
      autoCapitalize: undefined,
      inputClassName: "field-input text-xl tracking-[0.12em]",
      emailStepBlurb: "Escribe tu correo y te enviamos un código de acceso. Después te pedimos tu número de cédula.",
    });
  });

  it("encendido pide cédula o pasaporte", () => {
    const copy = documentStepCopy(true, false);
    expect(copy.heading).toBe("Tu cédula o pasaporte");
    expect(copy.label).toBe("Número de cédula o pasaporte");
    expect(copy.inputMode).toBe("text");
    expect(copy.autoCapitalize).toBe("characters");
  });

  it("el enlace personal de pasaporte conserva su texto en los dos casos", () => {
    expect(documentStepCopy(true, true).intro).toBe("Escribe el número de tu pasaporte, tal como está en el documento.");
    expect(documentStepCopy(false, true).intro).toBe("Escribe el número de tu pasaporte, tal como está en el documento.");
  });

  it("«Cómo funciona» cambia con el interruptor", () => {
    const on = renderToStaticMarkup(<HowItWorks passportSignIn />);
    const off = renderToStaticMarkup(<HowItWorks passportSignIn={false} />);
    expect(on).toContain("Confirma tu identidad con tu cédula o pasaporte");
    expect(off).toContain("Confirma tu identidad con tu cédula<");
    expect(off).toContain("Escribe tu número de cédula y el código dactilar del reverso.");
    expect(off).not.toContain("pasaporte");
    expect(renderToStaticMarkup(<HowItWorks />)).toBe(on);
  });
});
