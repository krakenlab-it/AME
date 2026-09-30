import { PageSkeleton } from "@/components/ui/skeleton";

export default function PanelLoading() {
  return <PageSkeleton label="Cargando el panel…" cards={5} />;
}
