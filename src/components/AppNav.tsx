"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Session } from "next-auth";
import { cn } from "@/lib/utils";
import { InstallPWA } from "@/components/InstallPWA";

const managerLinks = [
  { href: "/dashboard", label: "לוח בקרה" },
  { href: "/availability", label: "זמינות שלי" },
  { href: "/settings", label: "הגדרות" },
];

const employeeLinks = [
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
    ? "bg-[#0a1220]/85 glass border-b border-white/10"
    : "bg-surface/80 glass border-b border-surface-high shadow-nav";
  const active = dark ? "bg-brand-500/20 text-white ring-1 ring-brand-400/30" : "bg-navy text-white shadow-sm";
  const idle = dark ? "text-slate-400 hover:bg-white/5 hover:text-white" : "text-navy-muted hover:bg-surface-mid hover:text-navy";
  const muted = dark ? "text-slate-400" : "text-navy-muted";

  return (
    <header className={cn("sticky top-0 z-50 overflow-hidden", header)}>
      <div className={cn("mx-auto px-4 sm:px-8", dark ? "max-w-[1500px]" : "max-w-5xl")}>
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-headline font-bold">
            {dark
              ? <span className="text-white text-lg tracking-tight">ShiftSync</span>
              : <img src="/logo.png" alt="ShiftSync" className="h-20 -my-3" />}
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
