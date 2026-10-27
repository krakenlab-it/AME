import { PEOPLE_SORT_FIELDS, type PeopleSort, type PeopleSortField } from "@/lib/database/types";
import { PERSON_STATUSES, type PersonStatus } from "@/lib/validation/constants";

/** Nombres que se ven en la dirección de la página para ordenar la tabla de personas. */
const SORT_PARAM: Record<PeopleSortField, string> = {
  last_names: "apellidos",
  first_names: "nombres",
  submitted_at: "enviado",
};

export function sortParamFor(field: PeopleSortField): string {
  return SORT_PARAM[field];
}

export function parsePeopleSort(orden: string | undefined, dir: string | undefined): PeopleSort | undefined {
  const by = PEOPLE_SORT_FIELDS.find((field) => SORT_PARAM[field] === orden);
  if (!by) return undefined;
  return { by, dir: dir === "desc" ? "desc" : "asc" };
}

export function parseStatusParam(value: string | undefined): PersonStatus | undefined {
  return PERSON_STATUSES.find((status) => status === value);
}

export function parsePageParam(value: string | undefined): number {
  const page = Math.floor(Number(value));
  return Number.isFinite(page) && page >= 1 ? page : 1;
}

export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Arma `?a=1&b=2` sin los valores vacíos. */
export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "?";
}

/** Números de página a mostrar: primera, última y las vecinas de la actual. `null` es un salto "…". */
export function pageWindow(page: number, pages: number): (number | null)[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1]);
  const sorted = [...wanted].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && n - prev > 1) out.push(null);
    out.push(n);
  });
  return out;
}

/** Siguiente dirección al tocar el encabezado de una columna: primero ascendente, luego descendente. */
export function nextSort(current: PeopleSort | undefined, field: PeopleSortField): PeopleSort {
  if (current?.by === field && current.dir === "asc") return { by: field, dir: "desc" };
  return { by: field, dir: "asc" };
}
