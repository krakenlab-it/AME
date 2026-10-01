import { redirect } from "next/navigation";
import { AdminAuthCard, AdminAuthLink } from "@/components/admin/auth-card";
import { LoginForm } from "@/components/admin/auth-form";
import { DemoAccess } from "@/components/demo/demo-access";
import { Notice } from "@/components/ui/notice";
import { isDemoMode } from "@/lib/demo-mode";
import { readAdminGate, signOutAndClear } from "@/lib/server/admin-guard";
import { supabasePublicConfig } from "@/lib/supabase/public-env";
import { loginAction } from "../auth-actions";

export const metadata = { title: "Administración | Ingreso" };

export default async function AdminLoginPage() {
  const gate = await readAdminGate();
  switch (gate.kind) {
    case "panel":
      redirect("/admin");
    case "mfa_enroll":
    case "mfa_verify":
      redirect("/admin/mfa");
    case "unlinked":
      await signOutAndClear();
      break;
    case "anonymous":
      break;
    default: {
      const unreachable: never = gate;
      return unreachable;
    }
  }

  const configured = isDemoMode() || supabasePublicConfig() !== null;
  return (
    <AdminAuthCard title="Panel administrativo" subtitle="Acceso restringido para personal invitado. Requiere verificación en dos pasos.">
      {!configured && (
        <Notice tone="warning" title="Falta configurar Supabase Auth">
          Agrega NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY. La clave service_role no se usa en el navegador.
        </Notice>
      )}
      <LoginForm action={loginAction} />
      <p className="text-sm text-ink-muted">
        El acceso es solo por invitación. <AdminAuthLink href="/admin/recuperar">Olvidé mi contraseña</AdminAuthLink>
      </p>
      <DemoAccess />
    </AdminAuthCard>
  );
}
