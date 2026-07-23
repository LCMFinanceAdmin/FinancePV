"use client";
import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => {
    const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";
    const variants = {
      primary:   "bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-[0_8px_18px_rgba(37,99,235,.22)] focus:ring-[#60a5fa]",
      secondary: "bg-white/90 border border-[#d5e5fb] hover:bg-sky-50 text-[#294a78] shadow-sm focus:ring-[#bfdbfe]",
      ghost:     "hover:bg-sky-50 text-[#496582] focus:ring-[#dbeafe]",
      danger:    "bg-rose-500 hover:bg-rose-600 text-white shadow-[0_8px_18px_rgba(244,63,94,.18)] focus:ring-rose-300",
    };
    const sizes = {
      sm: "text-xs px-3 py-1.5",
      md: "text-sm px-4 py-2",
      lg: "text-base px-5 py-2.5",
    };
    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
