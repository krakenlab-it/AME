import dynamic from "next/dynamic";
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
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl">Generar archivo para AIG</h1>
      <Notice title="Solo se exporta lo necesario">
        Se incluyen únicamente registros completados y revisados, con consentimiento vigente para comunicar datos a AIG. El archivo se
        genera en el momento y se descarga directamente: no se guarda en el servidor ni se crea un enlace público. Envíalo por un canal
        cifrado y elimínalo de tu equipo cuando ya no lo necesites.
      </Notice>
      <ExportPanel profiles={profiles} />

      <section className="space-y-4" aria-labelledby="unibrokers-title">
        <h2 id="unibrokers-title" className="text-2xl">Carga de contacto para Unibrokers</h2>
        <Notice title="Seguimiento de operaciones">
          Este paquete es la carga de contacto: nombres, cédula, correo, celular y estado. No incluye datos bancarios. Esos siguen en el archivo para AIG, según sea reclamos o reembolsos.
        </Notice>
        <Notice tone="warning" title="Envío en vivo en espera">
          {UNIBROKERS_HOLD}
        </Notice>
        <UnibrokersPanel columns={unibrokersColumnLabels()} hold={UNIBROKERS_HOLD} />
      </section>
    </div>
  );
}
