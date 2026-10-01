import { z } from "zod";
import { isValidCedula, normalizeCedula } from "./cedula";
import { ACCOUNT_TYPES, BANKS, BANKS_REQUIRING_NAME } from "./constants";
import { normalizePhone } from "./phone";

const REQUIRED = "Este campo es obligatorio.";
const NAME_RE = /^[\p{L}][\p{L}\p{M}' .-]*$/u;
const SAFE_TEXT_RE = /^[^<>{}\\`]*$/;
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

const nameField = z
  .string()
  .trim()
  .min(2, REQUIRED)
  .max(80, "Máximo 80 caracteres.")
  .regex(NAME_RE, "Usa solo letras, espacios, apóstrofes o guiones.");

const safeText = (max: number) =>
  z.string().trim().max(max, `Máximo ${max} caracteres.`).regex(SAFE_TEXT_RE, "Contiene caracteres no permitidos.");

const requiredSafeText = (max: number) => safeText(max).min(2, REQUIRED);

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Correo demasiado largo.")
  .regex(EMAIL_RE, "Ingresa un correo válido, por ejemplo nombre@correo.com.");

export const cedulaField = z
  .string()
  .trim()
  .transform(normalizeCedula)
  .refine((v) => /^\d{10}$/.test(v), "La cédula debe tener exactamente 10 números.")
  .refine(isValidCedula, "El número de cédula no es válido. Revisa los dígitos.");

const mustAccept = (message: string) => z.boolean().refine((v) => v === true, { message });

// ── Paso 1: identificación ───────────────────────────────────────────────────
export const identifySchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, "Enlace no válido."),
    cedula: cedulaField,
    captchaToken: z.string().max(4096).optional(),
  })
  .strict();

/** Retomar desde el inicio público con cédula (solo personas ya importadas). */
export const cedulaResumeSchema = z
  .object({
    cedula: cedulaField,
    captchaToken: z.string().max(4096).optional(),
  })
  .strict();

// ── Pasos 2–5: formulario ────────────────────────────────────────────────────
export const namesSchema = z
  .object({
    namesConfirmed: z.boolean(),
    firstNames: nameField,
    lastNames: nameField,
  })
  .strict();

export const contactSchema = z
  .object({
    primaryEmail: emailField,
    primaryEmailConfirm: z.string().trim().toLowerCase(),
    secondaryEmail: z.union([z.literal(""), emailField]),
    phoneCountryCode: z.string().trim(),
    phoneNumber: z.string().trim().min(6, REQUIRED).max(20, "Número demasiado largo."),
    addressLine1: requiredSafeText(200),
    addressLine2: safeText(200),
    city: requiredSafeText(80),
    province: requiredSafeText(80),
    country: requiredSafeText(80),
    postalCode: z.string().trim().max(12).regex(/^[A-Za-z0-9 -]*$/, "Código postal no válido."),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.primaryEmail !== v.primaryEmailConfirm) {
      ctx.addIssue({ code: "custom", path: ["primaryEmailConfirm"], message: "Los correos no coinciden." });
    }
    if (v.secondaryEmail && v.secondaryEmail === v.primaryEmail) {
      ctx.addIssue({ code: "custom", path: ["secondaryEmail"], message: "Usa un correo distinto al principal o déjalo vacío." });
    }
    const phone = normalizePhone(v.phoneCountryCode, v.phoneNumber);
    if (!phone.ok) ctx.addIssue({ code: "custom", path: ["phoneNumber"], message: phone.message ?? "Teléfono no válido." });
  });

export const bankSchema = z
  .object({
    bankName: z.enum(BANKS, { message: "Selecciona tu banco." }),
    bankOtherName: safeText(120),
    accountType: z.enum(ACCOUNT_TYPES, { message: "Selecciona el tipo de cuenta." }),
    accountNumber: z.string().trim().regex(/^\d{5,20}$/, "El número de cuenta debe tener entre 5 y 20 dígitos, sin espacios ni guiones."),
    accountNumberConfirm: z.string().trim(),
    accountHolderName: nameField,
    accountHolderCedula: cedulaField,
    ownershipDeclared: mustAccept("Debes confirmar esta declaración para continuar."),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.accountNumber !== v.accountNumberConfirm) {
      ctx.addIssue({ code: "custom", path: ["accountNumberConfirm"], message: "Los números de cuenta no coinciden." });
    }
    if (BANKS_REQUIRING_NAME.includes(v.bankName) && v.bankOtherName.length < 2) {
      ctx.addIssue({ code: "custom", path: ["bankOtherName"], message: "Escribe el nombre de la institución financiera." });
    }
  });

export const consentSchema = z
  .object({
    privacyAccepted: mustAccept("Necesitamos tu autorización para tratar tus datos."),
    sharingAccepted: mustAccept("Necesitamos tu autorización para comunicar los datos a AIG."),
    accuracyDeclared: mustAccept("Debes declarar que la información es correcta."),
  })
  .strict();

export const submissionSchema = z
  .object({
    names: namesSchema,
    contact: contactSchema,
    bank: bankSchema,
    consents: consentSchema,
    noticeVersion: z.string().trim().min(1).max(40),
  })
  .strict();

export type IdentifyInput = z.input<typeof identifySchema>;
export type SubmissionInput = z.input<typeof submissionSchema>;
export type Submission = z.output<typeof submissionSchema>;

/** Convierte errores de Zod a { "contact.primaryEmail": "mensaje" } */
export function flattenIssues(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
