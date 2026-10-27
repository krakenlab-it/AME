"use client";

import { startTransition, useActionState, useRef, useState, useTransition } from "react";
import { Check, Download, Upload } from "lucide-react";
import {
  generatePersonalLinksAction,
  importAction,
  importFingerprintAction,
  issueMissingLinksAction,
  simulateOutreachLinkAction,
  type FingerprintImportState,
  type ImportState,
} from "@/app/admin/panel-actions";
import { ImportBaseCopy } from "@/components/admin/import-base-copy";
import { SectionCard } from "@/components/admin/ui/section-card";
import { TableShell } from "@/components/admin/ui/table-shell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { importRowAdvice } from "@/lib/admin/import-advice";
import { cn } from "@/lib/utils";

function download(csv: string, name: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const FILE_INPUT_CLASS =
  "block w-full rounded-xl border border-dashed border-marian/50 bg-marian-soft/30 p-3 text-[15px] file:mr-4 file:min-h-[44px] file:cursor-pointer file:rounded-lg file:border-0 file:bg-marian file:px-4 file:font-semibold file:text-white hover:border-marian";

function StepNumber({ n }: { n: number }) {
  return <span className="text-marian">{n}. </span>;
}

/** Los tres pasos de la carga inicial, según lo que ya se hizo. */
function Stepper({ done }: { done: number }) {
  const steps = ["Elegir el archivo", "Revisar la vista previa", "Confirmar la importación"];
  return (
    <ol aria-label="Pasos de la carga" className="grid gap-2 sm:grid-cols-3">
      {steps.map((label, index) => {
        const complete = index < done;
        const current = index === done;
        return (
          <li
            key={label}
            aria-current={current ? "step" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium",
              complete ? "border-ok/40 bg-ok-soft text-ok" : current ? "border-marian bg-marian-soft text-marian" : "border-marian-line bg-white text-ink-muted",
            )}
          >
            <span aria-hidden className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold", complete ? "bg-ok text-white" : current ? "bg-marian text-white" : "bg-marian-soft text-ink-muted")}>
              {complete ? <Check className="h-4 w-4" /> : index + 1}
            </span>
            <span>{label}{complete && <span className="sr-only"> (hecho)</span>}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "neutral" | "ok" | "alert" }) {
  return (
    <div className={cn("rounded-xl border px-4 py-3", tone === "ok" && "border-ok/30 bg-ok-soft", tone === "alert" && "border-alert/30 bg-alert-soft", tone === "neutral" && "border-marian-line bg-marian-soft/40")}>
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <p className="font-serif text-3xl font-semibold tabular-nums text-ink">{value.toLocaleString("es-EC")}</p>
    </div>
  );
}

function NoveltyTable({ caption, reasonHeader, rows }: { caption: string; reasonHeader: string; rows: { row: number; cedula: string; text: string }[] }) {
  return (
    <TableShell label={caption} className="max-h-96">
      <table className="admin-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Fila</th>
            <th scope="col">Cédula</th>
            <th scope="col">{reasonHeader}</th>
            <th scope="col">Qué hacer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={`${e.row}-${e.text}`} className="align-top">
              <td className="tabular-nums">{e.row}</td>
              <td className="tabular-nums">{e.cedula}</td>
              <td>{e.text}</td>
              <td className="text-ink-muted">{importRowAdvice(e.text)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

export function ImportPanel({ outreachSimulation = false }: { outreachSimulation?: boolean }) {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importAction, {});
  const importForm = useRef<HTMLFormElement>(null);
  const [finger, fingerAction, fingerPending] = useActionState<FingerprintImportState, FormData>(importFingerprintAction, {});
  const [linksMsg, setLinksMsg] = useState<string | null>(null);
  const [personalLinksMsg, setPersonalLinksMsg] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<{ sent?: boolean; url?: string; recipient?: string; error?: string } | null>(null);
  const [linksPending, startLinks] = useTransition();
  const [personalPending, startPersonal] = useTransition();
  const [simPending, startSim] = useTransition();
  const stamp = new Date().toISOString().slice(0, 10);
  const [fileName, setFileName] = useState("");
  const stepsDone = state.committed ? 3 : state.preview ? 2 : fileName ? 1 : 0;
  const rejected = state.rejected ?? [];
  const notes = state.notes ?? [];

  return (
    <div className="space-y-6">
      <SectionCard id="cargar-base" title={<><StepNumber n={1} />Cargar base inicial</>} description={<ImportBaseCopy />}>
        <form ref={importForm} className="space-y-5" onSubmit={(event) => event.preventDefault()}>
          <Stepper done={stepsDone} />
          <Field id="import-file" label="Archivo de personas" required hint="Formato .csv o .xlsx, hasta 5 MB.">
            <input
              id="import-file"
              name="file"
              type="file"
              accept=".csv,.xlsx"
              required
              aria-describedby="import-file-hint"
              className={FILE_INPUT_CLASS}
              onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
            />
          </Field>
          <label className="choice !items-start text-[15px]">
            <input type="checkbox" name="allowPartial" className="mt-0.5 h-5 w-5 shrink-0 accent-marian" />
            <span>
              <span className="block font-semibold">Importar solo las filas válidas</span>
              <span className="block text-ink-muted">Si hay filas con errores, las demás se importan igual. Las rechazadas aparecen en el reporte y no se importan.</span>
            </span>
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" loading={pending} onClick={() => {
              if (!importForm.current) return;
              const data = new FormData(importForm.current);
              data.set("intent", "preview");
              startTransition(() => formAction(data));
            }}><Upload className="h-4 w-4" aria-hidden /> {pending ? "Revisando…" : "Vista previa"}</Button>
            <Button type="button" loading={pending} disabled={!state.preview} onClick={() => {
              if (!importForm.current) return;
              const data = new FormData(importForm.current);
              data.set("intent", "commit");
              startTransition(() => formAction(data));
            }}>Confirmar importación</Button>
          </div>
          {!state.preview && !state.committed && (
            <p className="text-sm text-ink-muted">Primero revisa la vista previa: no se guarda nada hasta que confirmes.</p>
          )}
          {state.preview && (
            <p className="text-[15px] text-ink-muted">
              Vista previa: {state.contacts ?? 0} contactos ({state.withEmail ?? 0} con correo), {state.imported ?? 0} personas con cédula, {rejected.length} fallos. Nada se ha guardado todavía.
            </p>
          )}
        </form>
      </SectionCard>

      {state.error && <Notice tone="error" live>{state.error}</Notice>}

      {state.total !== undefined && !state.error && (
        <SectionCard id="resultado-carga" title={state.noteTitle ?? "Nota de novedades"} description={state.noteBody}>
          <div aria-live="polite" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Filas leídas" value={state.total} tone="neutral" />
              <Stat label={state.committed ? "Importadas" : "Se importarían"} value={state.imported ?? 0} tone="ok" />
              <Stat label="Rechazadas" value={rejected.length} tone={rejected.length ? "alert" : "neutral"} />
            </div>
            <p className="sr-only">
              Filas leídas: {state.total}. Importadas: {state.imported}. Rechazadas: {rejected.length}.
            </p>
            {!state.committed && rejected.length > 0 && (
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
            {rejected.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold">Filas que no se importan ({rejected.length})</h3>
                <NoveltyTable caption="Filas con novedades que no se importaron" reasonHeader="Novedad" rows={rejected.map((e) => ({ row: e.row, cedula: e.cedula, text: e.reason }))} />
              </div>
            )}
            {notes.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold">Observaciones ({notes.length})</h3>
                <NoveltyTable caption="Observaciones de filas importadas" reasonHeader="Observación" rows={notes.map((n) => ({ row: n.row, cedula: n.cedula, text: n.text }))} />
              </div>
            )}
          </div>
        </SectionCard>
      )}

      <SectionCard id="enlaces-faltantes" title={<><StepNumber n={2} />Enlaces para registros sin enlace vigente</>} description="Genere enlaces nuevos para personas pendientes o iniciadas cuyo enlace venció, fue revocado o se perdió.">
        <Button variant="secondary" loading={linksPending} onClick={() => startLinks(async () => {
          const r = await issueMissingLinksAction();
          if (r.error) setLinksMsg(r.error);
          else if (!r.count) setLinksMsg("Todos los registros pendientes tienen un enlace vigente.");
          else { download(r.csv!, `enlaces_nuevos_${stamp}.csv`); setLinksMsg(`Se generaron ${r.count} enlaces y se descargó el archivo.`); }
        })}>Generar enlaces faltantes</Button>
        {linksMsg && <Notice live>{linksMsg}</Notice>}
      </SectionCard>

      <SectionCard id="enlaces-completar" title={<><StepNumber n={3} />Enlace para completar datos</>} description="Un archivo con el enlace personal de cada persona importada, para enviarlo por el canal que prefieras.">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" loading={personalPending} onClick={() => startPersonal(async () => {
            setPersonalLinksMsg(null);
            const r = await generatePersonalLinksAction();
            if (r.error) setPersonalLinksMsg(r.error);
            else if (!r.count) setPersonalLinksMsg("No hay registros válidos importados.");
            else download(r.csv!, `enlaces_completar_datos_${stamp}.csv`);
          })}>Generar y descargar enlaces</Button>
          {outreachSimulation && (
            <Button variant="secondary" loading={simPending} onClick={() => startSim(async () => {
              const r = await simulateOutreachLinkAction();
              if (r.error) setSimulation({ error: r.error });
              else setSimulation({ sent: r.sent, url: r.url, recipient: r.recipient });
            })}>Simular envío del enlace</Button>
          )}
        </div>
        {personalLinksMsg && <Notice live>{personalLinksMsg}</Notice>}
        {outreachSimulation && simulation && !simulation.error && (
          <Notice live title="Simulación de envío">
            <p>Destinatario: {simulation.recipient}</p>
            <p className="break-all font-mono text-sm">{simulation.url}</p>
            <p>{simulation.sent ? "Correo enviado." : "Correo no configurado en Preview; use el enlace de arriba."}</p>
          </Notice>
        )}
        {outreachSimulation && simulation?.error && <Notice live>{simulation.error}</Notice>}
      </SectionCard>

      <SectionCard
        id="codigos-dactilares"
        title={<><StepNumber n={4} />Precargar códigos dactilares</>}
        description={
          <>
            Este archivo no es obligatorio para cargar personas. Al entrar, cada cédula tiene que escribir su código: letra, 4 números, letra, 4 números (ej. V1234V1234). El primero válido se guarda. Si ya hay uno, tiene que coincidir.
            Un pasaporte no trae ese código; esas filas no se cargan. Columnas <code>cedula</code> y <code>codigo_dactilar</code>. El código no se guarda ni se muestra en claro.
            Si ya hay uno distinto, no se cambia: hay que restablecerlo desde la ficha.
            Plantilla: <a className="font-semibold text-marian underline underline-offset-2" href="/templates/codigo_dactilar.csv" download>ejemplo.csv</a>.
          </>
        }
      >
        <form action={fingerAction} className="space-y-5">
          <Field id="fingerprint-file" label="Archivo de códigos" required hint="Formato .csv o .xlsx.">
            <input
              id="fingerprint-file"
              name="file"
              type="file"
              accept=".csv,.xlsx"
              required
              aria-describedby="fingerprint-file-hint"
              className={FILE_INPUT_CLASS}
            />
          </Field>
          <Button type="submit" variant="secondary" loading={fingerPending}><Upload className="h-4 w-4" aria-hidden /> {fingerPending ? "Cargando…" : "Cargar códigos"}</Button>
          {finger.error && <Notice tone="error" live>{finger.error}</Notice>}
          {finger.total !== undefined && !finger.error && (
            <Notice tone="success" live title="Carga de códigos">
              Filas: {finger.total}. Actualizadas: {finger.updated}. Ya iguales: {finger.unchanged}. No encontradas: {finger.notFound}. Formato no válido: {finger.invalid}. Duplicadas: {finger.duplicates}. Con otro código (sin cambio): {finger.conflicts}.
            </Notice>
          )}
        </form>
      </SectionCard>
    </div>
  );
}
