"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Sparkles, Download, Users, LayoutGrid, Clock, CircleCheck, AlertTriangle, X, Plus, Pin, GripVertical, ChevronDown, KeyRound, Copy, Check, Send } from "lucide-react";
import { useEscapeClose } from "@/lib/useEscapeClose";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, addDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type ConstraintData } from "@/components/availability/AvailabilityGrid";
import { getNextWeekStart, DEFAULT_SHIFTS, DAYS, DAY_LABELS_HE, toMins, cn, type Day, type ShiftConfig } from "@/lib/utils";

interface ShiftSlot { employeeIds: string[]; employeeNames: string[]; pinnedIds?: string[]; }
type ScheduleData = Record<string, Record<string, ShiftSlot>>;
interface GeneratedSchedule { id: string; status: "DRAFT" | "PUBLISHED"; schedule: ScheduleData; updatedAt: string; }
interface Employee { id: string; name: string | null; email: string; constraints: { data: ConstraintData }[]; roles: string[]; contractShifts: number | null; }

// 24 visually distinct base colors — covers most orgs without repeating
const EMP_PALETTE_HEX = [
  "#273c75","#6c5ce7","#e84393","#0984e3",
  "#e17055","#00cec9","#a29bfe","#2d3436",
  "#00b894","#d63031","#fdcb6e","#6d4c41",
  "#0097a7","#ad1457","#558b2f","#4527a0",
  "#f4511e","#039be5","#43a047","#8e24aa",
  "#fb8c00","#00838f","#c62828","#37474f",
];

/** Returns a unique hex color per employee index, generating extras via HSL if palette runs out. */
function empHex(index: number): string {
  if (index < EMP_PALETTE_HEX.length) return EMP_PALETTE_HEX[index];
  // Spread remaining employees evenly around the hue wheel at a different lightness
  const hue = Math.round((index - EMP_PALETTE_HEX.length) * (360 / 12)) % 360;
  return `hsl(${hue},65%,38%)`;
}

/** Tailwind-compatible chip class for a given employee index. Uses inline bg since arbitrary hsl isn't purgeable. */
function empChipClass(_index: number): string {
  return "text-white"; // bg set via style prop for generated colors
}

/** Absolute same-day minute range [start, end) for a shift; overnight shifts wrap past midnight. */
function shiftMinRange(cfg: ShiftConfig): [number, number] {
  const s = toMins(cfg.start);
  let e = toMins(cfg.end);
  if (e <= s) e += 1440;
  return [s, e];
}

/** Colored initial circle for an employee. */
function Avatar({ name, color, size = 18 }: { name: string | null; color: string; size?: number }) {
  const ini = (name?.trim()?.charAt(0)) || "?";
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold text-white flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: color, fontSize: Math.round(size * 0.5) }}
    >
      {ini}
    </span>
  );
}

function KpiCard({ icon, label, value, accent, ok }: { icon: ReactNode; label: string; value: ReactNode; accent?: boolean; ok?: boolean }) {
  return (
    <div className={cn("rounded-2xl border bg-surface-white dark:bg-white/[0.04] p-4 shadow-card", accent ? "border-brand-200 ring-1 ring-brand-200 dark:ring-brand-400/20" : "border-surface-high dark:border-white/[0.08]")}>
      <div className="flex items-center gap-2 text-navy-muted dark:text-slate-400 text-xs font-medium">
        <span className={cn("inline-flex items-center justify-center w-6 h-6 rounded-lg", ok ? "bg-success-100 text-success-600" : accent ? "bg-brand-100 text-brand-600 dark:text-brand-400" : "bg-surface-mid dark:bg-white/[0.07] text-navy-muted dark:text-slate-400")}>{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-2xl font-extrabold text-navy dark:text-slate-100 tnum">{value}</div>
    </div>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

const ROLE_COLORS = [
  { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" }, // amber
  { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd" }, // blue
  { bg: "#dcfce7", text: "#166534", border: "#86efac" }, // green
  { bg: "#fce7f3", text: "#9d174d", border: "#f9a8d4" }, // pink
  { bg: "#ede9fe", text: "#5b21b6", border: "#c4b5fd" }, // violet
  { bg: "#ffedd5", text: "#9a3412", border: "#fdba74" }, // orange
  { bg: "#e0f2fe", text: "#0c4a6e", border: "#7dd3fc" }, // sky
  { bg: "#f0fdf4", text: "#14532d", border: "#4ade80" }, // emerald
];

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showWelcome, setShowWelcome] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [existing, setExisting] = useState<GeneratedSchedule | null>(null);
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [shifts, setShifts] = useState<ShiftConfig[]>(DEFAULT_SHIFTS);
  const [minRestHours, setMinRestHours] = useState(7);
  const [orgCode, setOrgCode] = useState<string | null>(null);
  const [empFilter, setEmpFilter] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("shiftsync_guide_open") === "true";
  });
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [showAvailDetail, setShowAvailDetail] = useState(false);

  // Hidden print-calendar ref for PDF capture
  const printRef = useRef<HTMLDivElement>(null);

  // Manual slot editing
  const [editingCell, setEditingCell] = useState<{ day: string; shift: string } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Confirm clear dialog
  const [confirmClear, setConfirmClear] = useState<{ day: string; shift: string } | null>(null);

  // Conflict dialog
  const [conflictDialog, setConflictDialog] = useState<{ lines: string[]; onIgnore: () => void } | null>(null);
  const [conflictsIgnored, setConflictsIgnored] = useState(false);
  const [warningsIgnored, setWarningsIgnored] = useState(false);

  // Drag and drop
  const [dragging, setDragging] = useState<{ empId: string; name: string; fromDay: string; fromShift: string } | null>(null);
  const [draggingRow, setDraggingRow] = useState<string | null>(null);
  const [dragOverRow, setDragOverRow] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{ day: string; shift: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [undoSnap, setUndoSnap] = useState<{ data: ScheduleData; label: string } | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [orgCodeCopied, setOrgCodeCopied] = useState(false);

  useEffect(() => {
    if (searchParams.get("welcome") === "1") {
      setShowWelcome(true);
      setTimeout(() => setShowWelcome(false), 1500);
      router.replace("/dashboard");
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (!undoSnap) return;
    const id = setTimeout(() => setUndoSnap(null), 6000);
    return () => clearTimeout(id);
  }, [undoSnap]);

  useEscapeClose(!!confirmClear, () => setConfirmClear(null));
  useEscapeClose(!!conflictDialog, () => setConflictDialog(null));
  useEscapeClose(confirmRegen, () => setConfirmRegen(false));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weekStart = useMemo(() => getNextWeekStart(), []);
  const weekLabel = `${format(weekStart, "d/M")} – ${format(addDays(weekStart, 6), "d/M/yyyy")}`;

  async function fetchEmployees() {
    try {
      const res = await fetch(`/api/admin/constraints?weekStart=${weekStart.toISOString()}`);
      if (!res.ok) return;
      const emps = await res.json();
      if (Array.isArray(emps)) setEmployees(emps);
    } catch {
      // ignore transient polling errors
    }
  }

  useEffect(() => {
    Promise.all([
      fetch(`/api/schedule?weekStart=${weekStart.toISOString()}`).then(r => r.json()),
      fetch(`/api/admin/constraints?weekStart=${weekStart.toISOString()}`).then(r => r.json()),
      fetch("/api/shifts").then(r => r.json()),
      fetch("/api/min-rest-hours").then(r => r.json()),
    ]).then(([sched, emps, shiftsCfg, restCfg]) => {
      if (sched?.id) { setExisting(sched); setScheduleData(sched.schedule as ScheduleData); }
      if (Array.isArray(emps)) setEmployees(emps);
      if (shiftsCfg?.shifts) setShifts(shiftsCfg.shifts);
      if (typeof shiftsCfg?.orgCode === "string") setOrgCode(shiftsCfg.orgCode);
      if (typeof restCfg?.minRestHours === "number") setMinRestHours(restCfg.minRestHours);
      setLoading(false);
    }).catch(() => { setLoadError(true); setLoading(false); });

    // Poll for employee constraint updates every 30 seconds
    const interval = setInterval(fetchEmployees, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close picker when clicking outside
  useEffect(() => {
    if (!editingCell) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setEditingCell(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [editingCell]);

  const empMap = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e])), [employees]);

  const warnings = useMemo(() => {
    if (!scheduleData) return {} as Record<string, string[]>;
    const result: Record<string, string[]> = {};
    for (const day of DAYS) {
      const dayData = scheduleData[day];
      if (!dayData) continue;
      for (const shiftCfg of shifts) {
        const slot = dayData[shiftCfg.id];
        if (!slot) continue;
        const count = slot.employeeIds.length;
        const min = shiftCfg.minWorkers ?? 2;
        let msg: string | null = null;
        if (count === 0) msg = `${shiftCfg.label}: אין עובדים משובצים`;
        else if (count < min) msg = `${shiftCfg.label}: רק ${count}/${min} עובדים`;
        if (msg) {
          const label = DAY_LABELS_HE[day as Day];
          result[label] ??= [];
          result[label].push(msg);
        }
      }
    }
    return result;
  }, [scheduleData, shifts]);

  const conflicts = useMemo(() => {
    if (!scheduleData) return {} as Record<string, string[]>;
    const result: Record<string, string[]> = {};
    for (const day of DAYS) {
      const dayData = scheduleData[day];
      if (!dayData) continue;
      for (const shiftCfg of shifts) {
        const slot = dayData[shiftCfg.id];
        if (!slot) continue;
        slot.employeeIds.forEach((empId, i) => {
          const emp = empMap[empId];
          if (!emp) return;
          const availability = emp.constraints[0]?.data?.[day as Day]?.[shiftCfg.id] ?? "available";
          if (availability === "unavailable") {
            const name = slot.employeeNames[i] ?? emp.name ?? emp.email;
            if (!result[name]) result[name] = [];
            result[name].push(`${DAY_LABELS_HE[day as Day]} ${shiftCfg.label}`);
          }
        });
      }
    }
    return result;
  }, [scheduleData, employees, shifts]);

  // colorMap: name → hex color (unique per employee, never repeats)
  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    employees.forEach((emp, i) => {
      map[emp.id] = empHex(i);
    });
    return map;
  }, [employees]);

  const DAY_SHORT: Record<string, string> = {
    sunday: "א׳", monday: "ב׳", tuesday: "ג׳", wednesday: "ד׳",
    thursday: "ה׳", friday: "ו׳", saturday: "ש׳",
  };

  const shiftsPerEmployeeMap = useMemo(() => {
    const map: Record<string, { shiftLabel: string; days: string[] }[]> = {};
    if (!scheduleData) return map;
    for (const emp of employees) {
      const entries: { shiftLabel: string; days: string[] }[] = [];
      for (const shiftCfg of shifts) {
        const days: string[] = [];
        for (const day of DAYS) {
          if (scheduleData[day]?.[shiftCfg.id]?.employeeIds.includes(emp.id)) {
            days.push(day);
          }
        }
        if (days.length > 0) entries.push({ shiftLabel: shiftCfg.label, days });
      }
      map[emp.id] = entries;
    }
    return map;
  }, [scheduleData, shifts, employees]);

  const hoursMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!scheduleData) return map;
    function shiftHours(start: string, end: string) {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      return (endMins > startMins ? endMins - startMins : 1440 - startMins + endMins) / 60;
    }
    for (const day of DAYS) {
      for (const shiftCfg of shifts) {
        const slot = scheduleData[day]?.[shiftCfg.id];
        if (!slot) continue;
        const h = shiftHours(shiftCfg.start, shiftCfg.end);
        slot.employeeIds.forEach(id => {
          map[id] = (map[id] ?? 0) + h;
        });
      }
    }
    return map;
  }, [scheduleData, shifts]);

  const stats = useMemo(() => {
    const empCount = employees.length;
    const submittedCount = employees.filter(e => e.constraints.length > 0).length;
    let required = 0, filled = 0;
    const daily = DAYS.map(day => {
      let req = 0, fil = 0;
      for (const sc of shifts) {
        const min = sc.minWorkers ?? 2;
        req += min;
        fil += Math.min(scheduleData?.[day]?.[sc.id]?.employeeIds.length ?? 0, min);
      }
      required += req; filled += fil;
      return { day, pct: req > 0 ? Math.round((fil / req) * 100) : 0 };
    });
    const fillPct = scheduleData && required > 0 ? Math.round((filled / required) * 100) : null;
    const totalHours = Math.round(Object.values(hoursMap).reduce((a, b) => a + b, 0));
    return { empCount, submittedCount, fillPct, totalHours, daily };
  }, [employees, shifts, scheduleData, hoursMap]);


  async function persistSchedule(updated: ScheduleData) {
    const previous = scheduleData;
    setScheduleData(updated);
    try {
      const res = await fetch("/api/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: weekStart.toISOString(), schedule: updated }),
      });
      if (!res.ok) {
        setScheduleData(previous);
        setErrorToast("שגיאה בשמירת השינויים");
        setTimeout(() => setErrorToast(null), 4000);
      }
    } catch {
      setScheduleData(previous);
      setErrorToast("שגיאת רשת — השינויים לא נשמרו");
      setTimeout(() => setErrorToast(null), 4000);
    }
  }

  function clearShiftCell(day: string, shift: string) {
    if (!scheduleData) return;
    const snap = scheduleData;
    const updated = {
      ...scheduleData,
      [day]: {
        ...scheduleData[day],
        [shift]: { ...scheduleData[day]?.[shift], employeeIds: [], employeeNames: [], pinnedIds: [] },
      },
    };
    persistSchedule(updated);
    setUndoSnap({ data: snap, label: "המשמרת נוקתה" });
  }

  function removeFromSlot(day: string, shift: string, idx: number) {
    if (!scheduleData) return;
    const snap = scheduleData;
    const slot = scheduleData[day]?.[shift];
    if (!slot || idx < 0 || idx >= slot.employeeIds.length) return;
    const removedId = slot.employeeIds[idx];
    const updated = {
      ...scheduleData,
      [day]: {
        ...scheduleData[day],
        [shift]: {
          ...slot,
          employeeIds: slot.employeeIds.filter((_, i) => i !== idx),
          employeeNames: slot.employeeNames.filter((_, i) => i !== idx),
          pinnedIds: (slot.pinnedIds ?? []).filter(id => id !== removedId),
        },
      },
    };
    persistSchedule(updated);
    setUndoSnap({ data: snap, label: "העובד הוסר" });
  }

  // Returns the shift IDs the employee is already in on that day (excluding the target shift)
  function empShiftsOnDay(empId: string, day: string, excludeShift: string): string[] {
    if (!scheduleData) return [];
    return shifts.map(s => s.id).filter(sid => sid !== excludeShift && scheduleData[day]?.[sid]?.employeeIds.includes(empId));
  }

  function hasOverlapConflict(empId: string, day: string, shift: string): boolean {
    const cfg = shifts.find(s => s.id === shift);
    if (!cfg) return false;
    const [cs, ce] = shiftMinRange(cfg);
    return empShiftsOnDay(empId, day, shift).some(sid => {
      const other = shifts.find(s => s.id === sid);
      if (!other) return false;
      const [os, oe] = shiftMinRange(other);
      // True interior overlap — touching boundaries (e.g. 07–15 & 15–23) are adjacent, not overlapping
      return cs < oe && os < ce;
    });
  }

  function hasRestViolation(empId: string, day: string, shift: string): boolean {
    const cfg = shifts.find(s => s.id === shift);
    if (!cfg) return false;
    const [cs, ce] = shiftMinRange(cfg);
    return empShiftsOnDay(empId, day, shift).some(sid => {
      const other = shifts.find(s => s.id === sid);
      if (!other) return false;
      const [os, oe] = shiftMinRange(other);
      if (cs < oe && os < ce) return false; // overlap is reported separately
      const gap = cs >= oe ? cs - oe : os - ce;
      return gap < minRestHours * 60;
    });
  }

  function addToSlot(emp: Employee, day: string, shift: string) {
    if (!scheduleData) return;
    setEditingCell(null);
    const slot = scheduleData[day]?.[shift];
    if (!slot) return;
    if (slot.employeeIds.includes(emp.id)) return;
    const minW = shifts.find(s => s.id === shift)?.minWorkers ?? 2;
    if (slot.employeeIds.length >= minW) {
      setErrorToast(`המשמרת מלאה (${minW}/${minW}) — הסר עובד קודם`);
      setTimeout(() => setErrorToast(null), 3000);
      return;
    }
    const name = emp.name ?? emp.email;

    const doAdd = () => {
      const updated = {
        ...scheduleData,
        [day]: {
          ...scheduleData[day],
          [shift]: {
            ...slot,
            employeeIds: [...slot.employeeIds, emp.id],
            employeeNames: [...slot.employeeNames, name],
            pinnedIds: [...(slot.pinnedIds ?? []), emp.id],
          },
        },
      };
      persistSchedule(updated);
    };

    const availability = emp.constraints[0]?.data?.[day as Day]?.[shift] ?? "available";
    const shiftCfgForAdd = shifts.find(s => s.id === shift);
    const shiftRole = shiftCfgForAdd?.role?.trim();

    // Count how many shifts this employee is already assigned to this week
    const weekShiftCount = scheduleData
      ? Object.values(scheduleData).flatMap(d => Object.values(d)).filter(s => s.employeeIds.includes(emp.id)).length
      : 0;

    const warnings: string[] = [];
    if (emp.contractShifts != null && emp.contractShifts > 0 && weekShiftCount >= emp.contractShifts)
      warnings.push(`${name} כבר מגיע/ה ל-${emp.contractShifts} משמרות לפי החוזה (כרגע: ${weekShiftCount})`);
    if (shiftRole && !emp.roles.includes(shiftRole)) warnings.push(`${name} אינו/ה מוגדר/ת לתפקיד "${shiftRole}"`);
    if (availability === "unavailable") warnings.push(`${name} ציין/ה שאינו/ה זמין/ה למשמרת זו`);
    if (hasOverlapConflict(emp.id, day, shift)) warnings.push(`${name} כבר משובץ/ת במשמרת חופפת באותו יום`);
    else if (hasRestViolation(emp.id, day, shift)) warnings.push(`${name} לא יהיו ${minRestHours} שעות מנוחה בין המשמרות`);
    if (warnings.length > 0) {
      setConflictDialog({ lines: warnings, onIgnore: doAdd });
      return;
    }
    doAdd();
  }

  function handleDrop(toDay: string, toShift: string) {
    setDragOver(null);
    if (!dragging || !scheduleData) return;
    if (dragging.fromDay === toDay && dragging.fromShift === toShift) { setDragging(null); return; }

    const emp = empMap[dragging.empId];
    const toSlot = scheduleData[toDay]?.[toShift];
    if (!toSlot) { setDragging(null); return; }
    if (toSlot.employeeIds.includes(dragging.empId)) {
      setErrorToast(`${dragging.name} כבר משובץ/ת במשמרת זו`);
      setTimeout(() => setErrorToast(null), 3000);
      setDragging(null);
      return;
    }
    const toMinW = shifts.find(s => s.id === toShift)?.minWorkers ?? 2;
    if (toSlot.employeeIds.length >= toMinW) {
      setErrorToast(`המשמרת מלאה (${toMinW}/${toMinW}) — הסר עובד קודם`);
      setTimeout(() => setErrorToast(null), 3000);
      setDragging(null);
      return;
    }
    const doMove = () => {
      const fromSlot = scheduleData[dragging.fromDay]?.[dragging.fromShift];
      if (!fromSlot) { setDragging(null); return; }
      const idx = fromSlot.employeeIds.indexOf(dragging.empId);
      const updated = {
        ...scheduleData,
        [dragging.fromDay]: {
          ...scheduleData[dragging.fromDay],
          [dragging.fromShift]: {
            ...fromSlot,
            employeeIds: fromSlot.employeeIds.filter((_, i) => i !== idx),
            employeeNames: fromSlot.employeeNames.filter((_, i) => i !== idx),
            pinnedIds: (fromSlot.pinnedIds ?? []).filter(id => id !== dragging.empId),
          },
        },
        [toDay]: {
          ...scheduleData[toDay],
          [toShift]: {
            ...toSlot,
            employeeIds: [...toSlot.employeeIds, dragging.empId],
            employeeNames: [...toSlot.employeeNames, dragging.name],
            pinnedIds: [...(toSlot.pinnedIds ?? []), dragging.empId],
          },
        },
      };
      persistSchedule(updated);
      setDragging(null);
    };

    const availability = emp?.constraints[0]?.data?.[toDay as Day]?.[toShift] ?? "available";
    const toShiftRole = shifts.find(s => s.id === toShift)?.role?.trim();
    const dragWeekCount = scheduleData
      ? Object.values(scheduleData).flatMap(d => Object.values(d)).filter(s => s.employeeIds.includes(dragging.empId)).length
      : 0;
    const dragEmp = empMap[dragging.empId];
    const dragWarnings: string[] = [];
    if (dragEmp?.contractShifts != null && dragEmp.contractShifts > 0 && dragWeekCount > dragEmp.contractShifts)
      dragWarnings.push(`${dragging.name} כבר מגיע/ה ל-${dragEmp.contractShifts} משמרות לפי החוזה (כרגע: ${dragWeekCount})`);
    if (toShiftRole && !emp?.roles.includes(toShiftRole)) dragWarnings.push(`${dragging.name} אינו/ה מוגדר/ת לתפקיד "${toShiftRole}"`);
    if (availability === "unavailable") dragWarnings.push(`${dragging.name} ציין/ה שאינו/ה זמין/ה למשמרת זו`);
    if (hasOverlapConflict(dragging.empId, toDay, toShift)) dragWarnings.push(`${dragging.name} כבר משובץ/ת במשמרת חופפת באותו יום`);
    else if (hasRestViolation(dragging.empId, toDay, toShift)) dragWarnings.push(`${dragging.name} לא יהיו ${minRestHours} שעות מנוחה בין המשמרות`);
    if (dragWarnings.length > 0) {
      setConflictDialog({ lines: dragWarnings, onIgnore: doMove });
      setDragging(null);
      return;
    }
    doMove();
  }

  function handleRowDrop(toShiftId: string) {
    setDragOverRow(null);
    if (!draggingRow || draggingRow === toShiftId) { setDraggingRow(null); return; }
    const newShifts = [...shifts];
    const fromIdx = newShifts.findIndex(s => s.id === draggingRow);
    const toIdx = newShifts.findIndex(s => s.id === toShiftId);
    const [moved] = newShifts.splice(fromIdx, 1);
    newShifts.splice(toIdx, 0, moved);
    setShifts(newShifts);
    setDraggingRow(null);
    fetch("/api/shifts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shifts: newShifts }) });
  }

  async function executePdfDownload() {
    setPdfLoading(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const { default: jsPDF } = await import("jspdf");
      if (!printRef.current) return;
      const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: "#eff6ff", useCORS: true });
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const scale = Math.min((pageW - margin * 2) / canvas.width, (pageH - margin * 2) / canvas.height);
      const w = canvas.width * scale;
      const h = canvas.height * scale;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", margin + ((pageW - margin * 2) - w) / 2, margin + ((pageH - margin * 2) - h) / 2, w, h);
      pdf.save(`סידור-עבודה-${format(weekStart, "dd-MM-yyyy")}.pdf`);
    } finally {
      setPdfLoading(false);
    }
  }

  function getDownloadConflicts(): string[] {
    if (!scheduleData) return [];
    const result: string[] = [];
    for (const day of DAYS) {
      const dayData = scheduleData[day];
      if (!dayData) continue;
      for (const shiftCfg of shifts) {
        const slot = dayData[shiftCfg.id];
        if (!slot) continue;
        slot.employeeIds.forEach((empId, i) => {
          const emp = empMap[empId];
          if (!emp) return;
          const availability = emp.constraints[0]?.data?.[day as Day]?.[shiftCfg.id] ?? "available";
          if (availability === "unavailable") {
            result.push(`${slot.employeeNames[i] ?? emp.name ?? emp.email} — ${DAY_LABELS_HE[day as Day]} ${shiftCfg.label}`);
          }
        });
      }
    }
    return result;
  }

  async function handleDownload() {
    if (!scheduleData) return;
    const downloadConflicts = getDownloadConflicts();
    if (downloadConflicts.length > 0) {
      setConflictDialog({ lines: downloadConflicts, onIgnore: executePdfDownload });
    } else {
      await executePdfDownload();
    }
  }

  function handleWhatsApp() {
    if (!scheduleData) return;
    const WA_URL = "https://web.whatsapp.com/";
    const downloadConflicts = getDownloadConflicts();
    if (downloadConflicts.length > 0) {
      // onIgnore runs inside a user click → window.open won't be blocked
      setConflictDialog({
        lines: downloadConflicts,
        onIgnore: async () => {
          await executePdfDownload();
          window.open(WA_URL, "_blank");
        },
      });
    } else {
      // No dialog — open WhatsApp synchronously (user gesture), then download
      window.open(WA_URL, "_blank");
      executePdfDownload();
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/schedule/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: weekStart.toISOString() }),
      });
      if (res.ok) {
        const data = await res.json();
        setExisting(data.schedule);
        setScheduleData(data.schedule.schedule as ScheduleData);
        setConflictsIgnored(false);
        setWarningsIgnored(false);
        setToast("הסידור נוצר בהצלחה!");
        setTimeout(() => setToast(null), 3000);
      } else {
        setErrorToast("שגיאה ביצירת הסידור — נסה שנית");
        setTimeout(() => setErrorToast(null), 4000);
      }
    } catch {
      setErrorToast("שגיאת רשת — בדוק חיבור ונסה שנית");
      setTimeout(() => setErrorToast(null), 4000);
    }
    setGenerating(false);
  }

  function requestGenerate() {
    if (scheduleData) setConfirmRegen(true);
    else generate();
  }

  async function publish() {
    setPublishing(true);
    try {
      const res = await fetch("/api/schedule/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: weekStart.toISOString() }),
      });
      if (res.ok) {
        setExisting(prev => (prev ? { ...prev, status: "PUBLISHED" } : prev));
        setToast("הסידור פורסם לעובדים!");
        setTimeout(() => setToast(null), 3000);
      } else {
        setErrorToast("שגיאה בפרסום הסידור");
        setTimeout(() => setErrorToast(null), 4000);
      }
    } catch {
      setErrorToast("שגיאת רשת — נסה שנית");
      setTimeout(() => setErrorToast(null), 4000);
    }
    setPublishing(false);
  }

  function doUndo() {
    if (!undoSnap) return;
    persistSchedule(undoSnap.data);
    setUndoSnap(null);
  }

  function copyOrgCode() {
    if (!orgCode) return;
    navigator.clipboard?.writeText(orgCode).then(() => {
      setOrgCodeCopied(true);
      setTimeout(() => setOrgCodeCopied(false), 1800);
    }).catch(() => {});
  }

  const shiftKeys = shifts.map(s => s.id);

  const filterBar = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={() => setEmpFilter(null)}
        className={cn(
          "px-3 py-1 rounded-lg text-xs font-medium border transition-colors",
          empFilter === null ? "bg-navy text-white border-navy" : "bg-surface-mid dark:bg-white/[0.06] text-navy-muted dark:text-slate-400 border-surface-high dark:border-white/[0.08] hover:bg-surface-low dark:hover:bg-white/[0.03]"
        )}
      >
        הכל
      </button>
      {employees.map((emp, i) => {
        const id = emp.id;
        const label = (emp.name ?? emp.email).split(" ")[0];
        const selected = empFilter === id;
        return (
          <button
            key={id}
            onClick={() => setEmpFilter(id)}
            className={cn(
              "px-3 py-1 rounded-lg text-xs font-medium border transition-colors",
              selected ? "text-white border-transparent" : "bg-surface-mid dark:bg-white/[0.06] text-navy-muted dark:text-slate-400 border-surface-high dark:border-white/[0.08] hover:bg-surface-low dark:hover:bg-white/[0.03]"
            )}
            style={selected ? { backgroundColor: empHex(i) } : undefined}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  // Map each unique role name to a stable color
  const uniqueRoles = Array.from(new Set(shifts.map(s => s.role).filter(Boolean))) as string[];
  const roleColorMap = Object.fromEntries(
    uniqueRoles.map((r, i) => [r, ROLE_COLORS[i % ROLE_COLORS.length]])
  );

  return (
    <div className="space-y-6 text-navy dark:text-slate-200">
      {showWelcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowWelcome(false)}>
          <div className="bg-white dark:bg-[#131f33] rounded-2xl shadow-lg px-10 py-8 flex flex-col items-center gap-3 mx-6">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-100 text-brand-600 dark:text-brand-400"><Sparkles className="w-7 h-7" /></span>
            <p className="text-2xl font-bold text-navy dark:text-slate-100">ברוך הבא{session?.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}!</p>
          </div>
        </div>
      )}

      {/* Guide */}
      <div className="rounded-xl border border-surface-high dark:border-white/[0.08] bg-surface-white dark:bg-white/[0.04] text-sm text-navy-muted dark:text-slate-400 shadow-card">
        <button
          onClick={() => {
            const next = !showGuide;
            setShowGuide(next);
            localStorage.setItem("shiftsync_guide_open", next ? "true" : "false");
          }}
          className="w-full flex items-center justify-between px-4 py-3 text-right"
        >
          <span className="font-semibold text-navy-muted dark:text-slate-400 text-sm">איך ShiftSync עובד</span>
          <ChevronDown className={cn("w-5 h-5 text-brand-600 dark:text-brand-400 transition-transform", showGuide && "rotate-180")} />
        </button>
        {showGuide && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Group 1 */}
              <div className="bg-surface-mid dark:bg-white/[0.06] rounded-lg border border-surface-high dark:border-white/10 p-3 space-y-2">
                <p className="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wide mb-1">הגדרה חד-פעמית</p>
                <div className="flex gap-2"><span className="font-bold text-brand-700 dark:text-brand-300">1.</span><span><span className="font-semibold">הוסף עובדים</span> — עבור להגדרות, הוסף עובדים עם שם ומספר טלפון.</span></div>
                <div className="flex gap-2"><span className="font-bold text-brand-700 dark:text-brand-300">2.</span><span><span className="font-semibold">הגדר תפקידים</span> — צור סוגי תפקידים (מלצר, ברמן…) והגדר לכל עובד ומשמרת את התפקיד המתאים.</span></div>
                <div className="flex gap-2"><span className="font-bold text-brand-700 dark:text-brand-300">3.</span><span><span className="font-semibold">הגדר חוזים</span> — קבע לכל עובד מספר משמרות שבועי מחייב.</span></div>
                <div className="flex gap-2"><span className="font-bold text-brand-700 dark:text-brand-300">4.</span><span><span className="font-semibold">קבע דדליין</span> — בחר מועד אחרון להגשת זמינות (ברירת מחדל: רביעי 21:00).</span></div>
              </div>
              {/* Group 2 */}
              <div className="bg-surface-mid dark:bg-white/[0.06] rounded-lg border border-surface-high dark:border-white/10 p-3 space-y-2">
                <p className="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wide mb-1">כל שבוע</p>
                <div className="flex gap-2"><span className="font-bold text-brand-700 dark:text-brand-300">5.</span><span><span className="font-semibold">עובדים ממלאים זמינות</span> — כל עובד נכנס ומסמן את הימים והמשמרות שמתאימים לו.</span></div>
                <div className="flex gap-2"><span className="font-bold text-brand-700 dark:text-brand-300">6.</span><span><span className="font-semibold">צור שיבוץ</span> — לחץ "צור שיבוץ". האלגוריתם ישבץ לפי זמינות, תפקיד וחוזה — ויחלק משמרות שווה.</span></div>
              </div>
              {/* Group 3 */}
              <div className="bg-surface-mid dark:bg-white/[0.06] rounded-lg border border-surface-high dark:border-white/10 p-3 space-y-2">
                <p className="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wide mb-1">עריכה ושיתוף</p>
                <div className="flex gap-2"><span className="font-bold text-brand-700 dark:text-brand-300">7.</span><span><span className="font-semibold">ערוך ידנית</span> — גרור עובדים בין משמרות, הוסף/הסר, נעץ עובד, או נקה תא עם "מחק משמרת".</span></div>
                <div className="flex gap-2"><span className="font-bold text-brand-700 dark:text-brand-300">8.</span><span><span className="font-semibold">שלח לעובדים</span> — הורד PDF או שלח לוואצאפ לשיתוף.</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-navy dark:text-slate-100 tracking-tight">לוח בקרה</h1>
          <p className="text-sm text-navy-muted dark:text-slate-400 mt-0.5">שבוע {weekLabel}</p>
          {orgCode && (
            <button
              type="button"
              onClick={copyOrgCode}
              title="העתק קוד"
              className="inline-flex items-center gap-2 mt-3 rounded-xl bg-brand-50 dark:bg-brand-500/10 ring-1 ring-brand-200 dark:ring-brand-400/20 px-3 py-1.5 hover:bg-brand-100 dark:hover:bg-brand-500/15 transition-colors"
            >
              <KeyRound className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span className="text-xs text-navy-muted dark:text-slate-400">קוד עובדים</span>
              <span className="font-mono font-bold tracking-[0.2em] text-brand-700 dark:text-brand-300">{orgCode}</span>
              {orgCodeCopied ? (
                <Check className="w-3.5 h-3.5 text-success-600 dark:text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-navy-muted/70 dark:text-slate-500" />
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={requestGenerate} loading={generating} disabled={employees.length === 0} size="lg" className="bg-gradient-to-l from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 shadow-card">
            <Sparkles className="w-[18px] h-[18px]" /> צור שיבוץ
          </Button>
          {scheduleData && (
            <Button onClick={publish} loading={publishing} size="lg" variant={existing?.status === "PUBLISHED" ? "outline" : "accent"}>
              {existing?.status === "PUBLISHED" ? <><Check className="w-[18px] h-[18px]" /> פורסם</> : <><Send className="w-[18px] h-[18px]" /> פרסם</>}
            </Button>
          )}
          {scheduleData && (
            <button onClick={handleDownload} disabled={pdfLoading} aria-label="הורד PDF" className="inline-flex items-center justify-center w-12 h-12 rounded-xl border border-surface-high dark:border-white/[0.08] bg-surface-white dark:bg-white/[0.04] text-navy-muted dark:text-slate-400 hover:bg-surface-low dark:hover:bg-white/[0.03] hover:text-navy dark:hover:text-slate-100 transition-colors disabled:opacity-50">
              <Download className="w-5 h-5" />
            </button>
          )}
          {scheduleData && (
            <button onClick={handleWhatsApp} aria-label="שלח בוואטסאפ" className="inline-flex items-center justify-center w-12 h-12 rounded-xl border border-surface-high dark:border-white/[0.08] bg-surface-white dark:bg-white/[0.04] text-[#16a34a] hover:bg-green-50 dark:hover:bg-green-500/10 transition-colors">
              <WhatsAppIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Hero — coverage ring + 7-day staffing chart + stats */}
      {!loading && employees.length > 0 && (
        <div className="relative flex flex-wrap items-center gap-5 sm:gap-7 rounded-2xl border border-surface-high dark:border-white/10 bg-surface-white dark:bg-white/[0.04] p-5">
          <svg width="116" height="116" viewBox="0 0 124 124" className="flex-shrink-0" style={{ filter: "drop-shadow(0 0 10px rgba(79,124,255,0.25))" }} aria-hidden="true">
            <defs>
              <linearGradient id="cov" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#4f7cff" />
                <stop offset="1" stopColor="#a78bfa" />
              </linearGradient>
            </defs>
            <circle cx="62" cy="62" r="52" fill="none" strokeWidth="11" className="stroke-surface-high dark:stroke-white/[0.07]" />
            <circle cx="62" cy="62" r="52" fill="none" stroke="url(#cov)" strokeWidth="11" strokeLinecap="round" strokeDasharray={326.7} strokeDashoffset={326.7 * (1 - (stats.fillPct ?? 0) / 100)} transform="rotate(-90 62 62)" />
            <text x="62" y="58" textAnchor="middle" fontSize="28" fontWeight="600" className="fill-navy dark:fill-white">{stats.fillPct != null ? `${stats.fillPct}%` : "—"}</text>
            <text x="62" y="78" textAnchor="middle" fill="#64748b" fontSize="11">מאויש</text>
          </svg>
          <div className="flex-1 min-w-[220px]">
            <div className="text-xs text-navy-muted dark:text-slate-400 mb-2.5">איוש לפי יום</div>
            <div className="flex items-end gap-2 h-16">
              {stats.daily.map(d => (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full max-w-[14px] rounded-md" style={{ height: `${Math.max(8, d.pct * 0.5)}px`, background: d.pct >= 100 ? "linear-gradient(#4f7cff,#a78bfa)" : d.pct >= 67 ? "linear-gradient(#4f7cff,#6f7ff0)" : "linear-gradient(#f59e0b,#fbbf24)" }} />
                  <span className="text-[10px] text-navy-muted/70 dark:text-slate-500">{DAY_SHORT[d.day]}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden sm:block w-px self-stretch bg-surface-high dark:bg-white/10" />
          <div className="flex sm:flex-col gap-6 sm:gap-3.5">
            <div><div className="text-[11px] text-navy-muted/70 dark:text-slate-500">עובדים</div><div className="text-2xl font-bold text-navy dark:text-white leading-none">{stats.empCount}</div></div>
            <div><div className="text-[11px] text-navy-muted/70 dark:text-slate-500">שעות</div><div className="text-2xl font-bold text-navy dark:text-white leading-none">{stats.totalHours}</div></div>
          </div>
        </div>
      )}

      {/* Team detail (collapsible) */}
      {!loading && employees.length > 0 && (
        <div className="rounded-2xl border border-surface-high dark:border-white/[0.08] bg-surface-white dark:bg-white/[0.04] shadow-card overflow-hidden">
          <button onClick={() => setShowTeam(v => !v)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-low dark:hover:bg-white/[0.03] transition-colors">
            <span className="flex items-center gap-2 text-sm font-semibold text-navy dark:text-slate-100"><Users className="w-4 h-4 text-brand-600 dark:text-brand-400" /> פרטי צוות</span>
            <ChevronDown className={cn("w-5 h-5 text-navy-muted dark:text-slate-400 transition-transform", showTeam && "rotate-180")} />
          </button>
          {showTeam && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 px-4 pb-4">
          {employees.map((emp, i) => {
            const name = emp.name ?? emp.email;
            const hours = hoursMap[emp.id] ?? 0;
            return (
              <div key={emp.id} className="rounded-xl border border-surface-high dark:border-white/10 bg-surface-white dark:bg-white/[0.04] overflow-hidden">
                <div className="h-1.5 w-full" style={{ backgroundColor: empHex(i) }} />
                <div className="px-4 py-3">
                  <p className="text-xs font-semibold text-navy dark:text-slate-100 truncate">{name}</p>
                  <p className="text-2xl font-bold text-navy dark:text-slate-100 mt-1">{hours}<span className="text-xs font-normal text-navy-muted/70 dark:text-slate-500 mr-1">שעות</span></p>

                  {/* Profile summary */}
                  <div className="mt-2 space-y-1 border-t border-surface-high dark:border-white/[0.08] pt-2">
                    {/* Contract */}
                    {emp.contractShifts != null && emp.contractShifts > 0 && (
                      <div className="flex items-center gap-1 text-xs text-navy-muted dark:text-slate-400">
                        <span className="font-medium text-navy-muted dark:text-slate-400">חוזה:</span>
                        <span>{emp.contractShifts} משמרות/שבוע</span>
                      </div>
                    )}
                    {/* Roles */}
                    {emp.roles.length > 0 && (
                      <div className="flex items-start gap-1 text-xs text-navy-muted dark:text-slate-400">
                        <span className="font-medium text-navy-muted dark:text-slate-400 shrink-0">תפקידים:</span>
                        <span>{emp.roles.join(", ")}</span>
                      </div>
                    )}
                    {/* Assigned shifts breakdown */}
                    {(shiftsPerEmployeeMap[emp.id]?.length ?? 0) > 0 && (
                      <>
                        {shiftsPerEmployeeMap[emp.id].map(({ shiftLabel, days }) => (
                          <div key={shiftLabel} className="flex items-center gap-1 text-xs text-navy-muted dark:text-slate-400">
                            <span className="font-medium text-navy-muted dark:text-slate-400">{shiftLabel}:</span>
                            <span>{days.map(d => DAY_SHORT[d]).join(" ")}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
          )}
        </div>
      )}

      {/* Warnings */}
      {Object.keys(warnings).length > 0 && !warningsIgnored && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-surface-low dark:bg-white/[0.03] px-4 py-3">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> אזהרות שיבוץ</p>
            <button onClick={() => setWarningsIgnored(true)} className="text-xs text-navy-muted/70 dark:text-slate-500 hover:text-navy-muted dark:hover:text-slate-300 font-medium px-2 py-0.5 rounded hover:bg-surface-mid dark:hover:bg-white/5 transition-colors">התעלם</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(warnings).flatMap(([day, msgs]) => msgs.map((m, i) => (
              <span key={day + i} className="inline-flex items-center gap-1.5 text-[11px] bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-2.5 py-1">
                <span className="font-semibold text-amber-700 dark:text-amber-300">{day}</span><span className="text-amber-700/70 dark:text-amber-200/75">{m}</span>
              </span>
            )))}
          </div>
        </div>
      )}

      {/* Conflicts */}
      {Object.keys(conflicts).length > 0 && !conflictsIgnored && (
        <div className="rounded-2xl border border-rose-200 dark:border-rose-500/20 bg-surface-low dark:bg-white/[0.03] px-4 py-3">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> התנגשויות זמינות</p>
            <button onClick={() => setConflictsIgnored(true)} className="text-xs text-navy-muted/70 dark:text-slate-500 hover:text-navy-muted dark:hover:text-slate-300 font-medium px-2 py-0.5 rounded hover:bg-surface-mid dark:hover:bg-white/5 transition-colors">התעלם</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(conflicts).flatMap(([name, slots]) => {
              const empIndex = employees.findIndex(e => (e.name ?? e.email) === name);
              return slots.map((s, i) => (
                <span key={name + i} className="inline-flex items-center gap-1.5 text-[11px] bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg px-2.5 py-1">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: empIndex >= 0 ? empHex(empIndex) : "#6b7280" }} />
                  <span className="font-semibold text-rose-700 dark:text-rose-200">{name.split(" ")[0]}</span><span className="text-rose-700/70 dark:text-rose-200/75">{s}</span>
                </span>
              ));
            })}
          </div>
        </div>
      )}

      {/* Schedule grid */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-surface-mid dark:bg-white/[0.07] animate-pulse" />)}</div>
      ) : loadError ? (
        <div className="rounded-2xl border border-surface-high dark:border-white/10 bg-surface-white dark:bg-white/[0.04] py-16 text-center px-6">
          <p className="text-sm text-navy-muted dark:text-slate-400 mb-4">לא ניתן לטעון את הנתונים.</p>
          <Button onClick={() => window.location.reload()} variant="outline" size="md">נסה שוב</Button>
        </div>
      ) : employees.length === 0 ? (
        <div className="rounded-2xl border border-surface-high dark:border-white/10 bg-surface-white dark:bg-white/[0.04] py-16 text-center px-6">
          <div className="mx-auto w-12 h-12 rounded-full bg-brand-50 dark:bg-brand-500/15 grid place-items-center mb-4">
            <Users className="w-6 h-6 text-brand-600 dark:text-brand-400" />
          </div>
          <p className="font-semibold text-navy dark:text-slate-100 mb-1">עדיין אין עובדים</p>
          <p className="text-sm text-navy-muted dark:text-slate-400 mb-5">הוסף את הצוות שלך כדי להתחיל לשבץ.</p>
          <Button onClick={() => router.push("/settings")} size="md"><Users className="w-4 h-4" /> הוסף עובדים</Button>
        </div>
      ) : !scheduleData ? (
        <div className="rounded-2xl border border-surface-high dark:border-white/10 bg-surface-low dark:bg-white/[0.03] py-16 text-center">
          <p className="text-sm text-navy-muted/70 dark:text-slate-500 mb-4">טרם נוצר סידור עבודה לשבוע זה.</p>
          <Button onClick={generate} loading={generating} size="md">צור סידור אוטומטי</Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-navy-muted/70 dark:text-slate-500 flex items-center gap-1.5"><GripVertical className="w-3.5 h-3.5" /> גרור עובדים בין משמרות · הוסף או הסר בכל תא</p>
            {existing && <p className="text-xs text-navy-muted/70 dark:text-slate-500">עודכן: {format(new Date(existing.updatedAt), "d/M 'בשעה' HH:mm")}</p>}
          </div>
          {filterBar}
          <div className="overflow-x-auto rounded-2xl border border-surface-high dark:border-white/[0.08] bg-surface-white dark:bg-white/[0.04] shadow-card">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-surface-low dark:bg-white/[0.03] border-b border-surface-highest dark:border-white/[0.12]">
                  <th className="text-right py-3 ps-4 pe-3 text-xs font-semibold text-navy-muted dark:text-slate-400 w-28 whitespace-nowrap border-e border-surface-high/60 dark:border-white/[0.06]">משמרת</th>
                  {DAYS.map(day => (
                    <th key={day} className="py-3 px-3 text-center text-xs font-semibold text-navy dark:text-slate-100 min-w-[90px] border-e border-surface-high/60 dark:border-white/[0.06] last:border-e-0">
                      {DAY_LABELS_HE[day as Day]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shiftKeys.map((shift, si) => {
                  const shiftCfg = shifts.find(s => s.id === shift);
                  const dotColors = ["bg-yellow-400","bg-orange-400","bg-indigo-400","bg-blue-400","bg-pink-400"];
                  return (
                  <tr
                    key={shift}
                    className={cn("border-b border-surface-high dark:border-white/[0.08] last:border-0 transition-opacity", draggingRow === shift && "opacity-40")}
                    draggable
                    onDragStart={() => setDraggingRow(shift)}
                    onDragEnd={() => { setDraggingRow(null); setDragOverRow(null); }}
                    onDragOver={e => { e.preventDefault(); setDragOverRow(shift); }}
                    onDragLeave={() => setDragOverRow(null)}
                    onDrop={() => handleRowDrop(shift)}
                    style={dragOverRow === shift && draggingRow !== shift ? { outline: "2px solid #6366f1", outlineOffset: "-2px" } : undefined}
                  >
                    <td className="py-3 ps-4 pe-3 align-middle border-e border-surface-high/60 dark:border-white/[0.06]">
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-4 h-4 text-navy-muted/50 dark:text-slate-600 cursor-grab active:cursor-grabbing flex-shrink-0" aria-label="גרור לסידור מחדש" />
                        <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", dotColors[si % dotColors.length])} />
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-navy dark:text-slate-100 whitespace-nowrap">{shiftCfg?.label ?? shift}</span>
                          </div>
                          {shiftCfg?.role && (() => {
                            const rc = roleColorMap[shiftCfg.role];
                            return (
                              <span
                                className="inline-block mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                                style={{ background: rc?.bg, color: rc?.text, border: `1px solid ${rc?.border}` }}
                              >
                                {shiftCfg.role}
                              </span>
                            );
                          })()}
                          <span className="block text-[10px] text-navy-muted/70 dark:text-slate-500 whitespace-nowrap" dir="ltr">{shiftCfg?.start}–{shiftCfg?.end}</span>
                        </div>
                      </div>
                    </td>
                    {DAYS.map(day => {
                      const slot = scheduleData[day]?.[shift];
                      const names = slot?.employeeNames ?? [];
                      const isEditingThis = editingCell?.day === day && editingCell?.shift === shift;
                      const shiftRole = shiftCfg?.role?.trim() || undefined;
                      const AVAIL_ORDER = { available: 0, prefer_not: 1, unavailable: 2 };
                      const availableToAdd = employees
                        .filter(e =>
                          !(slot?.employeeIds ?? []).includes(e.id) &&
                          (!shiftRole || e.roles.includes(shiftRole))
                        )
                        .sort((a, b) => {
                          const av = a.constraints[0]?.data?.[day as Day]?.[shift] ?? "available";
                          const bv = b.constraints[0]?.data?.[day as Day]?.[shift] ?? "available";
                          return AVAIL_ORDER[av] - AVAIL_ORDER[bv];
                        });
                      const pinnedIds = slot?.pinnedIds ?? [];

                      const isDropTarget = dragOver?.day === day && dragOver?.shift === shift;
                      const alreadyInSlot = dragging && (slot?.employeeIds ?? []).includes(dragging.empId);
                      const cellAv = dragging && !alreadyInSlot
                        ? (empMap[dragging.empId]?.constraints[0]?.data?.[day as Day]?.[shift] ?? "available")
                        : null;
                      // Ambient bg shown for all cells while dragging
                      const dragBg = alreadyInSlot ? "bg-surface-mid dark:bg-white/[0.07]"
                        : cellAv === "available" ? "bg-emerald-50 dark:bg-emerald-500/10"
                        : cellAv === "prefer_not" ? "bg-amber-50 dark:bg-amber-500/10"
                        : cellAv === "unavailable" ? "bg-rose-50 dark:bg-rose-500/10"
                        : "";
                      // Stronger outline only on the hovered cell
                      const dropOutline = isDropTarget
                        ? alreadyInSlot ? "outline outline-2 outline-gray-400 rounded-lg"
                          : cellAv === "available" ? "outline outline-2 outline-green-500 rounded-lg"
                          : cellAv === "prefer_not" ? "outline outline-2 outline-yellow-400 rounded-lg"
                          : "outline outline-2 outline-red-400 rounded-lg"
                        : "";
                      return (
                        <td
                          key={day}
                          className={cn("py-2 px-2 align-top transition-colors border-e border-surface-high/60 dark:border-white/[0.06] last:border-e-0", dragging && dragBg, dropOutline)}
                          onDragOver={e => { e.preventDefault(); setDragOver({ day, shift }); }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={() => handleDrop(day, shift)}
                        >
                          <div className="flex flex-col gap-2.5">
                            {names.map((name, ni) => {
                              const empId = slot?.employeeIds?.[ni];
                              if (empFilter !== null && empId !== empFilter) return null;
                              const isPinned = !!empId && pinnedIds.includes(empId);
                              const av = empId ? (empMap[empId]?.constraints[0]?.data?.[day as Day]?.[shift] ?? "available") : "available";
                              const avBorder = av === "available" ? "border-success-500/50" : av === "prefer_not" ? "border-warning-500/60" : "border-danger-500/70";
                              return (
                              <div
                                key={empId ?? name}
                                className="group relative"
                                draggable
                                onDragStart={() => setDragging({ empId: empId!, name, fromDay: day, fromShift: shift })}
                                onDragEnd={() => { setDragging(null); setDragOver(null); }}
                              >
                                <div
                                  className={cn(
                                    "flex items-center gap-2 ps-1 pe-3 py-1.5 rounded-full w-full cursor-grab active:cursor-grabbing bg-surface-white dark:bg-white/[0.05] border-2 transition-shadow hover:shadow-xs",
                                    avBorder
                                  )}
                                >
                                  <Avatar name={name} color={(empId && colorMap[empId]) || "#6b7280"} size={22} />
                                  <span className="text-sm font-semibold text-navy dark:text-slate-100 truncate flex-1 text-start leading-tight">{name.split(" ")[0]}</span>
                                  {isPinned && <Pin className="w-3 h-3 text-brand-600 dark:text-brand-400 flex-shrink-0" />}
                                </div>
                                {/* Remove button */}
                                <button
                                  onClick={e => { e.stopPropagation(); removeFromSlot(day, shift, ni); }}
                                  className="absolute -top-1.5 -start-1.5 w-5 h-5 rounded-full bg-surface-white dark:bg-white/[0.04] border border-surface-high dark:border-white/[0.08] hover:bg-danger-500 hover:border-danger-500 text-navy-muted dark:text-slate-400 hover:text-white flex items-center justify-center z-10 transition-colors opacity-0 group-hover:opacity-100 shadow-xs"
                                  title="הסר ממשמרת"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                              );
                            })}

                            {/* Add employee picker */}
                            {isEditingThis ? (
                              <div ref={pickerRef} className="rounded-lg border border-surface-high dark:border-white/[0.08] bg-surface-mid dark:bg-white/[0.06] shadow-md overflow-hidden z-20 relative">
                                {availableToAdd.length === 0 ? (
                                  <p className="px-2 py-1.5 text-xs text-navy-muted/70 dark:text-slate-500">{shiftRole ? `אין עובדים מוסמכים ל"${shiftRole}"` : "כולם כבר מוקצים"}</p>
                                ) : availableToAdd.map(emp => {
                                  const av = emp.constraints[0]?.data?.[day as Day]?.[shift] ?? "available";
                                  const dot = av === "available" ? "bg-green-500" : av === "prefer_not" ? "bg-yellow-400" : "bg-red-600";
                                  const avLabel = av === "available" ? "זמין" : av === "prefer_not" ? "מעדיף לא" : "לא זמין";
                                  return (
                                    <button
                                      key={emp.id}
                                      onClick={() => addToSlot(emp, day, shift)}
                                      className="flex items-center gap-2 w-full text-right px-2.5 py-1.5 text-xs transition-colors border-b border-surface-high dark:border-white/[0.08] last:border-0 hover:bg-surface-low dark:hover:bg-white/[0.03]"
                                    >
                                      <span className={cn("w-2 h-2 rounded-full flex-shrink-0", dot)} />
                                      <span className="flex-1">
                                        <span className="block">{emp.name ?? emp.email}</span>
                                        <span className="text-[10px] text-navy-muted/70 dark:text-slate-500">
                                          {emp.roles.length > 0 ? emp.roles.join(", ") : "ללא תפקיד"}{" · "}{avLabel}
                                        </span>
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (slot?.employeeIds ?? []).length < (shifts.find(s => s.id === shift)?.minWorkers ?? 2) && (
                              <button
                                onClick={e => { e.stopPropagation(); setEditingCell({ day, shift }); }}
                                className="w-full flex items-center justify-center gap-1 text-slate-400/60 hover:text-brand-600 dark:hover:text-brand-400 text-[11px] font-medium py-1 rounded-lg border border-dashed border-surface-highest dark:border-white/[0.12] hover:border-brand-300 dark:hover:border-brand-400/40 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
                                title="הוסף עובד"
                              >
                                <Plus className="w-3.5 h-3.5" /> הוסף
                              </button>
                            )}
                            {(slot?.employeeIds ?? []).length > 0 && (
                              <button
                                onClick={e => { e.stopPropagation(); setConfirmClear({ day, shift }); }}
                                className="w-full text-center text-[10px] font-normal py-0.5 rounded text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                              >
                                מחק משמרת
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </>
      )}

      {/* Success toast — top center, green */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-green-600 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-xl">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}

      {/* Error toast — top center, red */}
      {errorToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-red-600 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-xl">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          {errorToast}
        </div>
      )}

      {/* Undo toast — bottom center */}
      {undoSnap && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-navy dark:bg-[#1b2942] text-white text-sm font-medium px-4 py-3 rounded-xl shadow-xl ring-1 ring-white/10">
          <span>{undoSnap.label}</span>
          <button onClick={doUndo} className="font-bold text-brand-300 hover:text-brand-200 transition-colors">בטל</button>
        </div>
      )}

      {/* Confirm regenerate dialog */}
      {confirmRegen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#131f33] rounded-2xl shadow-xl p-6 max-w-xs w-full text-center" dir="rtl">
            <p className="font-bold text-navy dark:text-slate-100 text-base mb-1">יצירת שיבוץ חדש</p>
            <p className="text-sm text-navy-muted dark:text-slate-400 mb-5">פעולה זו תחליף את השיבוץ הנוכחי (פרט למשובצים נעוצים). להמשיך?</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => { setConfirmRegen(false); generate(); }}
                className="flex-1 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors"
              >
                צור מחדש
              </button>
              <button
                onClick={() => setConfirmRegen(false)}
                className="flex-1 py-2 rounded-lg border border-surface-high dark:border-white/[0.08] hover:bg-surface-low dark:hover:bg-white/[0.03] text-navy dark:text-slate-100 text-sm font-semibold transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conflict dialog */}
      {conflictDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#131f33] rounded-2xl shadow-xl p-6 max-w-sm w-full relative" dir="rtl">
            <button
              onClick={() => setConflictDialog(null)}
              className="absolute top-4 left-4 text-navy-muted/70 dark:text-slate-500 hover:text-navy-muted dark:hover:text-slate-400 text-xl leading-none"
            >
              ×
            </button>
            <h3 className="font-bold text-navy dark:text-slate-100 text-base mb-1">התנגשות בזמינות</h3>
            <p className="text-xs text-navy-muted dark:text-slate-400 mb-3">העובדים הבאים ציינו שאינם זמינים:</p>
            <ul className="space-y-1 mb-5">
              {conflictDialog.lines.map((line, i) => (
                <li key={i} className="text-sm text-rose-700 dark:text-rose-300 font-medium">• {line}</li>
              ))}
            </ul>
            <div className="flex gap-2 justify-start">
              <Button
                size="md"
                onClick={() => { conflictDialog.onIgnore(); setConflictDialog(null); }}
              >
                התעלם
              </Button>
              <Button variant="outline" size="md" onClick={() => setConflictDialog(null)}>סגור</Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm clear cell dialog */}
      {confirmClear && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#131f33] rounded-2xl shadow-xl p-6 max-w-xs w-full text-center" dir="rtl">
            <p className="font-bold text-navy dark:text-slate-100 text-base mb-1">מחיקת משמרת</p>
            <p className="text-sm text-navy-muted dark:text-slate-400 mb-5">האם אתה בטוח שברצונך להסיר את כל העובדים מהמשמרת?</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => { clearShiftCell(confirmClear.day, confirmClear.shift); setConfirmClear(null); }}
                className="flex-1 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold transition-colors"
              >
                מחק
              </button>
              <button
                onClick={() => setConfirmClear(null)}
                className="flex-1 py-2 rounded-lg border border-surface-high dark:border-white/[0.08] hover:bg-surface-low dark:hover:bg-white/[0.03] text-navy dark:text-slate-100 text-sm font-semibold transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employee constraints overview */}
      {!loading && employees.length > 0 && (
        <div className="rounded-2xl border border-surface-high dark:border-white/10 bg-surface-white dark:bg-white/[0.03] shadow-card">
          <div className="p-4">
            <button onClick={() => setShowAvailDetail(v => !v)} className="w-full flex items-center justify-between">
              <h2 className="font-semibold text-sm text-navy dark:text-slate-100 flex items-center gap-2"><LayoutGrid className="w-4 h-4 text-brand-600 dark:text-brand-400" /> זמינות עובדים</h2>
              <ChevronDown className={cn("w-5 h-5 text-navy-muted dark:text-slate-400 transition-transform", showAvailDetail && "rotate-180")} />
            </button>
            {showAvailDetail && (
            <div className="mt-3">
            <div className="mb-3">{filterBar}</div>

            {/* Legend */}
            <div className="flex gap-3 mb-3 text-xs text-navy-muted dark:text-slate-400">
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-100 dark:bg-emerald-500/15 ring-1 ring-emerald-300 dark:ring-emerald-500/25" />זמין</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-amber-100 dark:bg-amber-500/15 ring-1 ring-amber-300 dark:ring-amber-500/25" />מעדיף לא</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-rose-100 dark:bg-rose-500/15 ring-1 ring-rose-300 dark:ring-rose-500/25" />לא זמין</span>
            </div>

            {/* Overview table */}
            <div className="overflow-x-auto rounded-2xl border border-surface-high dark:border-white/[0.08] bg-surface-white dark:bg-white/[0.04] shadow-card">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-surface-low dark:bg-white/[0.03] border-b border-surface-high dark:border-white/[0.08]">
                    <th className="text-right py-2 ps-3 pe-2 font-semibold text-navy-muted dark:text-slate-400 w-24 whitespace-nowrap">משמרת</th>
                    {DAYS.map(day => (
                      <th key={day} className="py-2 px-1 text-center font-semibold text-navy dark:text-slate-100 min-w-[72px]">
                        {DAY_LABELS_HE[day as Day]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shiftKeys.map((shift, si) => {
                    const shiftCfg = shifts.find(s => s.id === shift);
                    const dotColors = ["bg-yellow-400","bg-orange-400","bg-indigo-400","bg-blue-400","bg-pink-400"];
                    return (
                    <tr key={shift} className="border-b border-surface-high dark:border-white/[0.08] last:border-0">
                      <td className="py-2 ps-3 pe-2 align-middle">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("w-2 h-2 rounded-full flex-shrink-0", dotColors[si % dotColors.length])} />
                          <span className="font-semibold text-navy dark:text-slate-100">{shiftCfg?.label ?? shift}</span>
                        </div>
                      </td>
                      {DAYS.map(day => (
                        <td key={day} className="py-1 px-1 align-top">
                          <div className="flex flex-col gap-0.5">
                            {employees.filter(e => empFilter === null || e.id === empFilter).map(emp => {
                              const av = emp.constraints[0]?.data?.[day as Day]?.[shift] ?? "available";
                              const chipStyle = av === "available"
                                ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-300 dark:ring-emerald-500/25"
                                : av === "prefer_not"
                                ? "bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 ring-1 ring-amber-300 dark:ring-amber-500/25"
                                : "bg-rose-100 dark:bg-rose-500/15 text-rose-800 dark:text-rose-300 ring-1 ring-rose-300 dark:ring-rose-500/25";
                              return (
                                <div
                                  key={emp.id}
                                  className={cn(
                                    "text-xs px-2 py-1 rounded-md font-medium text-center w-full",
                                    chipStyle
                                  )}
                                >
                                  {(emp.name ?? emp.email).split(" ")[0]}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      ))}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden print calendar — captured by html2canvas for PDF download */}
      {scheduleData && (
        <div
          ref={printRef}
          style={{
            position: "absolute", left: "-9999px", top: 0,
            width: "860px", backgroundColor: "#eff6ff",
            padding: "30px 36px", fontFamily: "'Heebo', Arial, sans-serif", direction: "rtl",
          }}
        >
          {/* Logo + Title */}
          <div style={{ textAlign: "center", marginBottom: "16px" }}>
            <img src="/logo.png" alt="ShiftSync" style={{ height: "56px", margin: "0 auto 8px" }} />
            <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: "800", color: "#111827" }}>סידור עבודה שבועי</h2>
            <p style={{ margin: 0, color: "#6b7280", fontSize: "13px" }}>{weekLabel}</p>
          </div>

          {/* Table — shifts as rows, days as columns */}
          <table style={{ width: "100%", borderCollapse: "collapse", backgroundColor: "white", border: "2px solid #60a5fa" }}>
            <thead>
              <tr>
                <th style={{ padding: "12px", textAlign: "center", backgroundColor: "#bfdbfe", border: "1.5px solid #60a5fa", fontWeight: "700", fontSize: "14px", width: "110px", color: "#1e40af" }}>
                  משמרת
                </th>
                {DAYS.map((day, di) => {
                  const date = format(addDays(weekStart, di), "d/M");
                  return (
                    <th key={day} style={{ padding: "12px", textAlign: "center", backgroundColor: "#bfdbfe", border: "1.5px solid #60a5fa", fontWeight: "700" }}>
                      <span style={{ fontSize: "14px", color: "#1e40af" }}>{DAY_LABELS_HE[day as Day]}</span>
                      <br />
                      <span style={{ fontSize: "12px", color: "#3b82f6", fontWeight: "normal" }}>{date}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Shift label column: same-role shifts share the same color
                const rowBgs     = ["#fef9c3","#dcfce7","#fce7f3","#ede9fe","#ffedd5","#fef3c7"];
                const rowBorders = ["#fde047","#86efac","#f9a8d4","#c4b5fd","#fdba74","#fcd34d"];
                const labelColors = ["#854d0e","#166534","#9d174d","#5b21b6","#9a3412","#92400e"];
                const roleColorIdx: Record<string, number> = {};
                let nextIdx = 0;
                shiftKeys.forEach(s => {
                  const cfg = shifts.find(x => x.id === s);
                  const key = cfg?.role?.trim() || `__${s}`;
                  if (!(key in roleColorIdx)) roleColorIdx[key] = nextIdx++;
                });
                return shiftKeys.map((shift) => {
                const shiftCfg = shifts.find(s => s.id === shift);
                const colorKey = shiftCfg?.role?.trim() || `__${shift}`;
                const ci = roleColorIdx[colorKey] ?? 0;
                const rowBg      = rowBgs[ci % rowBgs.length];
                const rowBorder  = rowBorders[ci % rowBorders.length];
                const labelColor = labelColors[ci % labelColors.length];
                return (
                  <tr key={shift}>
                    <td style={{ padding: "12px", textAlign: "center", backgroundColor: rowBg, border: `1.5px solid ${rowBorder}` }}>
                      <span style={{ color: labelColor, fontSize: "15px", fontWeight: "700" }}>{shiftCfg?.label ?? shift}</span>
                      <br />
                      {shiftCfg?.role?.trim() && (
                        <>
                          <span style={{ fontSize: "11px", fontWeight: "600", color: labelColor, opacity: 0.8 }}>{shiftCfg.role}</span>
                          <br />
                        </>
                      )}
                      <span style={{ fontSize: "12px", color: "#9ca3af" }} dir="ltr">{shiftCfg?.start} – {shiftCfg?.end}</span>
                    </td>
                    {DAYS.map((day) => {
                      const names = scheduleData[day]?.[shift]?.employeeNames ?? [];
                      return (
                        <td key={day} style={{ padding: "12px", textAlign: "center", verticalAlign: "middle", backgroundColor: rowBg, border: `1.5px solid ${rowBorder}` }}>
                          {names.length === 0
                            ? <span style={{ color: "#d1d5db", fontSize: "13px" }}>—</span>
                            : names.map((name, ni) => (
                                <div key={ni} style={{ display: "inline-block", margin: "2px 3px", padding: "3px 10px", fontSize: "13px", fontWeight: "700", color: "#111827" }}>
                                  {name}
                                </div>
                              ))}
                        </td>
                      );
                    })}
                  </tr>
                );
              }); })()}
            </tbody>
          </table>

          <div style={{ marginTop: "14px", textAlign: "center", fontSize: "10px", color: "#d1d5db" }}>הופק ע"י ShiftSync</div>
        </div>
      )}
    </div>
  );
}
