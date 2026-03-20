"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "שגיאה בהרשמה. נסה שנית.");
      setLoading(false);
      return;
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      router.push("/login");
    } else {
      router.push("/onboarding");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-brand-50 to-indigo-100">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">ShiftSync</h1>
          <p className="text-sm text-gray-500 mt-1">ניהול משמרות חכם לצוות שלך</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">הרשמה</h2>
          <p className="text-sm text-gray-500 mb-6">צור את חשבון ShiftSync שלך.</p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input id="name" type="text" label="שם מלא" placeholder="ישראל ישראלי"
              value={name} onChange={(e) => setName(e.target.value)} required autoFocus autoComplete="name" />
            <Input id="email" type="email" label="אימייל" placeholder="you@company.com"
              value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            <Input id="password" type="password" label="סיסמה" placeholder="לפחות 8 תווים"
              value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
            <Button type="submit" className="w-full" size="lg" loading={loading}>
              צור חשבון
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            יש לך חשבון?{" "}
            <Link href="/login" className="text-brand-600 font-medium hover:underline">
              כניסה
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
