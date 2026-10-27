import { InviteStaffForm } from "@/components/admin/invite-staff-form";
import { AdminPage, PageHeader } from "@/components/admin/ui/page-header";
import { SectionCard } from "@/components/admin/ui/section-card";
import { ROLE_LABELS, ROLE_SCOPE } from "@/lib/admin/labels";
import { ADMIN_ROLES } from "@/lib/security/rbac";
import { requireAdmin } from "@/lib/server/admin-guard";

export const metadata = { title: "Invitar personal" };

export default async function InviteStaffPage() {
  await requireAdmin("staff:invite");
  return (
    <AdminPage width="medium">
      <PageHeader
        title="Invitar personal"
        description="Solo un administrador puede crear accesos. La persona confirma el correo, elige su contraseña y activa la verificación del teléfono antes de ver el panel."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <InviteStaffForm />
        <SectionCard id="roles" title="Qué puede hacer cada rol" className="!p-5">
          <dl className="space-y-3 text-sm">
            {ADMIN_ROLES.map((role) => (
              <div key={role}>
                <dt className="font-semibold text-ink">{ROLE_LABELS[role]}</dt>
                <dd className="text-ink-muted">{ROLE_SCOPE[role]}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      </div>
    </AdminPage>
  );
}
