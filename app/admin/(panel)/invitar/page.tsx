import { InviteStaffForm } from "@/components/admin/invite-staff-form";
import { requireAdmin } from "@/lib/server/admin-guard";

export const metadata = { title: "Invitar personal" };

export default async function InviteStaffPage() {
  await requireAdmin("staff:invite");
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl">Invitar personal</h1>
        <p className="text-ink-muted">
          Solo un administrador puede crear accesos. La persona confirma el correo, elige su contraseña y activa la verificación del teléfono antes de ver el panel.
        </p>
      </header>
      <InviteStaffForm />
    </div>
  );
}
