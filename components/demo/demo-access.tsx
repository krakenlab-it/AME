import { FlaskConical, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getRepo } from "@/lib/database";
import { isMemoryRepo } from "@/lib/database/memory-repo";
import { pickDemoUser } from "@/lib/demo/enter";
import { isDemoMode } from "@/lib/demo-mode";

/** Dos puertas de prueba. No se dibuja si DEMO_MODE no está activo o si el entorno es producción. */
export function DemoAccess() {
  if (!isDemoMode()) return null;
  const repo = getRepo();
  if (!isMemoryRepo(repo)) return null;
  const user = pickDemoUser([...repo.people.values()]);

  return (
    <aside aria-labelledby="demo-access" className="rounded-2xl border border-crown/40 bg-warn-soft p-5">
      <div className="flex items-start gap-3">
        <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-crown" aria-hidden />
        <div>
          <h2 id="demo-access" className="text-lg">Probar el portal</h2>
          <p className="mt-1 text-sm text-ink/80">
            Hay dos entradas: el administrador y la persona que actualiza sus datos. Revisor y exportación a AIG son este mismo panel, con menos opciones.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <form action="/demo/entrar" method="post">
          <input type="hidden" name="destino" value="admin" />
          <Button type="submit" size="sm" block className="justify-start">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Entrar como administrador
          </Button>
        </form>
        <form action="/demo/entrar" method="post">
          <input type="hidden" name="destino" value="usuario" />
          <Button type="submit" size="sm" variant="secondary" block className="justify-start" disabled={!user}>
            <UserRound className="h-4 w-4" aria-hidden />
            {user ? `Entrar como usuario · ${user.first_names.split(" ")[0]}` : "No hay un usuario pendiente"}
          </Button>
        </form>
      </div>
    </aside>
  );
}
