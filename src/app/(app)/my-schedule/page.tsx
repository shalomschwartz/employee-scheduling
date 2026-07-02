"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { format, addDays } from "date-fns";
import { he } from "date-fns/locale";
import { CalendarDays, CalendarPlus, Clock, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  getCurrentWeekStart,
  toMins,
  cn,
  DAYS,
  DAY_LABELS_HE,
  DEFAULT_SHIFTS,
  type ShiftConfig,
  type Day,
} from "@/lib/utils";

type Slot = { employeeIds: string[]; employeeNames: string[] };
type Schedule = Record<string, Record<string, Slot>>;
interface WeekData { weekStart: string; schedule: Schedule; publishedAt: string | null }

interface ShiftItem {
  day: Day;
  dayIdx: number;
  date: Date;
  cfg: ShiftConfig;
  coworkers: string[];
  start: Date; // local wall-clock start, for "next shift" math
}

export default function MySchedulePage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState<WeekData | null>(null);
  const [nextWeek, setNextWeek] = useState<WeekData | null>(null);
  const [shifts, setShifts] = useState<ShiftConfig[]>(DEFAULT_SHIFTS);
  const [userId, setUserId] = useState<string>("");
  const [managerPhone, setManagerPhone] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<Date | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [msRes, shiftsRes, dlRes] = await Promise.all([
          fetch("/api/my-schedule"),
          fetch("/api/shifts"),
          fetch("/api/deadline").catch(() => null),
        ]);
        if (shiftsRes.ok) {
          const s = await shiftsRes.json();
          const arr = Array.isArray(s) ? s : s?.shifts;
          if (Array.isArray(arr)) setShifts(arr);
        }
        if (msRes.ok) {
          const d = await msRes.json();
          setCurrentWeek(d.currentWeek ?? null);
          setNextWeek(d.nextWeek ?? null);
          if (d.userId) setUserId(d.userId);
          if (typeof d.managerPhone === "string") setManagerPhone(d.managerPhone);
        }
        if (dlRes?.ok) {
          const d = await dlRes.json();
          if (d.deadline) setDeadline(new Date(d.deadline));
        }
      } catch {
        // ignore
      }
      setLoading(false);
    }
    load();
  }, []);

  const uid = userId || session?.user?.id || "";

  // Flatten one week's schedule into this employee's shift items
  function myItems(week: WeekData | null): ShiftItem[] {
    if (!week) return [];
    const ws = new Date(week.weekStart);
    const items: ShiftItem[] = [];
    DAYS.forEach((day, dayIdx) => {
      for (const cfg of shifts) {
        const slot = week.schedule[day]?.[cfg.id];
        if (!slot?.employeeIds?.includes(uid)) continue;
        const date = new Date(ws.getUTCFullYear(), ws.getUTCMonth(), ws.getUTCDate() + dayIdx);
        const [h, m] = cfg.start.split(":").map(Number);
        const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
        const coworkers = slot.employeeIds
          .map((id, i) => ({ id, name: slot.employeeNames[i] ?? "" }))
          .filter(x => x.id !== uid && x.name)
          .map(x => x.name.split(" ")[0]);
        items.push({ day: day as Day, dayIdx, date, cfg, coworkers, start });
      }
    });
    return items;
  }

  const curItems = useMemo(() => myItems(currentWeek), [currentWeek, shifts, uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextItems = useMemo(() => myItems(nextWeek), [nextWeek, shifts, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = new Date();
  const todayIdx = Math.floor((now.getTime() - new Date(getCurrentWeekStart().getUTCFullYear(), getCurrentWeekStart().getUTCMonth(), getCurrentWeekStart().getUTCDate()).getTime()) / 86400000);

  // Next upcoming shift across both weeks
  const nextShift = useMemo(() => {
    return [...curItems, ...nextItems]
      .filter(it => {
        let end = it.start.getTime() + (toMins(it.cfg.end) - toMins(it.cfg.start)) * 60000;
        if (toMins(it.cfg.end) <= toMins(it.cfg.start)) end += 86400000;
        return end > now.getTime();
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime())[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curItems, nextItems]);

  function relDay(d: Date): string {
    const days = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
    if (days <= 0) return "היום";
    if (days === 1) return "מחר";
    return `בעוד ${days} ימים`;
  }

  function cantMakeItUrl(it: ShiftItem): string {
    const digits = (managerPhone ?? "").replace(/\D/g, "").replace(/^0/, "972");
    const name = session?.user?.name?.split(" ")[0] ?? "";
    const msg = `היי, זה ${name}. לא אוכל להגיע למשמרת ${it.cfg.label} ביום ${DAY_LABELS_HE[it.day]} ${format(it.date, "d/M")} (${it.cfg.start}–${it.cfg.end}). אפשר למצוא פתרון?`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
  }

  const hasAnything = curItems.length > 0 || nextItems.length > 0 || currentWeek || nextWeek;

  function weekSection(title: string, week: WeekData | null, items: ShiftItem[], isCurrent: boolean) {
    const ws = week ? new Date(week.weekStart) : null;
    const label = ws ? `${format(ws, "d/M")} – ${format(addDays(ws, 6), "d/M")}` : "";
    const totalMins = items.reduce((a, it) => {
      let m = toMins(it.cfg.end) - toMins(it.cfg.start);
      if (m <= 0) m += 1440;
      return a + m;
    }, 0);

    return (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold text-navy dark:text-slate-100">
            {title} {label && <span className="text-xs font-normal text-navy-muted dark:text-slate-400 tnum">{label}</span>}
          </h2>
          {week && items.length > 0 && (
            <span className="text-xs text-navy-muted dark:text-slate-400">{items.length} משמרות · {Math.round(totalMins / 60)} ש׳</span>
          )}
        </div>

        {!week ? (
          <div className="rounded-xl border border-dashed border-surface-high dark:border-white/10 px-4 py-3 text-sm text-navy-muted dark:text-slate-400">
            הסידור טרם פורסם.
            {!isCurrent && deadline && Date.now() < deadline.getTime() && (
              <> בדרך כלל מתפרסם אחרי מועד הגשת הזמינות ({format(deadline, "EEEE HH:mm", { locale: he })}).</>
            )}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-surface-high dark:border-white/10 px-4 py-3 text-sm text-navy-muted dark:text-slate-400">
            לא שובצת השבוע.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(it => {
              const isToday = isCurrent && it.dayIdx === todayIdx;
              const isPast = isCurrent && it.dayIdx < todayIdx;
              return (
                <Card key={`${it.day}-${it.cfg.id}`} className={cn(isPast && "opacity-55", isToday && "ring-2 ring-brand-400/60")}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      <div className="w-16 shrink-0">
                        <p className="font-bold text-navy dark:text-slate-100 text-sm">{DAY_LABELS_HE[it.day]}</p>
                        <p className="text-xs text-navy-muted dark:text-slate-400 tnum">{format(it.date, "d/M")}</p>
                        {isToday && <span className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300">היום</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-navy dark:text-slate-100 text-sm">{it.cfg.label}</span>
                          <span className="flex items-center gap-1 text-xs text-navy-muted dark:text-slate-400" dir="ltr">
                            <Clock className="w-3 h-3" /> {it.cfg.start}–{it.cfg.end}
                          </span>
                        </div>
                        {it.coworkers.length > 0 && (
                          <p className="mt-1 text-xs text-navy-muted dark:text-slate-400 flex items-center gap-1">
                            <Users className="w-3 h-3 flex-shrink-0" /> עם: {it.coworkers.join(", ")}
                          </p>
                        )}
                        {managerPhone && !isPast && (
                          <a
                            href={cantMakeItUrl(it)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mt-1.5 text-[11px] text-navy-muted/70 dark:text-slate-500 underline underline-offset-2 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                          >
                            לא יכול/ה להגיע?
                          </a>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-bold text-navy dark:text-slate-100">המשמרות שלי</h1>
        {(curItems.length > 0 || nextItems.length > 0) && (
          <a
            href="/api/my-schedule/calendar"
            className="flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 px-2.5 py-1.5 rounded-lg border border-brand-200 dark:border-brand-400/25 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
          >
            <CalendarPlus className="w-3.5 h-3.5" /> הוסף ליומן
          </a>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-mid dark:bg-white/[0.07] animate-pulse" />
          ))}
        </div>
      ) : !hasAnything ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <CalendarDays className="w-10 h-10 text-navy-muted/40 dark:text-slate-600 mx-auto" />
            <p className="font-semibold text-navy dark:text-slate-100">לוח המשמרות עדיין לא פורסם</p>
            <p className="text-sm text-navy-muted dark:text-slate-400">
              {deadline && Date.now() < deadline.getTime()
                ? `הסידור מתפרסם בדרך כלל אחרי מועד הגשת הזמינות — ${format(deadline, "d/M")} בשעה ${format(deadline, "HH:mm")}.`
                : "המנהל יפרסם את הסידור בקרוב."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Next shift — the answer to 90% of app opens */}
          {nextShift && (
            <div className="rounded-2xl border border-brand-200 dark:border-brand-400/25 bg-brand-50 dark:bg-brand-500/10 px-4 py-3">
              <p className="text-xs font-semibold text-brand-700 dark:text-brand-300 mb-0.5">המשמרת הבאה שלך</p>
              <p className="text-sm font-bold text-navy dark:text-slate-100">
                {DAY_LABELS_HE[nextShift.day]} · {nextShift.cfg.label}
                <span className="font-normal text-navy-muted dark:text-slate-400" dir="ltr"> {nextShift.cfg.start}–{nextShift.cfg.end}</span>
                <span className="font-normal text-navy-muted dark:text-slate-400"> · {relDay(nextShift.date)}</span>
              </p>
            </div>
          )}

          {weekSection("השבוע", currentWeek, curItems, true)}
          {weekSection("שבוע הבא", nextWeek, nextItems, false)}
        </>
      )}
    </div>
  );
}
