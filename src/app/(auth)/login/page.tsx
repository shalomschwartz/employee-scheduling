"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasError = searchParams.get("error") === "1";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(hasError ? "פרטים שגויים." : "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      username,
      password: isManager ? password : "",
      isManager: isManager ? "true" : "false",
      phone: isManager ? "" : phone,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(isManager ? "אימייל או סיסמה שגויים." : "שם או טלפון שגויים. פנה למנהל.");
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">כניסה – {isManager ? "מנהל" : "עובד"}</h2>
      <p className="text-sm text-gray-500 mb-6">
        {isManager ? "הזן אימייל וסיסמה." : "הזן את שמך ומספר הטלפון שלך."}
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
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

      <p className="mt-4 text-center text-sm">
        <button
          type="button"
          onClick={() => { setIsManager(v => !v); setError(""); setUsername(""); setPassword(""); setPhone(""); }}
          className="text-gray-400 hover:text-brand-600 transition-colors"
        >
          {isManager ? "כניסה כעובד" : "כניסת מנהל"}
        </button>
      </p>

      <p className="mt-4 text-center text-sm text-gray-500">
        אין לך חשבון?{" "}
        <Link href="/register" className="text-brand-600 font-medium hover:underline">
          הירשם
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-brand-50 to-indigo-100">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="ShiftSync" className="h-20 mx-auto mb-1" />
          <p className="text-sm text-gray-500 mt-1">ניהול משמרות חכם לצוות שלך</p>
        </div>

        <Suspense fallback={<div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100 h-64 animate-pulse" />}>
          <LoginForm />
        </Suspense>

        <p className="text-center text-xs text-gray-400 mt-6">
          בכניסה אתה מסכים לתנאי השימוש.
        </p>
      </div>
    </div>
  );
}
