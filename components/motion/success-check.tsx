"use client";

import * as m from "motion/react-m";

/** Círculo y visto que se dibujan al aparecer. Decorativo. */
export function SuccessCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <m.circle cx="32" cy="32" r="28" className="fill-ok-soft stroke-ok" strokeWidth={3} initial={{ pathLength: 0, scale: 0.9 }} animate={{ pathLength: 1, scale: 1 }} transition={{ duration: 0.6 }} />
      <m.path d="M20 33l8 8 16-17" className="stroke-ok" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.4 }} />
    </svg>
  );
}
