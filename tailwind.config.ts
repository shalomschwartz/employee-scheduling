import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0f6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#011e36",
        },
        surface: {
          DEFAULT:  "#f6fafe",
          low:      "#f0f4f8",
          mid:      "#eaeef2",
          high:     "#e4e9ed",
          highest:  "#dfe3e7",
          white:    "#ffffff",
        },
        navy: {
          DEFAULT: "#011e36",
          light:   "#1a334c",
          muted:   "#44617d",
        },
      },
      fontFamily: {
        sans:     ["Heebo", "sans-serif"],
        headline: ["Manrope", "Heebo", "sans-serif"],
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
        card: "0 1px 4px 0 rgba(1,30,54,0.07), 0 0 0 1px rgba(1,30,54,0.04)",
        nav:  "0 1px 0 0 rgba(1,30,54,0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
