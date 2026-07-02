"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { format, addDays } from "date-fns";
import {
  AvailabilityGrid,
  defaultConstraintData,
  type ConstraintData,
} from "@/components/availability/AvailabilityGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, getNextWeekStart, DAYS, DEFAULT_SHIFTS, type ShiftConfig } from "@/lib/utils";
import { useEscapeClose } from "@/lib/useEscapeClose";

function DeadlineBanner({ deadline }: { deadline: Date | null }) {
  const [timeLeft, setTimeLeft] = useState<number>(
    deadline ? deadline.getTime() - Date.now() : Infinity
  );

  useEffect(() => {
    if (!deadline) return;
    setTimeLeft(deadline.getTime() - Date.now());
    const id = setInterval(() => setTimeLeft(deadline.getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) return null;

  const deadlineDateStr = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long", day: "numeric", month: "numeric",
  }).format(deadline);

  const deadlineTimeStr = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(deadline);

  if (timeLeft <= 0) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-300">
        <span className="font-medium">⏰ מועד ההגשה עבר.</span>
      </div>
    );
  }

  const totalSec = Math.floor(timeLeft / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const urgent = timeLeft < 24 * 3600 * 1000;

  return (
    <div className={cn(
      "p-3 rounded-lg border text-sm",
      urgent ? "bg-red-50 border-red-200 text-red-700 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-300" : "bg-blue-50 border-blue-200 text-blue-700 dark:bg-brand-500/10 dark:border-brand-500/20 dark:text-brand-300"
    )}>
      <p className="font-medium">⏰ יש להגיש זמינות עד {deadlineDateStr} בשעה {deadlineTimeStr}</p>
      <div className="mt-1 flex items-baseline gap-2">
        {days > 0 && (
          <span className="text-base tnum">
            {days} ימים
          </span>
        )}
        <span className="text-base tracking-wide">
          {pad(hours)}:{pad(mins)}:{pad(secs)}
        </span>
      </div>
    </div>
  );
}

type SubmitStatus = "idle" | "loading" | "success" | "error";

export default function AvailabilityPage() {
  const { data: session } = useSession();
  const [shifts, setShifts] = useState<ShiftConfig[]>(DEFAULT_SHIFTS);
  const [constraints, setConstraints] = useState<ConstraintData>(defaultConstraintData());
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [isPastDeadline, setIsPastDeadline] = useState(false);
  const [showDeadlinePopup, setShowDeadlinePopup] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [confirmAllAvail, setConfirmAllAvail] = useState(false);
  const [prevData, setPrevData] = useState<ConstraintData | null>(null);
  const [resetSnap, setResetSnap] = useState<ConstraintData | null>(null);
  const [showPwaTip, setShowPwaTip] = useState(false);
  // The grid content that is actually saved on the server — used to detect unsent edits
  const savedSnapRef = useRef<string>("");

  useEffect(() => {
    if (!deadline || isPastDeadline) return;
    const id = setInterval(() => {
      if (Date.now() >= deadline.getTime()) { setIsPastDeadline(true); clearInterval(id); }
    }, 1000);
    return () => clearInterval(id);
  }, [deadline, isPastDeadline]);

  const weekStart = getNextWeekStart();
  const weekLabel = `${format(weekStart, "d/M")} – ${format(addDays(weekStart, 6), "d/M/yyyy")}`;

  useEffect(() => {
    async function load() {
      try {
        const [shiftsRes, availRes, deadlineRes] = await Promise.all([
          fetch("/api/shifts"),
          fetch(`/api/availability?weekStart=${weekStart.toISOString()}`),
          fetch("/api/deadline"),
        ]);
        let loaded: ConstraintData | null = null;
        if (shiftsRes.ok) {
          const s = await shiftsRes.json();
          const arr = Array.isArray(s) ? s : s?.shifts;
          if (Array.isArray(arr)) { setShifts(arr); setConstraints(defaultConstraintData(arr)); savedSnapRef.current = JSON.stringify(defaultConstraintData(arr)); }
        }
        if (availRes.ok) {
          const data = await availRes.json();
          if (data?.data) {
            loaded = data.data as ConstraintData;
            setConstraints(loaded);
            savedSnapRef.current = JSON.stringify(loaded);
            setAlreadySubmitted(true);
            setLastSaved(new Date(data.updatedAt));
          }
        }
        // No submission for this week yet — offer last week's as a one-tap starting point
        if (!loaded) {
          try {
            const histRes = await fetch("/api/availability");
            if (histRes.ok) {
              const hist = await histRes.json();
              if (Array.isArray(hist)) {
                const prev = hist.find((h: { weekStart: string; data?: ConstraintData }) =>
                  h?.data && new Date(h.weekStart).getTime() < weekStart.getTime());
                if (prev?.data) setPrevData(prev.data);
              }
            }
          } catch { /* optional nicety */ }
        }
        if (deadlineRes.ok) {
          const d = await deadlineRes.json();
          if (d.deadline) {
            const dl = new Date(d.deadline);
            // The deadline only binds the week it belongs to — a stale date from a
            // past week must not lock every future submission forever.
            const relevant = Math.abs(dl.getTime() - weekStart.getTime()) < 7 * 86400000;
            if (relevant) {
              setDeadline(dl);
              setIsPastDeadline(Date.now() >= dl.getTime());
            }
          }
        }
      } catch {
        // keep defaults on failure
      } finally {
        setInitLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    if (preferNotCount === 0 && unavailableCount === 0 && !confirmAllAvail) {
      setConfirmAllAvail(true);
      return;
    }
    setConfirmAllAvail(false);
    setStatus("loading");
    try {
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: weekStart.toISOString(), data: constraints }),
      });
      if (!res.ok) throw new Error();
      savedSnapRef.current = JSON.stringify(constraints);
      setStatus("success");
      setAlreadySubmitted(true);
      setLastSaved(new Date());
      const firstTime = !localStorage.getItem("shiftsync_pwa_nudged");
      if (firstTime) {
        localStorage.setItem("shiftsync_pwa_nudged", "true");
        setShowPwaTip(true);
      } else {
        // The one-time PWA tip needs a deliberate dismissal, not a 2.5s flash
        setTimeout(() => setStatus("idle"), 2500);
      }
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4000);
    }
  }

  const availableCount = DAYS.reduce((acc, day) =>
    acc + shifts.filter(s => (constraints[day]?.[s.id] ?? "available") === "available").length, 0);
  const preferNotCount = DAYS.reduce((acc, day) =>
    acc + shifts.filter(s => (constraints[day]?.[s.id] ?? "available") === "prefer_not").length, 0);
  const unavailableCount = DAYS.reduce((acc, day) =>
    acc + shifts.filter(s => (constraints[day]?.[s.id] ?? "available") === "unavailable").length, 0);

  useEscapeClose(confirmAllAvail, () => setConfirmAllAvail(false));

  const isDirty = !initLoading && JSON.stringify(constraints) !== savedSnapRef.current;

  // Don't let unsent edits vanish silently when the tab/PWA is closed
  useEffect(() => {
    if (!isDirty || isPastDeadline) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, isPastDeadline]);

  function copyLastWeek() {
    if (!prevData) return;
    // Rebuild on the CURRENT shift config — only overlay keys that still exist,
    // so stale shift ids from a changed config never reach the server.
    const base = defaultConstraintData(shifts);
    for (const d of DAYS) {
      for (const s of shifts) {
        const v = prevData[d]?.[s.id];
        if (v) base[d][s.id] = v;
      }
    }
    setConstraints(base);
  }

  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function resetToAvailable() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setResetSnap(constraints);
    setConstraints(defaultConstraintData(shifts));
    resetTimer.current = setTimeout(() => setResetSnap(null), 6000);
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-navy dark:text-slate-100">הגשת זמינות</h1>
        <p className="text-sm text-navy-muted dark:text-slate-400 mt-0.5">שבוע {weekLabel}</p>
      </div>

      <DeadlineBanner deadline={deadline} />

      {alreadySubmitted && isDirty && !isPastDeadline ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-300 text-sm text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300" role="status">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <span className="font-medium">יש שינויים שלא נשלחו — לחץ "שלח שינויים" כדי לשמור אותם.</span>
        </div>
      ) : alreadySubmitted && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>
            זמינות הוגשה{lastSaved ? ` · נשמר ב-${format(lastSaved, "d/M 'בשעה' HH:mm")}` : ""}.{isPastDeadline ? " מועד ההגשה נעול." : " ניתן לעדכן בכל עת עד לזמן תום ההגשה."}
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <p className="font-semibold text-navy dark:text-slate-100">שלום, {session?.user.name?.split(" ")[0] ?? ""}!</p>
          <p className="text-xs text-navy-muted dark:text-slate-400 mt-0.5">לחץ על משבצת כדי לעבור בין המצבים · לחיצה על שם היום מסמנת את כל היום 👆</p>
          {prevData && !alreadySubmitted && !isPastDeadline && (
            <button
              type="button"
              onClick={copyLastWeek}
              className="mt-2 text-xs font-semibold text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-400/25 rounded-lg px-3 py-1.5 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
            >
              ⤺ העתק משבוע שעבר
            </button>
          )}
          <div className="flex items-center gap-3 mt-2 text-[11px] text-navy-muted dark:text-slate-400 flex-wrap">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-100 dark:bg-emerald-500/15 ring-1 ring-green-400/60 dark:ring-emerald-500/40" />זמין</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-amber-100 dark:bg-amber-500/15 ring-1 ring-amber-400/60 dark:ring-amber-500/40" />מעדיף לא</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-100 dark:bg-rose-500/15 ring-1 ring-red-400/60 dark:ring-rose-500/40" />חסום</span>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {availableCount > 0 && <Badge variant="success">{availableCount} זמין</Badge>}
            {preferNotCount > 0 && <Badge variant="warning">{preferNotCount} מעדיף לא</Badge>}
            {unavailableCount > 0 && <Badge variant="danger">{unavailableCount} חסום</Badge>}
          </div>
        </CardHeader>

        <CardContent className="px-2 sm:px-6 pt-4">
          <AvailabilityGrid
            value={constraints}
            onChange={setConstraints}
            disabled={status === "loading" || isPastDeadline || initLoading}
            onBlockedClick={isPastDeadline ? () => setShowDeadlinePopup(true) : undefined}
            shifts={shifts}
          />
        </CardContent>

        <CardFooter className="flex items-center justify-between gap-4">
          {resetSnap ? (
            <button
              type="button"
              onClick={() => { if (resetTimer.current) clearTimeout(resetTimer.current); setConstraints(resetSnap); setResetSnap(null); }}
              className="text-sm font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-lg px-3 py-1.5"
            >
              אופס? ביטול איפוס ↩
            </button>
          ) : (
            <button
              type="button"
              onClick={resetToAvailable}
              className="text-sm text-navy-muted/70 dark:text-slate-500 hover:text-navy-muted dark:hover:text-slate-300 disabled:opacity-40"
              disabled={status === "loading" || isPastDeadline}
            >
              איפוס לזמין
            </button>
          )}

          <div className="flex items-center gap-3">
            {status === "error" && <span className="text-sm text-red-600" role="alert">שגיאה בשמירה. נסה שנית.</span>}
            <Button
              onClick={handleSubmit}
              loading={status === "loading"}
              disabled={isPastDeadline}
              size="lg"
              className={cn("min-w-[100px]", isPastDeadline && "bg-red-500 hover:bg-red-500 cursor-not-allowed opacity-100")}
            >
              {isPastDeadline ? "מועד ההגשה עבר" : alreadySubmitted ? (isDirty ? "שלח שינויים" : "עדכן") : "שלח"}
            </Button>
          </div>
        </CardFooter>
      </Card>

      <p className="text-xs text-navy-muted/70 dark:text-slate-500 text-center">
        המנהל יצור את לוח המשמרות לאחר שכולם ישלחו.
      </p>

      {showDeadlinePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDeadlinePopup(false)}>
          <div role="dialog" aria-modal="true" className="bg-white rounded-2xl shadow-2xl px-8 py-7 flex flex-col items-center gap-3 mx-6 text-center">
            <p className="text-3xl">⏰</p>
            <p className="text-lg font-bold text-navy">מועד ההגשה עבר</p>
            <p className="text-sm text-navy-muted">לשינוי זמינות פנה למנהל</p>
          </div>
        </div>
      )}

      {status === "success" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setStatus("idle"); setShowPwaTip(false); }}>
          <div role="status" aria-live="polite" className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-2 mx-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-1">
              <svg className="w-9 h-9 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-2xl font-bold text-navy">נשמר!</p>
            <p className="text-sm text-navy-muted text-center">ניתן לסגור את האפליקציה</p>
            {showPwaTip && (
              <p className="text-xs text-brand-700 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2 mt-1 text-center">
                💡 טיפ: הוסיפו את ShiftSync למסך הבית עם כפתור "הוסף למסך" שלמעלה — גישה בקליק בכל שבוע.
              </p>
            )}
          </div>
        </div>
      )}

      {confirmAllAvail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmAllAvail(false)}>
          <div role="dialog" aria-modal="true" className="bg-white rounded-2xl shadow-xl p-6 max-w-xs w-full text-center" dir="rtl" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-navy text-base mb-1">זמין לכל המשמרות?</p>
            <p className="text-sm text-navy-muted mb-5">לא סימנת אף משמרת כ&quot;מעדיף לא&quot; או &quot;חסום&quot;. לשלוח זמינות מלאה?</p>
            <div className="flex gap-2 justify-center">
              <button onClick={handleSubmit} className="flex-1 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors">כן, שלח</button>
              <button onClick={() => setConfirmAllAvail(false)} className="flex-1 py-2 rounded-lg border border-surface-high text-navy text-sm font-semibold hover:bg-surface-low transition-colors">חזור לערוך</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
