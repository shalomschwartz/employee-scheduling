import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  const variants = {
    default: "bg-surface-mid text-navy-muted ring-navy/5",
    success: "bg-success-100 text-success-700 ring-success-600/10",
    warning: "bg-warning-100 text-warning-700 ring-warning-600/10",
    danger:  "bg-danger-100 text-danger-700 ring-danger-600/10",
    info:    "bg-brand-100 text-brand-700 ring-brand-600/10",
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
