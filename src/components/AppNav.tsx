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
}

export function AppNav({ session }: AppNavProps) {
  const pathname = usePathname();
  const isManager = session.user.role === "MANAGER";
  const links = isManager ? managerLinks : employeeLinks;

  return (
    <header className="sticky top-0 z-50 bg-surface/80 glass border-b border-surface-high shadow-nav overflow-hidden">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-headline font-bold text-navy">
            <img src="/logo.png" alt="ShiftSync" className="h-20 -my-3" />
          </Link>

          {/* Nav links */}
          <nav className="hidden sm:flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-semibold transition-all",
                  pathname.startsWith(link.href)
                    ? "bg-navy text-white shadow-sm"
                    : "text-navy-muted hover:bg-surface-mid hover:text-navy"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* User menu */}
          <div className="flex items-center gap-3">
            <InstallPWA />
            <span className="hidden sm:block text-xs text-navy-muted max-w-[120px] truncate font-medium">
              {session.user.name ?? session.user.email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-xs text-navy-muted hover:text-navy px-3 py-1.5 rounded-full hover:bg-surface-mid transition-all font-semibold"
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
              className={cn(
                "flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all",
                pathname.startsWith(link.href)
                  ? "bg-navy text-white"
                  : "text-navy-muted hover:bg-surface-mid"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
