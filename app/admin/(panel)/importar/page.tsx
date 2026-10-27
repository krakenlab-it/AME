import dynamic from "next/dynamic";
import { AdminPage, PageHeader } from "@/components/admin/ui/page-header";
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
    <AdminPage width="medium">
      <PageHeader
        title="Importar y enlaces"
        description="Carga la lista de personas y genera el enlace de cada una. Cada enlace es único, no contiene la cédula ni el nombre y vence en el plazo configurado. El ingreso general (/ingresar) es aparte y no reemplaza esos enlaces."
      />
      <ImportPanel outreachSimulation={previewOutreachAnchorEnabled()} />
    </AdminPage>
  );
}
