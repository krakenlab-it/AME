"use client";

import { animate, useInView, useReducedMotion, type Variants } from "motion/react";
import * as m from "motion/react-m";
import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const rise: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

/** Aparece suavemente al montarse (o al entrar en pantalla si `onScroll`). */
export function Reveal({ children, className, delay = 0, onScroll }: { children: ReactNode; className?: string; delay?: number; onScroll?: boolean }) {
  const common = { className, variants: rise, initial: "hidden", transition: { delay } } as const;
  return onScroll ? (
    <m.div {...common} whileInView="show" viewport={{ once: true, margin: "-40px" }}>{children}</m.div>
  ) : (
    <m.div {...common} animate="show">{children}</m.div>
  );
}

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

export function Stagger({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "ul" | "ol" }) {
  const Tag = m[as];
  return <Tag className={className} variants={container} initial="hidden" animate="show">{children}</Tag>;
}

export function StaggerItem({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" | "section" }) {
  const Tag = m[as] as ElementType;
  return <Tag className={className} variants={rise}>{children}</Tag>;
}

/** Transición de página: entra con un fundido corto. Se usa desde template.tsx para reiniciarse en cada navegación. */
export function PageFade({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <m.div className={className} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
      {children}
    </m.div>
  );
}

/** Número que cuenta hasta su valor al aparecer. */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (!inView || reduce) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, { duration: 0.8, ease: "easeOut", onUpdate: (v) => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [inView, reduce, value]);

  return <span ref={ref} className={cn("tabular-nums", className)}>{shown.toLocaleString("es-EC")}</span>;
}

/** Barra de avance con ancho animado. Es decorativa: el valor ya está en texto. */
export function Meter({ percent, label, className }: { percent: number; label: string; className?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped)} className={cn("h-2.5 overflow-hidden rounded-full bg-marian-soft", className)}>
      <m.div className="h-full rounded-full bg-marian" initial={{ width: 0 }} animate={{ width: `${clamped}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
    </div>
  );
}
