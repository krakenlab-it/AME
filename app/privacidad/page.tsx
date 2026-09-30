import { PortalShell, PortalUnavailable } from "@/components/portal/shell";
import { getRepo } from "@/lib/database";
import { getActivePrivacy } from "@/lib/privacy/active";

export const metadata = { title: "Privacidad y protección de datos" };

const RIGHTS = [
  ["Acceso", "conocer qué datos personales suyos tratamos y cómo los tratamos."],
  ["Rectificación y actualización", "corregir datos inexactos o incompletos."],
  ["Eliminación", "solicitar la eliminación de sus datos cuando corresponda."],
  ["Oposición", "oponerse a determinados tratamientos en los casos previstos por la ley."],
  ["Suspensión del tratamiento", "solicitar que el tratamiento se suspenda en los supuestos aplicables."],
  ["Portabilidad", "recibir sus datos en un formato estructurado, cuando resulte aplicable."],
  ["Revocación del consentimiento", "retirar su consentimiento cuando el tratamiento dependa de él, sin efectos retroactivos."],
];

export default async function PrivacyPage() {
  const privacy = await getActivePrivacy(getRepo());
  if (privacy.readiness.blockPortal) return <PortalUnavailable />;
  const { config } = privacy;
  const rows: [string, string][] = [
    ["Responsable del tratamiento", config.responsibleLegalName],
    ["RUC", config.responsibleRuc],
    ["Dirección", config.responsibleAddress],
    ["Correo para privacidad y protección de datos", config.privacyEmail],
    ["Teléfono", config.privacyPhone],
    ...(config.dataProtectionOfficer ? [["Delegado de Protección de Datos", config.dataProtectionOfficer] as [string, string]] : []),
    ["Destinatario de la información", config.recipientLegalName],
    ["Versión del aviso", privacy.version],
    ["Vigente desde", privacy.effectiveDate],
  ];

  return (
    <PortalShell readiness={privacy.readiness} organizationName={config.organizationName}>
      <article className="mx-auto max-w-[70ch] space-y-10 px-5 py-10 md:py-14">
        <header className="space-y-3">
          <h1 className="text-[34px] leading-tight">Privacidad y protección de datos</h1>
          <p className="text-ink-muted">
            Los datos personales se tratan conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador (LOPDP), publicada en el
            Quinto Suplemento del Registro Oficial No. 459, de 26 de mayo de 2021, y su Reglamento General, expedido mediante Decreto Ejecutivo No. 904.
          </p>
        </header>

        <section id="aviso" className="space-y-4 scroll-mt-6">
          <h2 className="text-2xl">Aviso de Privacidad</h2>
          <div className="space-y-4 font-serif text-[17px] leading-[1.75]">
            {privacy.text.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl">Principios que aplicamos</h2>
          <p>
            El portal se diseñó siguiendo los principios de juridicidad, lealtad, transparencia, finalidad, pertinencia y minimización,
            proporcionalidad, confidencialidad, calidad y exactitud, conservación, seguridad y responsabilidad proactiva.
            Solo recopilamos los datos necesarios para las finalidades indicadas, no mostramos listas de personas, no usamos rastreadores
            publicitarios y los datos bancarios se guardan cifrados.
          </p>
        </section>

        <section id="derechos" className="space-y-4 scroll-mt-6">
          <h2 className="text-2xl">Sus derechos</h2>
          <p>Usted podrá ejercer los derechos que le reconozca la normativa ecuatoriana aplicable, incluyendo, según corresponda:</p>
          <dl className="divide-y divide-marian-line/70 rounded-xl border border-marian-line/70 bg-white">
            {RIGHTS.map(([k, v]) => (
              <div key={k} className="px-5 py-3">
                <dt className="font-semibold">{k}</dt>
                <dd className="text-ink-muted">Derecho a {v}</dd>
              </div>
            ))}
          </dl>
          <p>
            Para ejercer sus derechos relacionados con sus datos personales puede comunicarse a:{" "}
            <span className="font-semibold text-marian">{config.privacyEmail}</span>
          </p>
        </section>

        <section id="conservacion" className="space-y-3">
          <h2 className="text-2xl">Conservación</h2>
          <p>
            Plazo de conservación: {config.retentionPeriod}. Motivo: {config.retention.reason}. Cumplida la finalidad y los plazos legales o
            contractuales aplicables, los datos se bloquean, eliminan o anonimizan, según corresponda.
          </p>
        </section>

        <section id="contacto" className="space-y-4 scroll-mt-6">
          <h2 className="text-2xl">Contacto</h2>
          <dl className="grid gap-x-6 gap-y-3 rounded-xl bg-marian-soft/50 px-5 py-4 sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-sm text-ink-muted">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </article>
    </PortalShell>
  );
}
