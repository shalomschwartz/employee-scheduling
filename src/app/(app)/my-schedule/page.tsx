"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { format, addDays } from "date-fns";
import { CalendarDays, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  getNextWeekStart,
  DAYS,
  DAY_LABELS_HE,
  DEFAULT_SHIFTS,
  type ShiftConfig,
  type Day,
} from "@/lib/utils";

type Slot = { employeeIds: string[]; employeeNames: string[] };
type Schedule = Record<string, Record<string, Slot>>;

export default function MySchedulePage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [published, setPublished] = useState(false);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [shifts, setShifts] = useState<ShiftConfig[]>(DEFAULT_SHIFTS);
  const [userId, setUserId] = useState<string>("");

  const weekStart = getNextWeekStart();
  const weekLabel = `${format(weekStart, "d/M")} – ${format(addDays(weekStart, 6), "d/M/yyyy")}`;

  useEffect(() => {
    async function load() {
      try {
        const [msRes, shiftsRes] = await Promise.all([
          fetch("/api/my-schedule"),
          fetch("/api/shifts"),
        ]);
        if (shiftsRes.ok) {
          const s = await shiftsRes.json();
          const arr = Array.isArray(s) ? s : s?.shifts;
          if (Array.isArray(arr)) setShifts(arr);
        }
        if (msRes.ok) {
          const d = await msRes.json();
          setPublished(!!d.published);
          if (d.schedule) setSchedule(d.schedule as Schedule);
          if (d.userId) setUserId(d.userId);
        }
      } catch {
        // ignore
      }
      setLoading(false);
    }
    load();
  }, []);

  const uid = userId || session?.user?.id || "";
  const myDays = DAYS.map((day) => ({
    day,
    shifts: schedule
      ? shifts.filter((sh) => (schedule[day]?.[sh.id]?.employeeIds ?? []).includes(uid))
      : [],
  })).filter((d) => d.shifts.length > 0);
  const totalShifts = myDays.reduce((a, d) => a + d.shifts.length, 0);

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-navy dark:text-slate-100">המשמרות שלי</h1>
        <p className="text-sm text-navy-muted dark:text-slate-400 mt-0.5">שבוע {weekLabel}</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-mid dark:bg-white/[0.07] animate-pulse" />
          ))}
        </div>
      ) : !published ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <CalendarDays className="w-10 h-10 text-navy-muted/40 dark:text-slate-600 mx-auto" />
            <p className="font-semibold text-navy dark:text-slate-100">לוח המשמרות עדיין לא פורסם</p>
            <p className="text-sm text-navy-muted dark:text-slate-400">המנהל יפרסם את הסידור בקרוב. בדוק שוב מאוחר יותר.</p>
          </CardContent>
        </Card>
      ) : totalShifts === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <CalendarDays className="w-10 h-10 text-navy-muted/40 dark:text-slate-600 mx-auto" />
            <p className="font-semibold text-navy dark:text-slate-100">לא שובצת השבוע</p>
            <p className="text-sm text-navy-muted dark:text-slate-400">אין לך משמרות בסידור שפורסם.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-navy-muted dark:text-slate-400">
            <CheckCircle2 className="w-4 h-4 text-success-600 dark:text-emerald-400" />
            {totalShifts} משמרות השבוע
          </div>
          <div className="space-y-2.5">
            {myDays.map(({ day, shifts: dShifts }) => (
              <Card key={day}>
                <CardContent className="py-3.5 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-14 shrink-0">
                      <p className="font-bold text-navy dark:text-slate-100 text-sm">{DAY_LABELS_HE[day as Day]}</p>
                    </div>
                    <div className="flex-1 flex flex-col gap-1.5">
                      {dShifts.map((sh) => (
                        <div key={sh.id} className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-navy dark:text-slate-100 text-sm">{sh.label}</span>
                          <span className="flex items-center gap-1 text-xs text-navy-muted dark:text-slate-400" dir="ltr">
                            <Clock className="w-3 h-3" /> {sh.start}–{sh.end}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
