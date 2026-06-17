"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";

export default function OnboardingPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orgCode, setOrgCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName: orgName.trim() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOrgCode(data.orgCode ?? null);
    } catch {
      setError("שגיאה ביצירת הארגון. נסה שנית.");
    } finally {
      setLoading(false);
    }
  }

  function copyCode() {
    if (!orgCode) return;
    navigator.clipboard
      ?.writeText(orgCode)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  }

  function goToDashboard() {
    router.push("/dashboard");
    router.refresh();
  }

  // Success step — surface the org code so the manager knows employees need it to log in.
  if (orgCode) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <Card>
          <CardContent className="py-8 px-6 text-center space-y-5">
            <div className="mx-auto w-12 h-12 rounded-full bg-success-100 dark:bg-emerald-500/15 grid place-items-center">
              <Check className="w-6 h-6 text-success-600 dark:text-emerald-400" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-navy dark:text-slate-100">הארגון נוצר!</h2>
              <p className="text-sm text-navy-muted dark:text-slate-400">
                שתף את קוד הכניסה הזה עם העובדים — הם נכנסים עם שם, טלפון והקוד.
              </p>
            </div>
            <button
              type="button"
              onClick={copyCode}
              className="mx-auto flex items-center gap-3 px-5 py-3 rounded-xl border border-surface-high dark:border-white/10 bg-surface-low dark:bg-white/[0.05] hover:bg-surface-mid dark:hover:bg-white/[0.08] transition-colors"
            >
              <KeyRound className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span className="font-mono font-bold text-lg tracking-[0.3em] text-navy dark:text-slate-100">{orgCode}</span>
              {copied ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-success-600 dark:text-emerald-400">
                  <Check className="w-3.5 h-3.5" /> הועתק
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-medium text-navy-muted dark:text-slate-400">
                  <Copy className="w-3.5 h-3.5" /> העתק
                </span>
              )}
            </button>
            <Button onClick={goToDashboard} className="w-full" size="lg">
              המשך ללוח הבקרה
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-navy dark:text-slate-100">ברוך הבא ל-ShiftSync</h1>
        <p className="text-sm text-navy-muted dark:text-slate-400 mt-1">הגדר את הארגון שלך להתחלה.</p>
      </div>
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-navy dark:text-slate-100">צור ארגון</h2>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-300">
                {error}
              </div>
            )}
            <Input
              id="orgName"
              label="שם הארגון"
              placeholder="לדוגמה: קפה שלום"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
              autoFocus
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" size="lg" loading={loading}>
              צור ארגון
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
