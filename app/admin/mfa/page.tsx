import { redirect } from "next/navigation";
import { MfaForm } from "@/components/admin/auth-form";
import { Notice } from "@/components/ui/notice";
import { getMfaScreen } from "@/lib/server/mfa-screen";
import { mfaAction } from "../auth-actions";

export const metadata = { title: "Administración | Verificación en dos pasos" };

export default async function MfaPage() {
  const screen = await getMfaScreen();
  if ("redirectTo" in screen) redirect(screen.redirectTo);

  return (
    <main id="contenido" className="flex min-h-dvh items-center justify-center bg-marian-soft/40 px-5 py-12">
      <div className="sheet w-full max-w-md space-y-6 p-8">
        <h1 className="text-2xl">Verificación en dos pasos</h1>
        {screen.mode === "error" && <Notice tone="error">{screen.message}</Notice>}
        {screen.mode === "enroll" && (
          <div className="space-y-4">
            <p className="text-ink-muted">
              En el teléfono, abre tu aplicación autenticadora (Google Authenticator, Microsoft Authenticator, 1Password…) y escanea este código. Luego escribe el código de 6 dígitos.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={screen.qr} alt="Código QR para configurar la aplicación autenticadora del teléfono" width={220} height={220} className="mx-auto rounded-lg border border-marian-line" />
            <details className="text-sm">
              <summary className="cursor-pointer text-marian">No puedo escanear el código</summary>
              <p className="mt-2 break-all rounded-lg bg-paper p-3 font-medium">{screen.secret}</p>
            </details>
          </div>
        )}
        {screen.mode === "verify" && <p className="text-ink-muted">Escribe el código de la aplicación autenticadora de tu teléfono.</p>}
        {screen.mode !== "error" && <MfaForm action={mfaAction} factorId={screen.mode === "enroll" ? screen.factorId : undefined} />}
      </div>
    </main>
  );
}
