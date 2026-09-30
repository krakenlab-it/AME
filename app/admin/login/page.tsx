import { redirect } from "next/navigation";
import { MaristaLogo } from "@/components/brand/logos";
import { LoginForm } from "@/components/admin/auth-form";
import { getRepo } from "@/lib/database";
import { getAdminContext } from "@/lib/services/admin-auth";
import { readAdminToken } from "@/lib/server/admin-guard";
import { loginAction } from "../auth-actions";

export const metadata = { title: "Administración | Ingreso" };

export default async function AdminLoginPage() {
  if (await getAdminContext(getRepo(), await readAdminToken())) redirect("/admin");
  return (
    <main id="contenido" className="flex min-h-dvh items-center justify-center bg-marian-soft/40 px-5 py-12">
      <div className="sheet w-full max-w-md space-y-6 p-8">
        <div className="flex items-center gap-3">
          <MaristaLogo className="w-12" />
          <div>
            <h1 className="text-2xl">Panel administrativo</h1>
            <p className="text-sm text-ink-muted">Acceso restringido. Requiere verificación en dos pasos.</p>
          </div>
        </div>
        <LoginForm action={loginAction} />
      </div>
    </main>
  );
}
