import { loadPreviewSandboxRepo } from "@/lib/demo/preview-sandbox-store";

export default async function VerificarLayout({ children }: { children: React.ReactNode }) {
  await loadPreviewSandboxRepo();
  return children;
}
