import { Bell, FileText, Lock, LogOut } from "lucide-react";
import Link from "next/link";
import { leaveAccountAction } from "@/app/mi-cuenta/actions";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { InsuredHomeView } from "@/lib/services/insured-home";
import { formatDateTime } from "@/lib/utils";

export function InsuredLocked({ supportContact }: { supportContact: string }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 px-5 py-16">
      <h1 className="text-3xl">Tu cuenta no está abierta</h1>
      <Notice tone="warning" title="Hace falta tu enlace personal">
        Por seguridad no se puede buscar un registro por nombre o cédula. Abre el enlace que recibiste por correo o mensaje. Si ya enviaste tus datos, desde ese enlace puedes consultar el estado.
      </Notice>
      <p className="text-ink-muted">Si el enlace ya no funciona, escribe a {supportContact}.</p>
    </div>
  );
}

export function InsuredDashboard({ home, supportContact }: { home: InsuredHomeView; supportContact: string }) {
  const greeting = home.firstNames.split(" ")[0] ?? home.firstNames;
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-5 py-8 md:py-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-marian">Mi cuenta</p>
          <h1 className="text-3xl md:text-4xl">Hola, {greeting}</h1>
          <p className="text-ink-muted">{home.firstNames} {home.lastNames}</p>
        </div>
        <StatusBadge status={home.status} />
      </header>

      <nav aria-label="Mi cuenta" className="flex flex-wrap gap-2">
        <a href="#avisos" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-marian-soft px-4 text-sm font-semibold text-marian">
          <Bell className="h-4 w-4" aria-hidden />Avisos
        </a>
        <a href="#registro" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-marian-soft px-4 text-sm font-semibold text-marian">
          <FileText className="h-4 w-4" aria-hidden />Mi registro
        </a>
        <Link href="/privacidad" className="inline-flex min-h-11 items-center rounded-full bg-marian-soft px-4 text-sm font-semibold text-marian">
          Privacidad
        </Link>
        <form action={leaveAccountAction}>
          <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-ink-muted hover:bg-marian-soft hover:text-marian">
            <LogOut className="h-4 w-4" aria-hidden />Cerrar sesión
          </button>
        </form>
      </nav>

      {home.editable ? (
        <div className="sheet space-y-4 p-5 md:p-6">
          <h2 className="text-xl">Puedes continuar la actualización</h2>
          <p className="text-ink-muted">Tu enlace sigue vigente. El formulario guarda el envío solo al final.</p>
          <Link href="/verificar/formulario" className="inline-flex min-h-[52px] items-center justify-center rounded-xl bg-marian px-6 text-[16px] font-semibold text-white hover:bg-marian-deep">
            Continuar la actualización
          </Link>
        </div>
      ) : (
        <Notice tone="info" title="Registro en consulta">
          Esta vista es de lectura. Para corregir datos después del envío hay que pedir un enlace nuevo.
        </Notice>
      )}

      <section id="avisos" aria-labelledby="avisos-titulo" className="space-y-3">
        <h2 id="avisos-titulo" className="text-2xl">Avisos</h2>
        {home.notifications.length === 0 ? (
          <p className="text-ink-muted">No hay avisos por ahora.</p>
        ) : (
          <ul className="space-y-3">
            {home.notifications.map((item) => (
              <li key={item.id}>
                <Notice tone={item.tone} title={item.title}>{item.body}</Notice>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-ink-muted">
          Los avisos se muestran aquí. El envío por correo o WhatsApp no está incluido en esta versión.
        </p>
      </section>

      <section id="registro" aria-labelledby="registro-titulo" className="space-y-4">
        <h2 id="registro-titulo" className="text-2xl">Mi registro</h2>
        <div className="sheet space-y-2 p-5 md:p-6">
          <p className="text-sm text-ink-muted">Número de confirmación</p>
          <p className="break-all font-serif text-2xl font-semibold tracking-[0.06em] text-marian">{home.confirmationCode ?? "Aún no hay número"}</p>
          <p className="text-[15px] text-ink-muted">Enviado: {formatDateTime(home.submittedAt)}</p>
          <p className="text-[15px]">Estado: <span className="font-semibold">{home.statusLabel}</span></p>
          <p className="text-[15px] text-ink-muted">Cédula: {home.cedulaMasked}</p>
        </div>

        {!home.submittedAt && !home.contact && !home.bank ? (
          <div className="sheet space-y-2 p-5 md:p-6">
            <h3 className="text-lg">Todavía no hay un envío</h3>
            <p className="text-ink-muted">Cuando termines el formulario verás aquí un resumen sin datos sensibles y tu número AIG.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <article className="sheet space-y-2 p-5">
              <h3 className="text-lg">Contacto</h3>
              {home.contact ? (
                <dl className="space-y-2 text-[15px]">
                  <Row label="Correo" value={home.contact.email || "—"} />
                  <Row label="Correo alternativo" value={home.contact.altEmail || "—"} />
                  <Row label="Celular" value={home.contact.phone || "—"} />
                  <Row label="Lugar" value={home.contact.place || "—"} />
                </dl>
              ) : <p className="text-ink-muted">Sin datos de contacto todavía.</p>}
            </article>
            <article className="sheet space-y-2 p-5">
              <h3 className="text-lg">Cuenta para reembolsos</h3>
              {home.bank ? (
                <dl className="space-y-2 text-[15px]">
                  <Row label="Institución" value={home.bank.institution} />
                  <Row label="Tipo" value={home.bank.accountType} />
                  <Row label="Cuenta" value={home.bank.accountMasked} />
                  <Row label="Titularidad" value={home.bank.ownership} />
                </dl>
              ) : <p className="text-ink-muted">Sin datos bancarios todavía.</p>}
            </article>
          </div>
        )}
        <p className="flex items-start gap-2 text-sm text-ink-muted">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-marian" aria-hidden />
          La cédula, la calle y el número de cuenta no se muestran completos. Si necesitas ayuda, escribe a {supportContact}.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-medium sm:text-right">{value}</dd>
    </div>
  );
}

export function InsuredMissingRecord({ supportContact }: { supportContact: string }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 px-5 py-16">
      <h1 className="text-3xl">No encontramos tu registro</h1>
      <Notice tone="warning">La sesión no corresponde a un registro activo. Vuelve a abrir tu enlace personal.</Notice>
      <p className="text-ink-muted">Puedes escribir a {supportContact}.</p>
      <form action={leaveAccountAction}>
        <Button type="submit" variant="secondary">Cerrar sesión</Button>
      </form>
    </div>
  );
}
