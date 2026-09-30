import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { MfaForm } from "@/components/admin/auth-form";
import { getRepo } from "@/lib/database";
import { otpauthUrl } from "@/lib/security/totp";
import { ensureMfaSecret, getAdminContext } from "@/lib/services/admin-auth";
import { readAdminToken } from "@/lib/server/admin-guard";
import { mfaAction } from "../auth-actions";

export const metadata = { title: "Administración | Verificación en dos pasos" };

export default async function MfaPage() {
  const repo = getRepo();
  const ctx = await getAdminContext(repo, await readAdminToken(), { requireMfa: false });
  if (!ctx) redirect("/admin/login");
  if (ctx.session.mfa_verified) redirect("/admin");

  let enrollment: { qr: string; secret: string } | null = null;
  if (!ctx.admin.mfa_enabled) {
    const secret = await ensureMfaSecret(repo, ctx.admin);
    const qr = await QRCode.toDataURL(otpauthUrl(secret, ctx.admin.email, "Portal AME"), { margin: 1, width: 220 });
    enrollment = { qr, secret };
  }

  return (
    <main id="contenido" className="flex min-h-dvh items-center justify-center bg-marian-soft/40 px-5 py-12">
      <div className="sheet w-full max-w-md space-y-6 p-8">
        <h1 className="text-2xl">Verificación en dos pasos</h1>
        {enrollment ? (
          <div className="space-y-4">
            <p className="text-ink-muted">
              Escanea este código con tu aplicación autenticadora (Google Authenticator, Microsoft Authenticator, 1Password…) y escribe el código que aparece.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrollment.qr} alt="Código QR para configurar la aplicación autenticadora" width={220} height={220} className="mx-auto rounded-lg border border-marian-line" />
            <details className="text-sm">
              <summary className="cursor-pointer text-marian">No puedo escanear el código</summary>
              <p className="mt-2 break-all rounded-lg bg-paper p-3 font-medium">{enrollment.secret}</p>
            </details>
          </div>
        ) : (
          <p className="text-ink-muted">Escribe el código de tu aplicación autenticadora.</p>
        )}
        <MfaForm action={mfaAction} />
      </div>
    </main>
  );
}
