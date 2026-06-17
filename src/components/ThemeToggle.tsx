"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");
    root.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
    setIsDark(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "עבור למצב בהיר" : "עבור למצב כהה"}
      title={isDark ? "מצב בהיר" : "מצב כהה"}
      className="grid place-items-center w-8 h-8 rounded-full transition-colors text-navy-muted hover:bg-surface-mid hover:text-navy dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
    >
      {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
    </button>
  );
}
