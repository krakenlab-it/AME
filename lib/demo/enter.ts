import type { PersonStatus } from "@/lib/validation/constants";

export interface DemoUserCandidate {
  id: string;
  status: PersonStatus;
  submitted_at: string | null;
  first_names: string;
  last_names: string;
}

/**
 * La puerta "usuario" abre a una sola persona: alguien que todavía puede llenar el formulario.
 * Si hay alguien a mitad de camino, esa es la entrada; si no, la primera pendiente.
 */
export function pickDemoUser<T extends DemoUserCandidate>(people: readonly T[]): T | null {
  const open = people.filter((person) => !person.submitted_at);
  return open.find((person) => person.status === "STARTED") ?? open.find((person) => person.status === "PENDING") ?? open[0] ?? null;
}
