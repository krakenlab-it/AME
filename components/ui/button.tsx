import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-marian text-white hover:bg-marian-deep active:bg-marian-deep disabled:bg-ink-faint",
  secondary: "border border-marian/40 bg-white text-marian hover:border-marian hover:bg-marian-soft/60",
  ghost: "text-marian hover:bg-marian-soft/70",
  danger: "border border-alert/40 bg-white text-alert hover:bg-alert-soft",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", block, loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl px-6 text-[16px] font-semibold transition-colors disabled:cursor-not-allowed",
        styles[variant],
        block && "w-full",
        className,
      )}
      {...props}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
      {children}
    </button>
  );
});
