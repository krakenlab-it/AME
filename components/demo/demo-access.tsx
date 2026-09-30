import { FlaskConical, ShieldCheck, UserRound } from "lucide-react";
import { demoEnterAdminAction, demoEnterRespondentAction } from "@/app/demo/actions";
import { DemoSubmit } from "@/components/demo/demo-submit";
import { getRepo } from "@/lib/database";
import { isMemoryRepo } from "@/lib/database/memory-repo";
import { isDemoMode } from "@/lib/demo-mode";
import { ROLE_LABELS } from "@/lib/admin/labels";
import { ADMIN_ROLES } from "@/lib/security/rbac";
import { STATUS_LABELS } from "@/lib/validation/constants";

/** Accesos rápidos para pruebas. No se dibuja si DEMO_MODE no está activo o si el entorno es producción. */
export function DemoAccess({ show }: { show: "admin" | "respondent" | "both" }) {
  if (!isDemoMode()) return null;
  const repo = getRepo();
  if (!isMemoryRepo(repo)) return null;
  const people = [...repo.people.values()].filter((p) => !p.submitted_at);

  return (
    <aside aria-labelledby="demo-access" className="rounded-2xl border border-dashed border-crown-deep/60 bg-warn-soft p-5">
      <div className="flex items-start gap-3">
        <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-crown-deep" aria-hidden />
        <div>
          <h2 id="demo-access" className="font-sans text-base font-semibold text-ink">Acceso rápido de pruebas</h2>
          <p className="mt-1 text-sm text-ink/80">Solo en modo demostración. Usa datos ficticios en memoria y no existe en producción.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {(show === "admin" || show === "both") && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><ShieldCheck className="h-4 w-4" aria-hidden /> Entrar como administración</p>
            {ADMIN_ROLES.map((role) => (
              <form key={role} action={demoEnterAdminAction}>
                <input type="hidden" name="role" value={role} />
                <DemoSubmit variant={role === "ADMIN" ? "primary" : "secondary"}>{ROLE_LABELS[role]}</DemoSubmit>
              </form>
            ))}
          </div>
        )}
        {(show === "respondent" || show === "both") && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><UserRound className="h-4 w-4" aria-hidden /> Entrar como titular</p>
            {people.map((p) => (
              <form key={p.id} action={demoEnterRespondentAction}>
                <input type="hidden" name="personId" value={p.id} />
                <DemoSubmit>
                  <span className="truncate">{p.first_names} {p.last_names}</span>
                  <span className="ml-auto shrink-0 text-xs font-normal text-ink-muted">{STATUS_LABELS[p.status]}</span>
                </DemoSubmit>
              </form>
            ))}
            {!people.length && <p className="text-sm text-ink-muted">No quedan titulares pendientes.</p>}
          </div>
        )}
      </div>
    </aside>
  );
}
