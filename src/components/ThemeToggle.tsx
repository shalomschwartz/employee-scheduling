"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const el = document.getElementById("app-shell");
    setIsDark(el ? el.classList.contains("dark") : true);
  }, []);

  function toggle() {
    const el = document.getElementById("app-shell");
    if (!el) return;
    const next = !el.classList.contains("dark");
    el.classList.toggle("dark", next);
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
