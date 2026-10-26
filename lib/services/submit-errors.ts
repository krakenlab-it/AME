const FIELD_LABELS: Record<string, string> = {
  "names.firstNames": "Nombres",
  "names.lastNames": "Apellidos",
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
