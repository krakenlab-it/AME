"use client";

import { useActionState, useState, useTransition } from "react";
import { Download, Upload } from "lucide-react";
import { importAction, issueMissingLinksAction, type ImportState } from "@/app/admin/panel-actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

function download(csv: string, name: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ImportPanel() {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importAction, {});
  const [linksMsg, setLinksMsg] = useState<string | null>(null);
  const [linksPending, start] = useTransition();
  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <form action={formAction} className="sheet space-y-5 p-6">
        <h2 className="text-xl">Cargar base inicial</h2>
        <p className="text-sm text-ink-muted">
          Archivo .csv o .xlsx con las columnas <code>first_names</code>, <code>last_names</code> y <code>national_id</code> (máximo 5 MB).
          Descarga la <a className="font-semibold text-marian underline" href="/templates/initial_people.csv" download>plantilla</a>.
        </p>
        <input name="file" type="file" accept=".csv,.xlsx" required className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-marian-soft file:px-4 file:py-2 file:font-semibold file:text-marian" />
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="allowPartial" className="mt-0.5 h-5 w-5 accent-marian" />
          <span>Si hay filas con errores, importar solo las válidas (las rechazadas se listan en el reporte y no se importan).</span>
        </label>
        <Button type="submit" loading={pending}><Upload className="h-4 w-4" aria-hidden /> Validar e importar</Button>
      </form>

      {state.error && <Notice tone="error" live>{state.error}</Notice>}

      {state.total !== undefined && !state.error && (
        <section className="sheet space-y-4 p-6" aria-live="polite">
          <h2 className="text-xl">Reporte de importación</h2>
          <p>
            Filas leídas: <strong>{state.total}</strong>. Importadas: <strong>{state.imported}</strong>. Rechazadas: <strong>{state.rejected?.length ?? 0}</strong>.
          </p>
          {!state.committed && (state.rejected?.length ?? 0) > 0 && (
            <Notice tone="warning" title="No se importó ningún registro">
              Corrige las filas indicadas y vuelve a cargar el archivo, o marca la opción para importar solo las filas válidas.
            </Notice>
          )}
          {state.linksCsv && (
            <Notice tone="success" title="Enlaces individuales generados">
              <p className="mb-3">Descarga el archivo ahora. Por seguridad, los enlaces no se vuelven a mostrar: si se pierden, genera enlaces nuevos.</p>
              <Button variant="secondary" onClick={() => download(state.linksCsv!, `enlaces_${stamp}.csv`)}>
                <Download className="h-4 w-4" aria-hidden /> Descargar enlaces (CSV)
              </Button>
            </Notice>
          )}
          {(state.rejected?.length ?? 0) > 0 && (
            <div className="max-h-96 overflow-auto">
              <table className="admin-table">
                <thead><tr><th>Fila</th><th>Cédula</th><th>Motivo</th></tr></thead>
                <tbody>{state.rejected!.map((e) => <tr key={`${e.row}-${e.reason}`}><td>{e.row}</td><td className="tabular-nums">{e.cedula}</td><td>{e.reason}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="sheet space-y-4 p-6">
        <h2 className="text-xl">Enlaces para registros sin enlace vigente</h2>
        <p className="text-sm text-ink-muted">Genera enlaces nuevos para personas pendientes o iniciadas cuyo enlace venció, fue revocado o se perdió.</p>
        <Button variant="secondary" loading={linksPending} onClick={() => start(async () => {
          const r = await issueMissingLinksAction();
          if (r.error) setLinksMsg(r.error);
          else if (!r.count) setLinksMsg("Todos los registros pendientes tienen un enlace vigente.");
          else { download(r.csv!, `enlaces_nuevos_${stamp}.csv`); setLinksMsg(`Se generaron ${r.count} enlaces y se descargó el archivo.`); }
        })}>Generar enlaces faltantes</Button>
        {linksMsg && <Notice live>{linksMsg}</Notice>}
      </section>
    </div>
  );
}
