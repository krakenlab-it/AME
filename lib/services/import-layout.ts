import { isValidCedula } from "@/lib/validation/cedula";
import { isForeignDocument, normalizeDocument } from "@/lib/validation/document";
import { normalizePhone } from "@/lib/validation/phone";
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

/** Títulos de teléfono. Una columna de teléfono nunca se usa como cédula. */
const PHONE_HEADERS = new Set([
  "telefono",
  "telefonos",
  "telefono celular",
  "telefono movil",
  "numero de telefono",
  "nro de telefono",
  "celular",
  "celulares",
  "movil",
  "whatsapp",
  "phone",
  "phone number",
  "mobile",
  "mobile phone",
  "cell",
  "tel",
]);

const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export type HeaderRole = "full" | "first" | "last" | "id" | "email" | "phone" | "responsable" | "community" | "other" | "ignore";

export interface ImportCell {
  header: string;
  value: string;
  /**
   * Rol de la columna ya decidido mirando toda la columna (ver classifyImportColumns).
   * Si falta, se usa solo el título.
   */
  role?: HeaderRole;
}

export interface InterpretedImport {
  first_names: string;
  last_names: string;
  national_id: string;
  outreach_email: string;
  /** Teléfono en E.164 si el archivo trae una columna de teléfono. */
  outreach_phone?: string;
  comunidad?: string;
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
  if (normalized === "responsable") return "responsable";
  if (normalized === "comunidad" || normalized.includes("comunidad")) return "community";
  if (EMAIL_HEADERS.has(normalized) || normalized.includes("correo") || normalized === "email") return "email";
  if (
    PHONE_HEADERS.has(normalized) ||
    /\b(telefono|telefonos|celular|movil|whatsapp|phone)\b/.test(normalized)
  ) {
    return "phone";
  }
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

/**
 * Celular ecuatoriano por contenido: 09XXXXXXXX, +593 9XXXXXXXX, 5939XXXXXXXX
 * o 9XXXXXXXX (Excel quitó el cero). Devuelve E.164 o null.
 * Ojo: 09 también es el código de provincia de Guayas, así que una celda sola no basta
 * para decidir. Ver classifyImportColumns.
 */
export function ecuadorMobile(value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, "");
  if (!/^\+?\d{9,13}$/.test(compact)) return null;
  const digits = compact.replace(/^\+/, "");
  const national = digits.startsWith("593") ? digits.slice(3) : digits;
  if (!/^0?9\d{8}$/.test(national)) return null;
  const check = normalizePhone("+593", national);
  return check.ok && check.e164 ? check.e164 : null;
}

export interface ColumnProfile {
  /** Celdas con algo escrito. */
  filled: number;
  /** Parecen celular ecuatoriano (09…, +593…). */
  mobileLike: number;
  /** Diez dígitos que no pasan el verificador de cédula. */
  cedulaFailures: number;
  /** Cédulas válidas (provincia, tercer dígito y módulo 10). */
  validCedulas: number;
  /** Escrito con +593: nunca es una cédula. */
  internationalPrefix: number;
}

export function profileColumn(values: string[]): ColumnProfile {
  const profile: ColumnProfile = { filled: 0, mobileLike: 0, cedulaFailures: 0, validCedulas: 0, internationalPrefix: 0 };
  for (const raw of values) {
    const text = cleanText(raw);
    if (!text) continue;
    profile.filled += 1;
    if (ecuadorMobile(text)) profile.mobileLike += 1;
    if (/^\+\s*593/.test(text)) profile.internationalPrefix += 1;
    // Nueve dígitos: Excel quitó el cero inicial (una cédula de Guayas 09… o un celular 09…).
    const nine = /^\d{9}$/.test(text.replace(/[\s-]/g, "")) ? `0${text.replace(/[\s-]/g, "")}` : null;
    const ten = tenDigitId(text) ?? nine;
    if (ten) {
      if (isValidCedula(ten)) profile.validCedulas += 1;
      else profile.cedulaFailures += 1;
    }
  }
  return profile;
}

/**
 * Una columna es de teléfonos si casi todo parece celular (09…/+593…) y muchas de esas
 * celdas no pasan el verificador de cédula. Una columna de cédulas de Guayas también
 * empieza en 09, pero sus valores sí pasan el verificador; por eso se decide por columna.
 */
export function looksLikePhoneColumn(profile: ColumnProfile): boolean {
  if (profile.filled < 1) return false;
  const mobileShare = profile.mobileLike / profile.filled;
  if (mobileShare < 0.6) return false;
  if (profile.internationalPrefix / profile.filled >= 0.5) return true;
  const tenDigits = profile.cedulaFailures + profile.validCedulas;
  if (tenDigits === 0) return mobileShare >= 0.8;
  return profile.cedulaFailures / tenDigits >= 0.5;
}

/**
 * Una columna sin título se ignora, salvo dos casos:
 * - si la mayoría de sus celdas de 10 dígitos pasa el verificador, es cédula;
 * - si la mayoría son nombres completos (tres palabras o más), sirve de nombre
 *   cuando RESPONSABLE no es el nombre de una persona.
 * Un teléfono suelto sin título no se usa.
 */
export function looksLikeFullNameColumn(values: string[]): boolean {
  const filled = values.map((value) => cleanText(value)).filter(Boolean);
  if (filled.length < 3) return false;
  const names = filled.filter((value) => looksLikePersonName(value)).length;
  return names / filled.length >= 0.6;
}

/**
 * Nombre de persona: tres o más palabras con letras (apellido, apellido, nombres).
 * "Pastoral" o "Responsable de pastoral" no cuentan: RESPONSABLE a veces es un cargo.
 * En ese caso se usa la columna sin título de nombres completos.
 */
export function looksLikePersonName(value: string): boolean {
  const tokens = value.split(/\s+/).filter((token) => /\p{L}{2,}/u.test(token));
  return tokens.length >= 3 && !isNumericJunk(value);
}

function columnIsCedula(profile: ColumnProfile): boolean {
  const checked = profile.validCedulas + profile.cedulaFailures;
  return checked > 0 && profile.validCedulas > profile.cedulaFailures;
}

/**
 * Rol de cada columna mirando el título y el contenido completo.
 * Si el verificador de cédula pasa en la mayoría de la columna, es cédula aunque el título diga teléfono.
 * Si no pasa, y parece celular, es teléfono.
 */
export function classifyImportColumns(headers: string[], columns: string[][]): HeaderRole[] {
  return headers.map((header, index) => {
    const values = columns[index] ?? [];
    const profile = profileColumn(values);
    if (!cleanText(header)) {
      if (columnIsCedula(profile)) return "id";
      if (looksLikeFullNameColumn(values)) return "full";
      return "ignore";
    }
    if (columnIsCedula(profile)) return "id";
    const byHeader = headerRole(header);
    if (byHeader === "phone" || looksLikePhoneColumn(profile)) return "phone";
    if (byHeader === "email") return "email";
    return byHeader;
  });
}

/** Cuántos títulos conocidos tiene una fila. Sirve para encontrar la fila de títulos. */
export function headerRowScore(cells: string[]): number {
  let score = 0;
  const seen = new Set<HeaderRole>();
  for (const cell of cells) {
    const text = cleanText(cell);
    if (!text || text.length > 60) continue;
    const role = headerRole(text);
    if (role === "other" || seen.has(role)) continue;
    seen.add(role);
    score += role === "id" ? 2 : 1;
  }
  return score;
}

/** Busca la fila de títulos entre las primeras filas. Si ninguna tiene títulos conocidos, la primera con datos. */
export const HEADER_SCAN_ROWS = 10;
export const HEADER_NOT_RECOGNIZED =
  "No reconocemos los títulos del archivo. Incluye columnas como Nombres, Apellidos, Cédula, Correo o Teléfono.";
export const FILE_UNREADABLE = "No pudimos leer el archivo. Guárdalo como CSV en UTF-8 o como Excel .xlsx.";
export function pickHeaderRow(rows: string[][]): number {
  let best = -1;
  let bestScore = 0;
  const limit = Math.min(rows.length, HEADER_SCAN_ROWS);
  for (let i = 0; i < limit; i += 1) {
    const score = headerRowScore(rows[i] ?? []);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  if (best >= 0) return best;
  const firstFilled = rows.findIndex((row) => row.some((cell) => cleanText(cell)));
  return firstFilled >= 0 ? firstFilled : 0;
}

/** Un nombre no lleva números. Dos o más dígitos es basura numérica (teléfono, cédula, código). */
export function isNumericJunk(value: string): boolean {
  const digits = value.replace(/\D/g, "").length;
  if (digits >= 2) return true;
  return digits > 0 && !/\p{L}{2,}/u.test(value);
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
    case "phone":
    case "responsable":
    case "community":
    case "ignore":
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
    const role = cell.role ?? headerRole(cell.header);
    // Un teléfono nunca es candidato a cédula ni a pasaporte.
    if (role === "phone") return { index, role, text, cedula: null, passport: null };
    return { index, role, text, cedula: tenDigitId(text), passport: passportId(text) };
  });
  const phoneCell = prepared.find((cell) => cell.role === "phone" && ecuadorMobile(cell.text));
  const outreachPhone = phoneCell ? ecuadorMobile(phoneCell.text) ?? "" : "";

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
    .filter((cell) => !usedAsId.has(cell.index) && cell.role !== "phone" && cell.text && (cell.role === "email" || looksLikeEmail(cell.text)))
    .sort((a, b) => Number(b.role === "email") - Number(a.role === "email") || a.index - b.index)[0];
  const outreachEmail = emailPick && looksLikeEmail(emailPick.text) ? emailPick.text.trim().toLowerCase() : "";

  const nameCells = prepared.filter((cell) => {
    if (usedAsId.has(cell.index)) return false;
    if (emailPick && cell.index === emailPick.index) return false;
    if (cell.role === "email" || cell.role === "phone" || cell.role === "community" || cell.role === "ignore") return false;
    if (!cell.text) return false;
    if (looksLikeEmail(cell.text)) return false;
    // Un apellido que es la cédula (solo dígitos, o el mismo valor que la columna de identidad) no es un apellido.
    if (isAllDigits(cell.text)) return false;
    if (nationalId && normalizeDocument(cell.text) === nationalId) return false;
    // Basura numérica (un teléfono con espacios, «Juan 0991…», un código) no es un nombre.
    if (isNumericJunk(cell.text)) return false;
    return /\p{L}/u.test(cell.text);
  });

  const comunidad = prepared.find((cell) => cell.role === "community" && cell.text)?.text ?? "";
  const responsable = prepared.find((cell) => cell.role === "responsable" && cell.text);
  const fallbackName = prepared.find((cell) => cell.role === "full" && looksLikePersonName(cell.text));
  const names = responsable && looksLikePersonName(responsable.text)
    ? splitEcuadorianFullName(responsable.text)
    : fallbackName
      ? splitEcuadorianFullName(fallbackName.text)
      : mapNameCells(nameCells.filter((cell) => cell.role !== "responsable" || looksLikePersonName(cell.text)));
  const out: InterpretedImport = { first_names: names.first_names, last_names: names.last_names, national_id: nationalId, outreach_email: outreachEmail };
  if (outreachPhone) out.outreach_phone = outreachPhone;
  if (comunidad) out.comunidad = comunidad;
  return out;
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
