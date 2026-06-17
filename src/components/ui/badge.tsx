import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  const variants = {
    default: "bg-surface-mid text-navy-muted ring-navy/5 dark:bg-white/[0.08] dark:text-slate-300 dark:ring-white/10",
    success: "bg-success-100 text-success-700 ring-success-600/10 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25",
    warning: "bg-warning-100 text-warning-700 ring-warning-600/10 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/25",
    danger:  "bg-danger-100 text-danger-700 ring-danger-600/10 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/25",
    info:    "bg-brand-100 text-brand-700 ring-brand-600/10 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/25",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
