import { headers } from "next/headers";
import { LinkIcon } from "lucide-react";
import Link from "next/link";
import { IdentifyPanel } from "@/components/forms/identify-panel";
import { PortalHero } from "@/components/portal/hero";
import { PortalShell, PortalUnavailable } from "@/components/portal/shell";
import { getRepo } from "@/lib/database";
import { getActivePrivacy } from "@/lib/privacy/active";
import { ipHash } from "@/lib/security/request";
import { inspectLink, linkStateMessage } from "@/lib/services/respondent";

export default async function VerifyLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const repo = getRepo();
  const privacy = await getActivePrivacy(repo);
  if (privacy.readiness.blockPortal) return <PortalUnavailable />;

  const state = await inspectLink(repo, token, ipHash(await headers()));

  return (
    <PortalShell readiness={privacy.readiness} organizationName={privacy.config.organizationName}>
      <PortalHero
        action={
          state === "valid" ? (
            <IdentifyPanel token={token} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} />
          ) : (
            <div className="sheet space-y-4 p-6 md:p-8" role="status">
              <LinkIcon className="h-7 w-7 text-marian" aria-hidden />
              <h2 className="text-2xl">Este enlace no está disponible</h2>
              <p className="text-ink-muted">{linkStateMessage(state)}</p>
              {state === "used" && (
                <p>
                  <Link href={`/verificar/${token}/estado`} className="font-semibold text-marian underline-offset-4 hover:underline">
                    Consultar el estado de mi registro
                  </Link>
                </p>
              )}
              <p className="rounded-xl bg-marian-soft/60 px-4 py-3 text-[15px]">
                <span className="font-semibold">¿Necesitas ayuda?</span> Escribe a {privacy.config.supportContact}.
              </p>
            </div>
          )
        }
      />
    </PortalShell>
  );
}
