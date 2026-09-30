import { redirect } from "next/navigation";
import { AdminAuthCard, AdminAuthLink } from "@/components/admin/auth-card";
import { SetPasswordForm } from "@/components/admin/auth-form";
import { readAdminGate, signOutAndClear } from "@/lib/server/admin-guard";
import { setPasswordAction } from "../auth-actions";

export const metadata = { title: "Administración | Crear acceso" };

export default async function InviteSignupPage() {
  const gate = await readAdminGate();
  switch (gate.kind) {
    case "anonymous":
    case "unlinked":
      if (gate.kind === "unlinked") await signOutAndClear();
      redirect("/admin/login");
    case "panel":
      redirect("/admin");
    case "mfa_enroll":
    case "mfa_verify":
      break;
    default: {
      const unreachable: never = gate;
      return unreachable;
    }
  }

  return (
    <AdminAuthCard title="Crear tu acceso" subtitle="Este panel es solo por invitación. Elige la contraseña de tu cuenta.">
      <SetPasswordForm action={setPasswordAction} submitLabel="Guardar y continuar" />
      <p className="text-sm">
        <AdminAuthLink href="/admin/login">Ya tengo contraseña</AdminAuthLink>
      </p>
    </AdminAuthCard>
  );
}
