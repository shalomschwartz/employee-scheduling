"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
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
      <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
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
      urgent ? "bg-red-50 border-red-200 text-red-700" : "bg-blue-50 border-blue-200 text-blue-700"
    )}>
      <p className="font-medium">⏰ יש להגיש זמינות עד {deadlineDateStr} בשעה {deadlineTimeStr}</p>
      <div className="mt-1 flex items-baseline gap-2">
        {days > 0 && (
          <span className="text-base" style={{ fontFamily: "Arial, sans-serif" }}>
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [shifts, setShifts] = useState<ShiftConfig[]>(DEFAULT_SHIFTS);
  const [constraints, setConstraints] = useState<ConstraintData>(defaultConstraintData());
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [isPastDeadline, setIsPastDeadline] = useState(false);
  const [showDeadlinePopup, setShowDeadlinePopup] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (searchParams.get("welcome") === "1") {
      setShowWelcome(true);
      setTimeout(() => setShowWelcome(false), 1500);
      router.replace("/availability");
    }
  }, [searchParams, router]);

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
      const [shiftsRes, availRes, deadlineRes] = await Promise.all([
        fetch("/api/shifts"),
        fetch(`/api/availability?weekStart=${weekStart.toISOString()}`),
        fetch("/api/deadline"),
      ]);
      if (shiftsRes.ok) {
        const s = await shiftsRes.json();
        const arr = Array.isArray(s) ? s : s?.shifts;
        if (Array.isArray(arr)) { setShifts(arr); setConstraints(defaultConstraintData(arr)); }
      }
      if (availRes.ok) {
        const data = await availRes.json();
        if (data?.data) {
          setConstraints(data.data as ConstraintData);
          setAlreadySubmitted(true);
          setLastSaved(new Date(data.updatedAt));
        }
      }
      if (deadlineRes.ok) {
        const d = await deadlineRes.json();
        if (d.deadline) {
          const dl = new Date(d.deadline);
          setDeadline(dl);
          setIsPastDeadline(Date.now() >= dl.getTime());
        }
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit() {
    setStatus("loading");
    try {
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: weekStart.toISOString(), data: constraints }),
      });
      if (!res.ok) throw new Error();
      setStatus("success");
      setAlreadySubmitted(true);
      setLastSaved(new Date());
      setTimeout(() => setStatus("idle"), 2000);
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

  return (
    <div className="space-y-4 max-w-2xl mx-auto" style={{ fontFamily: "Arial, sans-serif" }}>
      <div>
        <h1 className="text-xl font-bold text-gray-900">הגשת זמינות</h1>
        <p className="text-sm text-gray-500 mt-0.5">שבוע {weekLabel}</p>
      </div>

      <DeadlineBanner deadline={deadline} />

      {alreadySubmitted && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>
            זמינות הוגשה{lastSaved ? ` · נשמר ב-${format(lastSaved, "d/M 'בשעה' HH:mm")}` : ""}. ניתן לעדכן בכל עת עד לזמן תום ההגשה.
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <p className="font-semibold text-gray-900">שלום, {session?.user.name?.split(" ")[0] ?? ""}!</p>
          <p className="text-xs text-gray-500 mt-0.5">לחץ על כל משבצת כדי לשנות את הסטטוס שלה 👆</p>
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
            disabled={status === "loading" || isPastDeadline}
            onBlockedClick={isPastDeadline ? () => setShowDeadlinePopup(true) : undefined}
            shifts={shifts}
          />
        </CardContent>

        <CardFooter className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setConstraints(defaultConstraintData(shifts))}
            className="text-sm text-gray-400 hover:text-gray-600"
            disabled={status === "loading"}
          >
            איפוס לזמין
          </button>

          <div className="flex items-center gap-3">
            {status === "error" && <span className="text-sm text-red-600">שגיאה בשמירה. נסה שנית.</span>}
            <Button
              onClick={handleSubmit}
              loading={status === "loading"}
              disabled={isPastDeadline}
              size="lg"
              className={cn("min-w-[100px]", isPastDeadline && "bg-red-500 hover:bg-red-500 cursor-not-allowed opacity-100")}
            >
              {isPastDeadline ? "מועד ההגשה עבר" : alreadySubmitted ? "עדכן" : "שלח"}
            </Button>
          </div>
        </CardFooter>
      </Card>

      <p className="text-xs text-gray-400 text-center">
        המנהל יצור את לוח המשמרות לאחר שכולם ישלחו.
      </p>

      {showDeadlinePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDeadlinePopup(false)}>
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 flex flex-col items-center gap-3 mx-6 text-center">
            <p className="text-3xl">⏰</p>
            <p className="text-lg font-bold text-gray-900">מועד ההגשה עבר</p>
            <p className="text-sm text-gray-500">לשינוי זמינות פנה למנהל</p>
          </div>
        </div>
      )}

      {showWelcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowWelcome(false)}>
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-2 mx-6">
            <p className="text-3xl">👋</p>
            <p className="text-2xl font-bold text-gray-900">ברוך הבא{session?.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}!</p>
          </div>
        </div>
      )}

      {status === "success" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setStatus("idle")}>
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-2 mx-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-1">
              <svg className="w-9 h-9 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-2xl font-bold text-gray-900">נשמר!</p>
            <p className="text-sm text-gray-500 text-center">ניתן לסגור את האפליקציה</p>
          </div>
        </div>
      )}
    </div>
  );
}
