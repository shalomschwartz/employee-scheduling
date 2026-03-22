"use client";

import { useEffect, useState } from "react";
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
import { getNextWeekStart, DAYS, DEFAULT_SHIFTS, type ShiftConfig } from "@/lib/utils";

type SubmitStatus = "idle" | "loading" | "success" | "error";

export default function AvailabilityPage() {
  const { data: session } = useSession();
  const [shifts, setShifts] = useState<ShiftConfig[]>(DEFAULT_SHIFTS);
  const [constraints, setConstraints] = useState<ConstraintData>(defaultConstraintData());
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  const weekStart = getNextWeekStart();
  const weekLabel = `${format(weekStart, "d/M")} – ${format(addDays(weekStart, 6), "d/M/yyyy")}`;

  useEffect(() => {
    async function load() {
      const [shiftsRes, availRes] = await Promise.all([
        fetch("/api/shifts"),
        fetch(`/api/availability?weekStart=${weekStart.toISOString()}`),
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
      setTimeout(() => setStatus("idle"), 3000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4000);
    }
  }

  const availableCount = DAYS.reduce((acc, day) => {
    return acc + Object.values(constraints[day]).filter((v) => v === "available").length;
  }, 0);
  const preferNotCount = DAYS.reduce((acc, day) => {
    return acc + Object.values(constraints[day]).filter((v) => v === "prefer_not").length;
  }, 0);
  const unavailableCount = DAYS.reduce((acc, day) => {
    return acc + Object.values(constraints[day]).filter((v) => v === "unavailable").length;
  }, 0);

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-900">הגשת זמינות</h1>
        <p className="text-sm text-gray-500 mt-0.5">שבוע {weekLabel}</p>
      </div>

      {alreadySubmitted && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>
            זמינות הוגשה{lastSaved ? ` · נשמר ב-${format(lastSaved, "d/M 'בשעה' HH:mm")}` : ""}. ניתן לעדכן בכל עת לפני יצירת הלוח.
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900 text-sm">
                שלום, {session?.user.name?.split(" ")[0] ?? ""}!
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                לחץ על כל תא לשינוי: זמין ← מעדיף לא ← לא זמין
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {availableCount > 0 && <Badge variant="success">{availableCount} זמין</Badge>}
              {preferNotCount > 0 && <Badge variant="warning">{preferNotCount} מעדיף לא</Badge>}
              {unavailableCount > 0 && <Badge variant="danger">{unavailableCount} חסום</Badge>}
              {alreadySubmitted && <Badge variant="default">הוגש</Badge>}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          <AvailabilityGrid value={constraints} onChange={setConstraints} disabled={status === "loading"} shifts={shifts} />
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
            {status === "success" && <span className="text-sm text-green-600 font-medium">נשמר!</span>}
            {status === "error" && <span className="text-sm text-red-600">שגיאה בשמירה. נסה שנית.</span>}
            <Button onClick={handleSubmit} loading={status === "loading"} size="lg" className="min-w-[100px]">
              {alreadySubmitted ? "עדכן" : "שלח"}
            </Button>
          </div>
        </CardFooter>
      </Card>

      <p className="text-xs text-gray-400 text-center">
        המנהל יצור את לוח המשמרות לאחר שכולם ישלחו.
      </p>
    </div>
  );
}
