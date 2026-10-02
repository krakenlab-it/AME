"use client";

import { useActionState, useState, useTransition } from "react";
import { Download, Upload } from "lucide-react";
import { importAction, issueMissingLinksAction, sendLinkEmailsAction, type ImportState, type LinkMailState } from "@/app/admin/panel-actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
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

export function ImportPanel({ emailDeliveryReady }: { emailDeliveryReady: boolean }) {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importAction, {});
  const [linksMsg, setLinksMsg] = useState<string | null>(null);
  const [mail, setMail] = useState<LinkMailState | null>(null);
  const [linksPending, startLinks] = useTransition();
  const [mailPending, startMail] = useTransition();
  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <form action={formAction} className="sheet space-y-5 p-6">
        <div className="space-y-1">
          <h2 className="text-xl">1. Cargar base inicial</h2>
          <p className="text-[15px] text-ink-muted">
            Suba un archivo .csv o .xlsx (máximo 5 MB). En cada fila lo único obligatorio es la <strong>cédula</strong> con exactamente 10 dígitos.
            La plantilla recomendada usa las columnas Nombres, Apellidos y Cédula; también aceptamos títulos equivalentes en el archivo.
            Si faltan nombres, la fila se importa igual con la cédula. Un correo opcional en el archivo permite probar el envío por correo en el paso 3; sin correo, igual se genera su enlace personal.
            ¿Necesita un modelo? Descargue la <a className="font-semibold text-marian underline underline-offset-2" href="/templates/initial_people.csv" download>plantilla de ejemplo</a>.
          </p>
        </div>
        <Field id="import-file" label="Archivo de personas" required>
          <input id="import-file" name="file" type="file" accept=".csv,.xlsx" required className="block w-full rounded-xl border border-marian-line bg-white p-2 text-[15px] file:mr-4 file:min-h-[44px] file:cursor-pointer file:rounded-lg file:border-0 file:bg-marian-soft file:px-4 file:font-semibold file:text-marian hover:border-marian" />
        </Field>
        <label className="choice !items-start text-[15px]">
          <input type="checkbox" name="allowPartial" className="mt-0.5 h-5 w-5 shrink-0 accent-marian" />
          <span>Si hay filas con errores, importar solo las válidas. Las rechazadas aparecen en el reporte y no se importan.</span>
        </label>
        <Button type="submit" loading={pending}><Upload className="h-4 w-4" aria-hidden /> {pending ? "Importando…" : "Validar e importar"}</Button>
      </form>

      {state.error && <Notice tone="error" live>{state.error}</Notice>}

      {state.total !== undefined && !state.error && (
        <section className="sheet space-y-4 p-6" aria-live="polite">
          <h2 className="text-xl">{state.noteTitle ?? "Nota de novedades"}</h2>
          <p>{state.noteBody}</p>
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
                <caption className="sr-only">Filas con novedades que no se importaron</caption>
                <thead><tr><th scope="col">Fila</th><th scope="col">Cédula</th><th scope="col">Novedad</th></tr></thead>
                <tbody>{state.rejected!.map((e) => <tr key={`${e.row}-${e.reason}`}><td>{e.row}</td><td className="tabular-nums">{e.cedula}</td><td>{e.reason}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          {(state.notes?.length ?? 0) > 0 && (
            <div className="max-h-96 overflow-auto">
              <table className="admin-table">
                <caption className="sr-only">Observaciones de filas importadas</caption>
                <thead><tr><th scope="col">Fila</th><th scope="col">Cédula</th><th scope="col">Observación</th></tr></thead>
                <tbody>{state.notes!.map((note) => <tr key={`${note.row}-${note.text}`}><td>{note.row}</td><td className="tabular-nums">{note.cedula}</td><td>{note.text}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="sheet space-y-4 p-6">
        <h2 className="text-xl">2. Enlaces para registros sin enlace vigente</h2>
        <p className="text-[15px] text-ink-muted">Genere enlaces nuevos para personas pendientes o iniciadas cuyo enlace venció, fue revocado o se perdió.</p>
        <Button variant="secondary" loading={linksPending} onClick={() => startLinks(async () => {
          const r = await issueMissingLinksAction();
          if (r.error) setLinksMsg(r.error);
          else if (!r.count) setLinksMsg("Todos los registros pendientes tienen un enlace vigente.");
          else { download(r.csv!, `enlaces_nuevos_${stamp}.csv`); setLinksMsg(`Se generaron ${r.count} enlaces y se descargó el archivo.`); }
        })}>Generar enlaces faltantes</Button>
        {linksMsg && <Notice live>{linksMsg}</Notice>}
      </section>

      <section className="sheet space-y-4 p-6">
        <h2 className="text-xl">3. Enlaces personales y envío de prueba por correo</h2>
        <p className="text-[15px] text-ink-muted">
          Genera un <strong>enlace personal nuevo</strong> para cada persona importada en estado pendiente o iniciado, <strong>tenga o no correo</strong> en la base.
          Se descarga un CSV con todos esos enlaces para pruebas en el sandbox. A quienes sí tienen correo registrado (en el archivo o en la ficha) también se les envía el enlace por correo para validar la entrega en esta prueba piloto.
          Si ya tenían un enlace vigente, se renueva antes de mostrarlo o enviarlo. El paso 2 sigue sirviendo para casos puntuales fuera de esta acción masiva.
        </p>
        {!emailDeliveryReady && (
          <Notice tone="info" title="Envío por correo no configurado">
            Sin <code className="text-sm">RESEND_API_KEY</code> y <code className="text-sm">EMAIL_FROM</code> igual puede generar y descargar los enlaces. Configure Resend en Vercel cuando quiera probar el correo real; el botón no se bloquea.
            {mail?.emailFromMissing ? " Falta EMAIL_FROM aunque RESEND_API_KEY está presente." : ""}
          </Notice>
        )}
        <Button variant="secondary" loading={mailPending} onClick={() => startMail(async () => {
          const result = await sendLinkEmailsAction();
          setMail(result);
          if (result.csv) download(result.csv, `enlaces_correo_${stamp}.csv`);
        })}>Generar enlaces y enviar correos de prueba</Button>
        {mail?.error && <Notice tone="error" live>{mail.error}</Notice>}
        {mail && !mail.error && (
          <Notice
            tone={mail.linksPrepared ? (mail.failed && mail.emailConfigured ? "warning" : "success") : "info"}
            live
            title={mail.linksPrepared ? "Enlaces listos" : "Sin personas en este paso"}
          >
            {mail.linksPrepared
              ? `Se prepararon ${mail.linksPrepared} enlace${mail.linksPrepared === 1 ? "" : "s"} (${mail.issuedLinks ?? 0} nuevos, ${mail.renewedLinks ?? 0} renovados). `
              : "No hay personas pendientes o iniciadas para este paso. Importe registros o use el paso 2 si hace falta un enlace puntual. "}
            {mail.emailConfigured
              ? `Correos enviados: ${mail.sent ?? 0}. No entregados: ${mail.failed ?? 0}. Sin correo en la base (solo enlace en CSV): ${mail.skippedNoEmail ?? 0}.`
              : `Correo no enviado (falta configurar Resend). Personas sin correo en la base: ${mail.skippedNoEmail ?? 0}; con correo pendiente de envío cuando configure Resend: ${Math.max(0, (mail.linksPrepared ?? 0) - (mail.skippedNoEmail ?? 0))}.`}
            {mail.csv ? " Se descargó el CSV con los enlaces en claro." : ""}
          </Notice>
        )}
      </section>
    </div>
  );
}
