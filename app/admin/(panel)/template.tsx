import { PageFade } from "@/components/motion/primitives";

export default function PanelTemplate({ children }: { children: React.ReactNode }) {
  return <PageFade>{children}</PageFade>;
}
