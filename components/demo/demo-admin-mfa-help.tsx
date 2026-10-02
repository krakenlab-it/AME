import { Notice } from "@/components/ui/notice";
import { currentDemoAdminTotpCode, DEMO_ADMIN_MFA_BYPASS_CODE } from "@/lib/demo/admin-sandbox";
import { isDemoMode } from "@/lib/demo-mode";

export function DemoAdminMfaHelp() {
  if (!isDemoMode()) return null;
  const liveCode = currentDemoAdminTotpCode();

  return (
    <Notice tone="info" title="Modo demostración">
      <p className="text-sm">No necesita Google Authenticator. Escriba uno de estos códigos de 6 dígitos:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>
          Código fijo: <strong className="font-mono text-base">{DEMO_ADMIN_MFA_BYPASS_CODE}</strong>
        </li>
        <li>
          Código actual (válido ~30 s): <strong className="font-mono text-base tracking-widest">{liveCode}</strong>
        </li>
      </ul>
    </Notice>
  );
}
