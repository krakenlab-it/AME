import { PageFade } from "@/components/motion/primitives";

export default function RespondentTemplate({ children }: { children: React.ReactNode }) {
  return <PageFade>{children}</PageFade>;
}
