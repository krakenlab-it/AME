import { AdminAuthCard, AdminAuthLink } from "@/components/admin/auth-card";
import { ConfirmLink } from "@/components/admin/confirm-link";

export const metadata = { title: "Administración | Confirmar enlace" };

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ConfirmAuthPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return (
    <AdminAuthCard title="Confirmando acceso" subtitle="Un momento mientras abrimos tu enlace.">
      <ConfirmLink tokenHash={one(params.token_hash)} type={one(params.type)} code={one(params.code)} next={one(params.next)} />
      <p className="text-sm">
        <AdminAuthLink href="/admin/login">Volver al ingreso</AdminAuthLink>
      </p>
    </AdminAuthCard>
  );
}
