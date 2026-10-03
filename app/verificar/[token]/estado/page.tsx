import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LinkIcon } from "lucide-react";
import Link from "next/link";
import {
  PREVIEW_OUTREACH_LEGACY_RAW_TOKEN,
  PREVIEW_OUTREACH_RAW_TOKEN,
  normalizePreviewDemoToken,
} from "@/lib/demo/preview-outreach-tokens";
import { ReopenPanel } from "@/components/forms/reopen-panel";
import { PortalShell, PortalUnavailable } from "@/components/portal/shell";
import { getRepo } from "@/lib/database";
import { getActivePrivacy } from "@/lib/privacy/active";
import { ipHash } from "@/lib/security/request";
import { inspectLink, linkStateMessage } from "@/lib/services/respondent";

export default async function ReopenAccountPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = normalizePreviewDemoToken(rawToken);
  if (token === PREVIEW_OUTREACH_LEGACY_RAW_TOKEN) redirect(`/verificar/${PREVIEW_OUTREACH_RAW_TOKEN}/estado`);
  const repo = getRepo();
  const privacy = await getActivePrivacy(repo);
  if (privacy.readiness.blockPortal) return <PortalUnavailable />;

  const state = await inspectLink(repo, token, ipHash(await headers()));
  const allowed = state === "valid" || state === "used";

  return (
    <PortalShell readiness={privacy.readiness} organizationName={privacy.config.organizationName}>
      <div className="mx-auto max-w-xl px-5 py-10 md:py-14">
        {allowed ? (
          <ReopenPanel token={token} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} />
        ) : (
          <div className="sheet space-y-4 p-6 md:p-8" role="status">
            <LinkIcon className="h-7 w-7 text-marian" aria-hidden />
            <h1 className="text-2xl">Este enlace no está disponible</h1>
            <p className="text-ink-muted">{linkStateMessage(state)}</p>
            <p className="rounded-xl bg-marian-soft/60 px-4 py-3 text-[15px]">
              <span className="font-semibold">¿Necesitas ayuda?</span> Escribe a {privacy.config.supportContact}.
            </p>
            <p>
              <Link href="/" className="font-semibold text-marian underline underline-offset-4 hover:underline">
                Volver al inicio
              </Link>
            </p>
          </div>
        )}
      </div>
    </PortalShell>
  );
}
