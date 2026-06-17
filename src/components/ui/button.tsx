"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "accent" | "outline" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "xl";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const base =
      "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150 ease-out select-none touch-manipulation active:scale-[0.98] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

    const variants = {
      primary:   "bg-navy text-white shadow-xs hover:bg-navy-light hover:shadow-card",
      accent:    "bg-brand-600 text-white shadow-xs hover:bg-brand-700 hover:shadow-card",
      outline:   "bg-surface-white text-navy border border-surface-high hover:bg-surface-low hover:border-surface-highest",
      secondary: "bg-surface-mid text-navy hover:bg-surface-high",
      ghost:     "text-navy-muted hover:bg-surface-mid hover:text-navy",
      danger:    "bg-danger-600 text-white shadow-xs hover:bg-danger-700",
    };

    const sizes = {
      sm: "h-9 px-3.5 text-xs",
      md: "h-11 px-5 text-sm",
      lg: "h-12 px-6 text-[15px]",
      xl: "h-14 px-8 text-base",
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
