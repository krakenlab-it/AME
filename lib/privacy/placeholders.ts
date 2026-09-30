/** Detecta placeholders del tipo [NOMBRE DEL RESPONSABLE] o {{variable}} sin resolver. */
const PLACEHOLDER_RE = /\[[A-ZÁÉÍÓÚÑ0-9 /,.()-]{3,}\]|\{\{\s*\w+\s*\}\}/;

export function hasPlaceholder(text: string | null | undefined): boolean {
  if (!text) return false;
  return PLACEHOLDER_RE.test(text);
}

export function findPlaceholders(text: string): string[] {
  const re = new RegExp(PLACEHOLDER_RE.source, "g");
  return Array.from(new Set(text.match(re) ?? []));
}
