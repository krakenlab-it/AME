import { ShieldCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { DEMO_ADMIN_CREDENTIALS, DEMO_ADMIN_MFA_BYPASS_CODE } from "@/lib/demo/admin-sandbox";
import { isDemoMode } from "@/lib/demo-mode";

/** Credenciales y acceso directo al panel en sandbox (Preview / DEMO_MODE). */
export function DemoAdminCredentials() {
  if (!isDemoMode()) return null;

  return (
    <Notice tone="info" title="Acceso de prueba (administrador)">
      <p className="text-sm">
        Use el botón de un clic o copie estos datos. En verificación en dos pasos, escriba{" "}
        <strong className="font-mono">{DEMO_ADMIN_MFA_BYPASS_CODE}</strong> o el código que se muestra en pantalla.
      </p>
      <dl className="mt-3 grid gap-1 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-semibold">Correo</dt>
          <dd className="select-all font-mono">{DEMO_ADMIN_CREDENTIALS.email}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-semibold">Contraseña</dt>
          <dd className="select-all font-mono">{DEMO_ADMIN_CREDENTIALS.password}</dd>
        </div>
      </dl>
      <ButtonLink href="/demo/entrar?destino=admin" prefetch={false} size="sm" block className="mt-4 justify-start">
        <ShieldCheck className="h-4 w-4" aria-hidden />
        Entrar como administrador (un clic)
      </ButtonLink>
    </Notice>
  );
}
