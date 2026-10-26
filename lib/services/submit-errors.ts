import { namesSchema } from "@/lib/validation/schemas";

const FIELD_LABELS: Record<string, string> = {
  "names.firstNames": "Nombres",
  "names.lastNames": "Apellidos",
  "names.namesConfirmed": "Nombre registrado",
  "contact.primaryEmail": "Correo principal",
  "contact.primaryEmailConfirm": "Confirmar correo",
  "contact.secondaryEmail": "Correo alternativo",
  "contact.phoneCountryCode": "Código de país",
  "contact.phoneNumber": "Teléfono celular",
  "contact.addressLine1": "Dirección",
  "contact.addressLine2": "Complemento",
  "contact.city": "Ciudad",
  "contact.province": "Provincia",
  "contact.country": "País",
  "contact.postalCode": "Código postal",
  "bank.bankName": "Banco",
  "bank.bankOtherName": "Nombre de la institución",
  "bank.accountType": "Tipo de cuenta",
  "bank.accountNumber": "Número de cuenta",
  "bank.accountNumberConfirm": "Confirmar número de cuenta",
  "bank.accountHolderName": "Nombre del titular",
  "bank.ownershipDeclared": "Declaración sobre la cuenta",
  "consents.privacyAccepted": "Aviso de privacidad",
  "consents.sharingAccepted": "Comunicación de datos a AIG",
  "consents.accuracyDeclared": "Declaración de veracidad",
  contact: "Contacto",
  names: "Nombres",
  bank: "Datos bancarios",
  consents: "Autorizaciones",
};

export interface FieldErrorItem {
  id: string;
  step: number;
  label: string;
  message: string;
}

/** Paso del asistente. Fuera de 2–6, o un texto, vuelve al paso de nombres. */
export function wizardStepFromQuery(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 2 || n > 6) return 2;
  return n;
}

export function sessionFollowUp(entry: "token" | "general" | undefined): string {
  if (entry === "token") return "Para continuar, abre otra vez el enlace personal que recibiste.";
  if (entry === "general") return "Para continuar, vuelve a empezar en /ingresar.";
  return "Si entraste con tu correo, vuelve a empezar en /ingresar. Si usaste un enlace personal, ábrelo otra vez.";
}

/** El titular de la cuenta no puede pasar de 80 caracteres: se recorta el nombre compuesto. */
export function holderNamePrefill(firstNames: string, lastNames: string): string {
  const full = `${firstNames} ${lastNames}`.trim().replace(/\s+/g, " ");
  if (full.length <= 80) return full;
  return full.slice(0, 80).trim();
}

export function registeredNamesNeedEdit(firstNames: string, lastNames: string): boolean {
  return !namesSchema.safeParse({ namesConfirmed: true, firstNames, lastNames }).success;
}

export function stepForField(path: string): number {
  if (path === "names" || path.startsWith("names.")) return 2;
  if (path === "contact" || path.startsWith("contact.")) return 3;
  if (path === "bank" || path.startsWith("bank.")) return 4;
  return 5;
}

function readableMessage(message: string): string {
  const unrecognized = /unrecognized key:\s*"([^"]+)"/i.exec(message);
  if (!unrecognized) return message;
  if (unrecognized[1] === "primaryEmailConfirm") {
    return "Ya no hace falta escribir el correo dos veces. Vuelve a cargar la página y envía otra vez.";
  }
  return "Hay un dato que el formulario ya no pide. Vuelve a cargar la página y envía otra vez.";
}

export function describeFieldErrors(fieldErrors: Record<string, string>): FieldErrorItem[] {
  return Object.entries(fieldErrors).map(([id, message]) => ({
    id,
    step: stepForField(id),
    label: FIELD_LABELS[id] ?? "Dato del formulario",
    message: readableMessage(message),
  }));
}

/** Aplana errores de react-hook-form, incluido el mensaje de un objeto sin campo visible. */
export function flattenFormErrors(errors: unknown, prefix = ""): Record<string, string> {
  if (!errors || typeof errors !== "object") return {};
  const node = errors as Record<string, unknown>;
  const out: Record<string, string> = {};
  if (typeof node.message === "string" && node.message && prefix) out[prefix] = node.message;
  for (const [key, value] of Object.entries(node)) {
    if (key === "message" || key === "type" || key === "ref" || key === "types") continue;
    Object.assign(out, flattenFormErrors(value, prefix ? `${prefix}.${key}` : key));
  }
  return out;
}
