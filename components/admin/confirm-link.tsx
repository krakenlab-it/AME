"use client";

import { useEffect, useState } from "react";
import { adoptSessionAction, confirmLinkAction } from "@/app/admin/auth-actions";
import { Notice } from "@/components/ui/notice";

export function ConfirmLink({ tokenHash, type, code, next }: { tokenHash: string; type: string; code: string; next: string }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (tokenHash || code) {
        const res = await confirmLinkAction({ tokenHash, type, code, next });
        if (cancelled) return;
        if (res.next) {
          window.location.assign(res.next);
          return;
        }
        setError(res.error ?? "El enlace no es válido o ya venció.");
        return;
      }

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token") ?? "";
      const refreshToken = hash.get("refresh_token") ?? "";
      if (!accessToken || !refreshToken) {
        setError("El enlace no es válido o ya venció. Pide una nueva invitación o restablece la contraseña.");
        return;
      }
      const res = await adoptSessionAction({ accessToken, refreshToken, type: hash.get("type") ?? type });
      if (cancelled) return;
      if (res.next) {
        window.location.assign(res.next);
        return;
      }
      setError(res.error ?? "El enlace no es válido o ya venció.");
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [tokenHash, type, code, next]);

  return error ? (
    <Notice tone="error" live>{error}</Notice>
  ) : (
    <p className="text-ink-muted">Confirmando el enlace…</p>
  );
}
