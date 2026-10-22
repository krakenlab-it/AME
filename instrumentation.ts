/**
 * Arranque del servidor (Next llama a register() una vez por instancia).
 * Solo hace algo si existe ADMIN_BOOTSTRAP_EMAILS: ver lib/services/admin-bootstrap.ts.
 * El import va dentro del bloque `=== "nodejs"` para que Next lo quite del bundle Edge.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    if (!process.env.ADMIN_BOOTSTRAP_EMAILS?.trim()) return;
    try {
      const { runAdminBootstrap } = await import("./lib/server/admin-bootstrap-run");
      await runAdminBootstrap();
    } catch {
      console.error("[admin-bootstrap] no se pudo completar; el portal sigue arrancando");
    }
  }
}
