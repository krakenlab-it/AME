import dynamic from "next/dynamic";
import { AdminPage, PageHeader } from "@/components/admin/ui/page-header";
import { SectionCard } from "@/components/admin/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Notice } from "@/components/ui/notice";
import { EXPORT_PROFILES } from "@/lib/services/export";
import { UNIBROKERS_HOLD, unibrokersColumnLabels } from "@/lib/services/unibrokers";
import { requireAdmin } from "@/lib/server/admin-guard";

const ExportPanel = dynamic(() => import("@/components/admin/export-panel").then((m) => m.ExportPanel), {
  loading: () => <Skeleton className="h-96 rounded-2xl" />,
});

const UnibrokersPanel = dynamic(() => import("@/components/admin/unibrokers-panel").then((m) => m.UnibrokersPanel), {
  loading: () => <Skeleton className="h-72 rounded-2xl" />,
});

export const metadata = { title: "Archivo para AIG" };

export default async function ExportPage() {
  await requireAdmin("export:create");
  const profiles = Object.entries(EXPORT_PROFILES).map(([key, p]) => ({ key, label: p.label, columns: p.columns.map(([, l]) => l) }));
  return (
    <AdminPage width="medium">
      <PageHeader
        title="Archivo para AIG"
        description="Descarga la lista de personas que ya completaron y fueron revisadas, lista para enviar a AIG."
      />
      <Notice title="Solo se exporta lo necesario">
        Se incluyen únicamente registros completados y revisados, con consentimiento vigente para comunicar datos a AIG. El archivo se
        genera en el momento y se descarga directamente: no se guarda en el servidor ni se crea un enlace público. Envíalo por un canal
        cifrado y elimínalo de tu equipo cuando ya no lo necesites.
      </Notice>
      <ExportPanel profiles={profiles} />

      <SectionCard
        id="unibrokers"
        title="Carga de contacto para Unibrokers"
        description="Seguimiento de operaciones: nombres, cédula, correo, celular y estado. No incluye datos bancarios. Esos siguen en el archivo para AIG, según sea reclamos o reembolsos."
      >
        <Notice tone="warning" title="Envío en vivo en espera">
          {UNIBROKERS_HOLD}
        </Notice>
        <UnibrokersPanel columns={unibrokersColumnLabels()} hold={UNIBROKERS_HOLD} />
      </SectionCard>
    </AdminPage>
  );
}
