import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Accent / interactive — trustworthy blue
        brand: {
          50:  "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
        },
        // Neutral surfaces — clean slate (not blue-muddy)
        surface: {
          DEFAULT:  "#f8fafc",
          low:      "#f1f5f9",
          mid:      "#eef2f7",
          high:     "#e2e8f0",
          highest:  "#cbd5e1",
          white:    "#ffffff",
        },
        // Primary ink — deep premium navy
        navy: {
          DEFAULT: "#0b2239",
          light:   "#16395c",
          muted:   "#52647d",
        },
        success: { 50: "#ecfdf5", 100: "#d1fae5", 500: "#10b981", 600: "#059669", 700: "#047857" },
        warning: { 50: "#fffbeb", 100: "#fef3c7", 500: "#f59e0b", 600: "#d97706", 700: "#b45309" },
        danger:  { 50: "#fef2f2", 100: "#fee2e2", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c" },
      },
      fontFamily: {
        sans:     ["var(--font-sans)", "system-ui", "sans-serif"],
        headline: ["var(--font-headline)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        lg:    "0.75rem",
        xl:    "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
        full:  "9999px",
      },
      boxShadow: {
        xs:           "0 1px 2px 0 rgb(11 34 57 / 0.05)",
        card:         "0 1px 2px 0 rgb(11 34 57 / 0.04), 0 1px 3px 0 rgb(11 34 57 / 0.06)",
        "card-hover": "0 6px 16px -4px rgb(11 34 57 / 0.12), 0 2px 6px -2px rgb(11 34 57 / 0.06)",
        nav:          "0 1px 0 0 rgb(11 34 57 / 0.06), 0 6px 16px -12px rgb(11 34 57 / 0.16)",
        lg:           "0 16px 40px -12px rgb(11 34 57 / 0.18)",
        focus:        "0 0 0 3px rgb(59 130 246 / 0.35)",
      },
      keyframes: {
        "fade-up": {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
