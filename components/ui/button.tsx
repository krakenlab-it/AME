import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

const styles: Record<Variant, string> = {
  primary: "bg-marian text-white hover:bg-marian-deep active:bg-marian-deep disabled:bg-ink-faint",
  secondary: "border border-marian/40 bg-white text-marian hover:border-marian hover:bg-marian-soft/60 disabled:border-ink-faint disabled:text-ink-faint",
  ghost: "text-marian hover:bg-marian-soft/70 disabled:text-ink-faint",
  danger: "border border-alert/40 bg-white text-alert hover:bg-alert-soft disabled:border-ink-faint disabled:text-ink-faint",
};

const sizes: Record<Size, string> = {
  md: "min-h-[52px] px-6 text-[16px]",
  sm: "min-h-[44px] px-4 text-[15px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
}

export function buttonClassName({
  variant = "primary",
  size = "md",
  block,
  className,
}: {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  className?: string;
}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed",
    sizes[size],
    styles[variant],
    block && "w-full",
    className,
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  block,
  className,
  ...props
}: {
  variant?: Variant;
  size?: Size;
  block?: boolean;
} & ComponentProps<typeof Link>) {
  return <Link className={buttonClassName({ variant, size, block, className })} {...props} />;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", block, loading, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClassName({ variant, size, block, className })}
      {...props}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
      {children}
    </button>
  );
});
