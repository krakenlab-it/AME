import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { previewOutreachAnchorEnabled } from "@/lib/seed/preview-outreach-anchor";
import { requireAdmin } from "@/lib/server/admin-guard";

const ImportPanel = dynamic(() => import("@/components/admin/import-panel").then((m) => m.ImportPanel), {
  loading: () => <Skeleton className="h-72 rounded-2xl" />,
});

export const metadata = { title: "Importar y enlaces" };

export default async function ImportPage() {
  await requireAdmin("people:import");
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Importar y generar enlaces</h1>
      <p className="max-w-3xl text-ink-muted">
        Cada registro válido recibe un identificador interno y un enlace individual con token aleatorio de 256 bits. El token no contiene
        la cédula ni el nombre, vence en el plazo configurado y en la base solo se guarda su hash.
      </p>
      <ImportPanel outreachSimulation={previewOutreachAnchorEnabled()} />
    </div>
  );
}
