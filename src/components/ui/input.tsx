import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-navy mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            "block h-11 w-full rounded-xl border border-surface-high bg-surface-white px-3.5 text-sm text-navy transition-colors",
            "placeholder:text-navy-muted/50",
            "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:ring-offset-0",
            "disabled:cursor-not-allowed disabled:bg-surface-low disabled:opacity-60",
            error && "border-danger-500 focus:border-danger-500 focus:ring-danger-500/25",
            className
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-xs font-medium text-danger-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
