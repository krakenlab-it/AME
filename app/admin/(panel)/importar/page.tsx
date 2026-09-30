import { ImportPanel } from "@/components/admin/import-panel";
import { requireAdmin } from "@/lib/server/admin-guard";

export default async function ImportPage() {
  await requireAdmin("people:import");
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Importar y generar enlaces</h1>
      <p className="max-w-3xl text-ink-muted">
        Cada registro válido recibe un identificador interno y un enlace individual con token aleatorio de 256 bits. El token no contiene
        la cédula ni el nombre, vence en el plazo configurado y en la base solo se guarda su hash.
      </p>
      <ImportPanel />
    </div>
  );
}
