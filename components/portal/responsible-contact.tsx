import { RESPONSIBLE_CONTACT } from "@/lib/content/responsible-contact";

/** RUC, teléfono y correo del responsable. El título se usa en las páginas legales. */
export function ResponsibleContact({ heading = false }: { heading?: boolean }) {
  const { ruc, phoneDisplay, phoneHref, email } = RESPONSIBLE_CONTACT;
  return (
    <section className="space-y-3" aria-label="Contacto del responsable del tratamiento">
      {heading ? <h2 className="text-2xl">Contacto del responsable del tratamiento</h2> : null}
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
        <div>
          <dt className="text-sm text-ink-muted">RUC</dt>
          <dd className="font-medium tabular-nums">{ruc}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">Teléfono</dt>
          <dd className="font-medium">
            <a className="text-marian underline-offset-4 hover:underline" href={phoneHref}>{phoneDisplay}</a>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">Correo</dt>
          <dd className="font-medium">
            <a className="text-marian underline-offset-4 hover:underline" href={`mailto:${email}`}>{email}</a>
          </dd>
        </div>
      </dl>
    </section>
  );
}
