import { isForeignDocument, normalizeDocument } from "@/lib/validation/document";
import { cleanText } from "@/lib/validation/sanitize";

/**
 * Bytes CP850 leídos como CP1251. En el Excel de Marista, Ñ quedó como Ґ y Í como Ц.
 * Solo se corrigen esos glifos (y el mismo intercambio en otras letras españolas).
 * Una Ñ ya bien escrita no está en este mapa y se conserva.
 */
const CP850_READ_AS_CP1251: Readonly<Record<string, string>> = {
  "\u201A": "é",
  "\u0403": "ü",
  "\u0452": "É",
  "\u0459": "Ü",
  "\u040E": "í",
  "\u045E": "ó",
  "\u0408": "ú",
  "\u00A4": "ñ",
  "\u0490": "Ñ",
  "\u00B5": "Á",
  "\u0426": "Í",
  "\u0430": "Ó",
  "\u0439": "Ú",
};

const SURNAME_PARTICLES = new Set([
  "DE", "DEL", "LA", "LAS", "LOS", "SAN", "SANTA", "DA", "DAS", "DO", "DOS", "VAN", "VON", "DI", "MC", "MAC",
]);

const FULL_HEADERS = new Set([
  "nombres completos",
  "nombre completo",
  "nombres y apellidos",
  "nombre y apellidos",
  "full name",
  "fullname",
]);

const FIRST_HEADERS = new Set([
  "first names",
  "first name",
  "firstname",
  "firstnames",
  "nombres",
  "nombre",
  "nombres de pila",
  "given names",
  "given name",
]);

const LAST_HEADERS = new Set([
  "last names",
  "last name",
  "lastname",
  "lastnames",
  "apellidos",
  "apellido",
  "surnames",
  "surname",
]);

const ID_HEADERS = new Set([
  "national id",
  "cedula",
  "cedula de identidad",
  "id",
  "ci",
  "dni",
  "documento",
  "documento de identidad",
  "identificacion",
  "numero de cedula",
  "nro de cedula",
  "pasaporte",
  "passport",
  "numero de pasaporte",
  "nro de pasaporte",
  "numero de documento",
]);

const EMAIL_HEADERS = new Set([
  "email",
  "e mail",
  "mail",
  "correo",
  "correo electronico",
  "correo principal",
  "correo para el enlace",
]);

const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export type HeaderRole = "full" | "first" | "last" | "id" | "email" | "other";

export interface ImportCell {
  header: string;
  value: string;
}

export interface InterpretedImport {
  first_names: string;
  last_names: string;
  national_id: string;
  outreach_email: string;
}

export function repairImportedText(value: string): string {
  let out = "";
  for (const ch of value) out += CP850_READ_AS_CP1251[ch] ?? ch;
  return out.normalize("NFC");
}

export function headerRole(header: string): HeaderRole {
  const normalized = header
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (FULL_HEADERS.has(normalized)) return "full";
  if (FIRST_HEADERS.has(normalized)) return "first";
  if (LAST_HEADERS.has(normalized)) return "last";
  if (EMAIL_HEADERS.has(normalized) || normalized.includes("correo") || normalized === "email") return "email";
  if (ID_HEADERS.has(normalized) || normalized.includes("cedula") || normalized.includes("pasaporte") || normalized.includes("passport")) return "id";
  return "other";
}

export function looksLikeEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Cédula encontrada por contenido: 10 dígitos, con ceros iniciales, sin convertir a número. */
export function tenDigitId(value: string): string | null {
  const compact = value.replace(/[\s-]/g, "");
  return /^\d{10}$/.test(compact) ? compact : null;
}

/** Pasaporte encontrado por contenido. El valor ya va normalizado (mayúsculas, sin espacios). */
export function passportId(value: string): string | null {
  return isForeignDocument(value) ? normalizeDocument(value) : null;
}

function isAllDigits(value: string): boolean {
  const compact = value.replace(/[\s-]/g, "");
  return compact.length > 0 && /^\d+$/.test(compact);
}

function tokenCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function rankIdColumn(role: HeaderRole): number {
  switch (role) {
    case "id":
      return 4;
    case "other":
      return 3;
    case "full":
      return 2;
    case "first":
      return 1;
    case "last":
    case "email":
      return 0;
    default: {
      const exhaustive: never = role;
      return exhaustive;
    }
  }
}

/**
 * Nombre ecuatoriano en un solo campo, orden apellidos + nombres.
 * Toma dos apellidos (un apellido compuesto cuenta como uno: DE LA TORRE)
 * y deja el resto como nombres. Si al separar dos apellidos el nombre
 * empezaría por DE/DEL/…, el segundo token era parte del nombre
 * (MARIA DEL CARMEN) y se acepta un solo apellido.
 */
export function splitEcuadorianFullName(fullName: string): { first_names: string; last_names: string } {
  const tokens = fullName.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { first_names: "", last_names: "" };
  if (tokens.length === 1) return { first_names: tokens[0]!, last_names: tokens[0]! };

  const first = takeSurname(tokens, 0);
  if (!first) return { first_names: tokens[tokens.length - 1]!, last_names: tokens.slice(0, -1).join(" ") };
  const second = takeSurname(tokens, first.next);
  if (second && second.next < tokens.length) {
    const given = tokens.slice(second.next);
    const givenStartsWithParticle = SURNAME_PARTICLES.has(given[0]!.toUpperCase());
    const secondStartsWithParticle = SURNAME_PARTICLES.has(second.text.split(" ")[0]!.toUpperCase());
    if (givenStartsWithParticle && !secondStartsWithParticle) {
      return { last_names: first.text, first_names: `${second.text} ${given.join(" ")}` };
    }
    return { last_names: `${first.text} ${second.text}`, first_names: given.join(" ") };
  }
  const given = tokens.slice(first.next);
  if (given.length === 0) return { first_names: first.text, last_names: first.text };
  return { last_names: first.text, first_names: given.join(" ") };
}

function takeSurname(tokens: string[], start: number): { text: string; next: number } | null {
  if (start >= tokens.length) return null;
  let index = start;
  const parts: string[] = [];
  while (index < tokens.length - 1 && SURNAME_PARTICLES.has(tokens[index]!.toUpperCase())) {
    parts.push(tokens[index]!);
    index += 1;
  }
  if (index >= tokens.length) return null;
  if (SURNAME_PARTICLES.has(tokens[index]!.toUpperCase())) return null;
  parts.push(tokens[index]!);
  return { text: parts.join(" "), next: index + 1 };
}

interface PreparedCell {
  index: number;
  role: HeaderRole;
  text: string;
  cedula: string | null;
  passport: string | null;
}

/**
 * Arma nombres y cédula mirando el contenido de cada celda.
 * Un apellido que es solo dígitos (la cédula repetida) no se usa como apellido.
 * Una sola celda con texto se parte con la heurística ecuatoriana.
 * Dos columnas que sí traen nombres se respetan tal cual.
 */
export function interpretImportCells(cells: ImportCell[]): InterpretedImport {
  const prepared: PreparedCell[] = cells.map((cell, index) => {
    const text = repairImportedText(cleanText(cell.value));
    return { index, role: headerRole(cell.header), text, cedula: tenDigitId(text), passport: passportId(text) };
  });

  const idCandidates = prepared.filter((cell) => cell.cedula);
  const idPick = [...idCandidates].sort((a, b) => rankIdColumn(b.role) - rankIdColumn(a.role) || a.index - b.index)[0];
  const passportCandidates = prepared.filter((cell) => cell.passport);
  const passportPick = [...passportCandidates].sort((a, b) => rankIdColumn(b.role) - rankIdColumn(a.role) || a.index - b.index)[0];

  const usedAsId = new Set<number>();
  let nationalId = "";
  if (idPick?.cedula) {
    nationalId = idPick.cedula;
    for (const cell of prepared) {
      if (cell.cedula === idPick.cedula) usedAsId.add(cell.index);
    }
  } else if (passportPick?.passport) {
    nationalId = passportPick.passport;
    for (const cell of prepared) {
      if (cell.passport === passportPick.passport) usedAsId.add(cell.index);
    }
  } else {
    const hinted = prepared.find((cell) => cell.role === "id" && cell.text.trim());
    if (hinted) {
      nationalId = hinted.text.replace(/[\s-]/g, "");
      usedAsId.add(hinted.index);
    }
  }

  const emailPick = prepared
    .filter((cell) => !usedAsId.has(cell.index) && cell.text && (cell.role === "email" || looksLikeEmail(cell.text)))
    .sort((a, b) => Number(b.role === "email") - Number(a.role === "email") || a.index - b.index)[0];
  const outreachEmail = emailPick && looksLikeEmail(emailPick.text) ? emailPick.text.trim().toLowerCase() : "";

  const nameCells = prepared.filter((cell) => {
    if (usedAsId.has(cell.index)) return false;
    if (emailPick && cell.index === emailPick.index) return false;
    if (cell.role === "email") return false;
    if (!cell.text) return false;
    if (looksLikeEmail(cell.text)) return false;
    // Un apellido que es la cédula (solo dígitos, o el mismo valor que la columna de identidad) no es un apellido.
    if (isAllDigits(cell.text)) return false;
    if (nationalId && normalizeDocument(cell.text) === nationalId) return false;
    return /\p{L}/u.test(cell.text);
  });

  const names = mapNameCells(nameCells);
  return { first_names: names.first_names, last_names: names.last_names, national_id: nationalId, outreach_email: outreachEmail };
}

function mapNameCells(nameCells: PreparedCell[]): { first_names: string; last_names: string } {
  const first = nameCells.find((cell) => cell.role === "first");
  const last = nameCells.find((cell) => cell.role === "last");
  const full = nameCells.find((cell) => cell.role === "full");
  if (first && last) return { first_names: first.text, last_names: last.text };
  if (full) return splitEcuadorianFullName(full.text);
  if (nameCells.length === 1) return splitEcuadorianFullName(nameCells[0]!.text);
  if (nameCells.length >= 2) {
    const longest = [...nameCells].sort((a, b) => tokenCount(b.text) - tokenCount(a.text) || a.index - b.index)[0]!;
    if (tokenCount(longest.text) >= 3) return splitEcuadorianFullName(longest.text);
    const ordered = [...nameCells].sort((a, b) => a.index - b.index);
    return { first_names: ordered[0]!.text, last_names: ordered[1]!.text };
  }
  return { first_names: "", last_names: "" };
}
