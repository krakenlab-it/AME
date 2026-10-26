import { randomBytes } from "node:crypto";

/**
 * Aviso cuando el portal no puede completar la operación.
 * `retry` : volver a intentar suele alcanzar.
 * `config`: falta un ajuste del servidor; reintentar ahora no lo arregla.
 * El texto incluye una referencia corta. No registra datos de la persona.
 */
export function unavailableMessage(kind: "retry" | "config"): string {
  const ref = randomBytes(3).toString("hex");
  console.error(`[portal] servicio no disponible ref=${ref} kind=${kind}`);
  if (kind === "config") {
    return `El servicio no está disponible por un problema de configuración. Reintentar ahora no lo resuelve. Escribe al administrador y menciona la referencia ${ref}.`;
  }
  return `El servicio no está disponible en este momento. Volver a intentar suele resolverlo. Si sigue igual, escribe al administrador y menciona la referencia ${ref}.`;
}
