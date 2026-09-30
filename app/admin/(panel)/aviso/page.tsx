import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { Notice } from "@/components/ui/notice";
import { getRepo } from "@/lib/database";
import { getActivePrivacy } from "@/lib/privacy/active";
import { DEFAULT_NOTICE_TEMPLATE } from "@/lib/privacy/notice";
import { requireAdmin } from "@/lib/server/admin-guard";
import { formatDateTime } from "@/lib/utils";

const NoticeEditor = dynamic(() => import("@/components/admin/notice-editor").then((m) => m.NoticeEditor), {
  loading: () => <Skeleton className="h-[32rem] rounded-2xl" />,
});

export const metadata = { title: "Aviso de privacidad" };

export default async function NoticePage() {
  await requireAdmin("notice:manage");
  const repo = getRepo();
  const [privacy, notices] = await Promise.all([getActivePrivacy(repo), repo.listNotices()]);
  const active = notices.find((n) => n.is_active);
  const { readiness } = privacy;
  const next = (() => {
    const [maj, min] = privacy.version.split(".").map(Number);
    return Number.isFinite(maj) ? `${maj}.${(min || 0) + 1}` : "1.1";
  })();

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-3xl">Aviso de privacidad y revisión legal</h1>
      {readiness.ready ? (
        <Notice tone="success" title="Listo para producción">No hay placeholders pendientes y la revisión legal está aprobada.</Notice>
      ) : (
        <Notice tone={readiness.blockPortal ? "error" : "warning"} title={readiness.blockPortal ? "El portal está bloqueado en producción" : "Pendiente de revisión legal (LEGAL_REVIEW_REQUIRED)"}>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {readiness.placeholders.map((p) => <li key={p}>Completar: <code>{p}</code></li>)}
            {!readiness.approved && <li>Definir <code>LEGAL_REVIEW_APPROVED=true</code> cuando el área legal apruebe los textos.</li>}
          </ul>
          <p className="mt-2 text-sm">Los datos del responsable se configuran con variables de entorno en Vercel (ver README).</p>
        </Notice>
      )}
      <section className="sheet space-y-3 p-6">
        <h2 className="text-xl">Versión vigente: {privacy.version}</h2>
        <p className="text-sm text-ink-muted">{active ? `Publicada el ${formatDateTime(active.created_at)}` : "Texto inicial incluido en el código (config/privacy.ts y lib/privacy/notice.ts)."}</p>
        <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl bg-paper p-4 font-serif text-[15px] leading-relaxed">
          {privacy.text.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </section>
      <NoticeEditor current={active?.body ?? DEFAULT_NOTICE_TEMPLATE} suggestedVersion={next} />
    </div>
  );
}
