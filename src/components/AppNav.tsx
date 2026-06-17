"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Session } from "next-auth";
import { cn } from "@/lib/utils";
import { InstallPWA } from "@/components/InstallPWA";
import { ThemeToggle } from "@/components/ThemeToggle";

const managerLinks = [
  { href: "/dashboard", label: "לוח בקרה" },
  { href: "/availability", label: "זמינות שלי" },
  { href: "/settings", label: "הגדרות" },
];

const employeeLinks = [
  { href: "/my-schedule", label: "המשמרות שלי" },
  { href: "/availability", label: "זמינות שלי" },
];

interface AppNavProps {
  session: Session;
  dark?: boolean;
}

export function AppNav({ session, dark }: AppNavProps) {
  const pathname = usePathname();
  const isManager = session.user.role === "MANAGER";
  const links = isManager ? managerLinks : employeeLinks;

  const header = dark
    ? "bg-surface/80 dark:bg-[#0a1220]/85 glass border-b border-surface-high dark:border-white/10 shadow-nav dark:shadow-none"
    : "bg-surface/80 glass border-b border-surface-high shadow-nav";
  const active = dark
    ? "bg-navy text-white shadow-sm dark:bg-brand-500/20 dark:text-white dark:shadow-none dark:ring-1 dark:ring-brand-400/30"
    : "bg-navy text-white shadow-sm";
  const idle = dark
    ? "text-navy-muted hover:bg-surface-mid hover:text-navy dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
    : "text-navy-muted hover:bg-surface-mid hover:text-navy";
  const muted = dark ? "text-navy-muted dark:text-slate-400" : "text-navy-muted";

  return (
    <header className={cn("sticky top-0 z-50 overflow-hidden", header)}>
      <div className={cn("mx-auto px-4 sm:px-8", dark ? "max-w-[1500px]" : "max-w-5xl")}>
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-headline font-bold">
            {dark ? (
              <>
                <img src="/logo.png" alt="ShiftSync" className="h-20 -my-3 dark:hidden" />
                <span className="hidden dark:inline text-white text-lg tracking-tight">ShiftSync</span>
              </>
            ) : (
              <img src="/logo.png" alt="ShiftSync" className="h-20 -my-3" />
            )}
          </Link>

          {/* Nav links */}
          <nav className="hidden sm:flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn("px-4 py-1.5 rounded-full text-sm font-semibold transition-all", pathname.startsWith(link.href) ? active : idle)}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* User menu */}
          <div className="flex items-center gap-3">
            {dark && <ThemeToggle />}
            <InstallPWA />
            <span className={cn("hidden sm:block text-xs max-w-[120px] truncate font-medium", muted)}>
              {session.user.name ?? session.user.email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className={cn("text-xs px-3 py-1.5 rounded-full transition-all font-semibold", idle)}
            >
              יציאה
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="flex sm:hidden gap-1 pb-2 overflow-x-auto">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn("flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all", pathname.startsWith(link.href) ? active : idle)}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
