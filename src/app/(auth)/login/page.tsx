"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasError = searchParams.get("error") === "1";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [orgCode, setOrgCode] = useState("");
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(hasError ? "פרטים שגויים." : "");

  function switchRole(manager: boolean) {
    setIsManager(manager);
    setError("");
    setUsername("");
    setPassword("");
    setPhone("");
    setOrgCode("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      username,
      password: isManager ? password : "",
      isManager: isManager ? "true" : "false",
      phone: isManager ? "" : phone,
      orgCode: isManager ? "" : orgCode,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(isManager ? "אימייל או סיסמה שגויים." : "שם, טלפון או קוד ארגון שגויים. ודא את הפרטים מול המנהל.");
    } else {
      router.push(isManager ? "/dashboard?welcome=1" : "/availability?welcome=1");
      router.refresh();
    }
  }

  return (
    <div className="bg-surface-white rounded-2xl shadow-lg ring-1 ring-surface-high p-7">
      {/* Role toggle */}
      <div className="grid grid-cols-2 gap-1 p-1 mb-6 rounded-xl bg-surface-low" role="tablist" aria-label="סוג כניסה">
        <button
          type="button"
          role="tab"
          aria-selected={!isManager}
          onClick={() => switchRole(false)}
          className={cn(
            "h-9 rounded-lg text-sm font-semibold transition-all duration-150",
            !isManager ? "bg-surface-white text-navy shadow-xs" : "text-navy-muted hover:text-navy"
          )}
        >
          עובד
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isManager}
          onClick={() => switchRole(true)}
          className={cn(
            "h-9 rounded-lg text-sm font-semibold transition-all duration-150",
            isManager ? "bg-surface-white text-navy shadow-xs" : "text-navy-muted hover:text-navy"
          )}
        >
          מנהל
        </button>
      </div>

      <h2 className="text-lg font-bold text-navy mb-1">{isManager ? "כניסת מנהל" : "כניסת עובד"}</h2>
      <p className="text-sm text-navy-muted mb-6">
        {isManager ? "הזן אימייל וסיסמה." : "הזן את שמך ומספר הטלפון שלך."}
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-danger-50 ring-1 ring-inset ring-danger-100 text-sm font-medium text-danger-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="username"
          type={isManager ? "email" : "text"}
          label={isManager ? "אימייל" : "שם"}
          placeholder={isManager ? "you@company.com" : "ישראל ישראלי"}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
          autoComplete={isManager ? "email" : "name"}
        />
        {!isManager && (
          <>
            <Input
              id="phone"
              type="tel"
              label="טלפון"
              placeholder="050-0000000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoComplete="tel"
            />
            <Input
              id="orgCode"
              type="text"
              label="קוד ארגון"
              placeholder="הקוד שקיבלת מהמנהל"
              value={orgCode}
              onChange={(e) => setOrgCode(e.target.value.toUpperCase())}
              required
              autoComplete="off"
              maxLength={6}
              className="uppercase tracking-widest"
            />
          </>
        )}
        {isManager && (
          <Input
            id="password"
            type="password"
            label="סיסמה"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        )}
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          כניסה
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-navy-muted">
        אין לך חשבון?{" "}
        <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-700">
          הירשם
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-10 bg-gradient-to-b from-surface via-surface to-brand-50/60">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="text-center mb-7">
          <img src="/logo.png" alt="ShiftSync" className="h-16 mx-auto mb-2" />
          <p className="text-sm text-navy-muted">ניהול משמרות חכם לצוות שלך</p>
        </div>

        <Suspense fallback={<div className="bg-surface-white rounded-2xl shadow-lg ring-1 ring-surface-high p-7 h-72 animate-pulse" />}>
          <LoginForm />
        </Suspense>

        <p className="text-center text-xs text-navy-muted/70 mt-6">
          בכניסה אתה מסכים לתנאי השימוש.
        </p>
      </div>
    </div>
  );
}
