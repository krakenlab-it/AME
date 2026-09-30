import { AdminAuthCard, AdminAuthLink } from "@/components/admin/auth-card";
import { ResetRequestForm } from "@/components/admin/auth-form";
import { requestResetAction } from "../auth-actions";

export const metadata = { title: "Administración | Restablecer contraseña" };

export default function ResetRequestPage() {
  return (
    <AdminAuthCard title="Restablecer contraseña" subtitle="Te enviaremos un enlace si ese correo tiene acceso al panel.">
      <ResetRequestForm action={requestResetAction} />
      <p className="text-sm">
        <AdminAuthLink href="/admin/login">Volver al ingreso</AdminAuthLink>
      </p>
    </AdminAuthCard>
  );
}
