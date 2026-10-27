import { redirect } from "next/navigation";
import { AdminAuthBackToLogin, AdminAuthCard, AdminAuthLink } from "@/components/admin/auth-card";
import { SetPasswordForm } from "@/components/admin/auth-form";
import { readAdminGate, signOutAndClear } from "@/lib/server/admin-guard";
import { setPasswordAction } from "../auth-actions";

export const metadata = { title: "Administración | Nueva contraseña" };

export default async function ResetPasswordPage() {
  const gate = await readAdminGate();
  const forced = gate.kind === "password_change";
  const requireTotp = gate.kind === "mfa_verify";
  switch (gate.kind) {
    case "anonymous":
    case "unlinked":
      if (gate.kind === "unlinked") await signOutAndClear();
      redirect("/admin/login");
    case "panel":
      redirect("/admin");
    case "mfa_enroll":
    case "mfa_verify":
    case "password_change":
      break;
    default: {
      const unreachable: never = gate;
      return unreachable;
    }
  }

  return (
    <AdminAuthCard
      title="Nueva contraseña"
      subtitle={
        forced
          ? "Antes de entrar al panel tienes que elegir una contraseña nueva, distinta a la anterior."
          : "Elija una contraseña distinta a la anterior."
      }
    >
      <SetPasswordForm action={setPasswordAction} submitLabel="Guardar contraseña" requireTotp={requireTotp} />
      <p className="text-sm">
        <AdminAuthLink href="/admin/recuperar">Pedir otro enlace</AdminAuthLink>
      </p>
      <AdminAuthBackToLogin clearSession />
    </AdminAuthCard>
  );
}
