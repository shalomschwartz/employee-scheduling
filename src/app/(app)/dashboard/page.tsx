"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Download, Users, LayoutGrid, AlertTriangle, X, Plus, Pin, ChevronDown, Copy, Check, Send, ChevronRight, ChevronLeft, Share2 } from "lucide-react";
import { useEscapeClose } from "@/lib/useEscapeClose";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, addDays } from "date-fns";
import { he } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { type ConstraintData } from "@/components/availability/AvailabilityGrid";
import { getNextWeekStart, DEFAULT_SHIFTS, DAYS, DAY_LABELS_HE, toMins, cn, type Day, type ShiftConfig } from "@/lib/utils";

interface ShiftSlot { employeeIds: string[]; employeeNames: string[]; pinnedIds?: string[]; }
type ScheduleData = Record<string, Record<string, ShiftSlot>>;
interface GeneratedSchedule { id: string; status: "DRAFT" | "PUBLISHED"; schedule: ScheduleData; updatedAt: string; publishedAt?: string | null; }
interface Employee { id: string; name: string | null; email: string; phone?: string | null; constraints: { data: ConstraintData }[]; roles: string[]; contractShifts: number | null; }

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
  const [minRestHours, setMinRestHours] = useState(8);
  const [empFilter, setEmpFilter] = useState<string | null>(null);
  const [setupDone, setSetupDone] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("shiftsync_setup_done") === "true";
  });
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showAvailDetail, setShowAvailDetail] = useState(false);
  const [deadline, setDeadline] = useState<Date | null>(null);

  // Hidden print-calendar ref for PDF capture
  const printRef = useRef<HTMLDivElement>(null);

  // Manual slot editing
  const [editingCell, setEditingCell] = useState<{ day: string; shift: string } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Confirm clear dialog
  const [confirmClear, setConfirmClear] = useState<{ day: string; shift: string } | null>(null);

  // Conflict dialog
  const [conflictDialog, setConflictDialog] = useState<{ lines: string[]; onIgnore: () => void } | null>(null);

  // Drag and drop
  const [dragging, setDragging] = useState<{ empId: string; name: string; fromDay: string; fromShift: string } | null>(null);
  const [dragOver, setDragOver] = useState<{ day: string; shift: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [undoSnap, setUndoSnap] = useState<{ data: ScheduleData; label: string } | null>(null);
  const [confirmGen, setConfirmGen] = useState<string[] | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishStep, setPublishStep] = useState<null | "confirm" | "share">(null);
  const [copying, setCopying] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

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
  useEscapeClose(!!confirmGen, () => setConfirmGen(null));
  useEscapeClose(publishStep !== null && !publishing, () => setPublishStep(null));

  // Fresh "sent" checkmarks every time the share sheet is opened
  useEffect(() => {
    if (publishStep === null) setSentTo(new Set());
  }, [publishStep]);

  const [weekStart, setWeekStart] = useState(() => getNextWeekStart());
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
    setLoading(true);
    setLoadError(false);
    // Week-scoped UI state must not leak across weeks (undo could overwrite the wrong week)
    setUndoSnap(null);
    setEditingCell(null);
    Promise.all([
      fetch(`/api/schedule?weekStart=${weekStart.toISOString()}`).then(r => r.json()),
      fetch(`/api/admin/constraints?weekStart=${weekStart.toISOString()}`).then(r => r.json()),
      fetch("/api/shifts").then(r => r.json()),
      fetch("/api/min-rest-hours").then(r => r.json()),
      fetch("/api/deadline").then(r => r.json()).catch(() => null),
    ]).then(([sched, emps, shiftsCfg, restCfg, deadlineCfg]) => {
      if (sched?.id) { setExisting(sched); setScheduleData(sched.schedule as ScheduleData); }
      else { setExisting(null); setScheduleData(null); }
      if (Array.isArray(emps)) setEmployees(emps);
      if (shiftsCfg?.shifts) setShifts(shiftsCfg.shifts);
      if (typeof restCfg?.minRestHours === "number") setMinRestHours(restCfg.minRestHours);
      setDeadline(deadlineCfg?.deadline ? new Date(deadlineCfg.deadline) : null);
      setLoading(false);
    }).catch(() => { setLoadError(true); setLoading(false); });

    // Poll for employee constraint updates every 30 seconds
    const interval = setInterval(fetchEmployees, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

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

  // problems: one map of cells that need attention (understaffed / availability conflict),
  // rendered in-place as cell highlights + one clickable counter — no separate strips.
  const problems = useMemo(() => {
    const cells: Record<string, "understaffed" | "conflict"> = {};
    if (!scheduleData) return { cells, count: 0 };
    for (const day of DAYS) {
      const dayData = scheduleData[day] ?? {};
      for (const shiftCfg of shifts) {
        const slot = dayData[shiftCfg.id];
        const key = `${day}-${shiftCfg.id}`;
        // A missing slot (shift added after generation) is an unstaffed shift, not "no problem"
        if ((slot?.employeeIds.length ?? 0) < (shiftCfg.minWorkers ?? 2)) cells[key] = "understaffed";
        if (!slot) continue;
        slot.employeeIds.forEach(empId => {
          const emp = empMap[empId];
          if (!emp) return;
          if ((emp.constraints[0]?.data?.[day as Day]?.[shiftCfg.id] ?? "available") === "unavailable") {
            cells[key] = "conflict"; // conflict outranks understaffed
          }
        });
      }
    }
    return { cells, count: Object.keys(cells).length };
  }, [scheduleData, shifts, empMap]);

  // colorMap: name → hex color (unique per employee, never repeats)
  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    employees.forEach((emp, i) => {
      map[emp.id] = empHex(i);
    });
    return map;
  }, [employees]);

  const submittedCount = useMemo(() => employees.filter(e => e.constraints.length > 0).length, [employees]);

  // Shifts assigned per employee this week — shown as "3/4" next to the contract in the filter chips
  const assignedCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!scheduleData) return map;
    for (const day of DAYS) {
      for (const shiftCfg of shifts) {
        scheduleData[day]?.[shiftCfg.id]?.employeeIds.forEach(id => {
          map[id] = (map[id] ?? 0) + 1;
        });
      }
    }
    return map;
  }, [scheduleData, shifts]);

  const isPublished = existing?.status === "PUBLISHED";
  // Edits after publishing go live to employees instantly — surface that as "שלח עדכון".
  const hasUnsentEdits = isPublished && !!existing?.publishedAt &&
    new Date(existing.updatedAt).getTime() - new Date(existing.publishedAt).getTime() > 3000;

  const nextWeekMs = getNextWeekStart().getTime();
  const relWeek = weekStart.getTime() === nextWeekMs ? "שבוע הבא"
    : weekStart.getTime() === nextWeekMs - 7 * 86400000 ? "השבוע" : null;


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
        setUndoSnap(null); // the action was rolled back — an undo offer would lie
        setErrorToast("שגיאה בשמירת השינויים");
        setTimeout(() => setErrorToast(null), 4000);
      } else {
        // Keep `existing` in sync so post-publish edits flip the button to "שלח עדכון"
        const saved = await res.json().catch(() => null);
        if (saved?.id) setExisting(saved);
      }
    } catch {
      setScheduleData(previous);
      setUndoSnap(null);
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

  // Returns the shift IDs the employee is already in on that day (excluding the target
  // shift, and optionally a shift being vacated by a same-day move).
  function empShiftsOnDay(empId: string, day: string, excludeShift: string, alsoExclude?: string): string[] {
    if (!scheduleData) return [];
    return shifts.map(s => s.id).filter(sid =>
      sid !== excludeShift && sid !== alsoExclude && scheduleData[day]?.[sid]?.employeeIds.includes(empId));
  }

  function hasOverlapConflict(empId: string, day: string, shift: string, alsoExclude?: string): boolean {
    const cfg = shifts.find(s => s.id === shift);
    if (!cfg) return false;
    const [cs, ce] = shiftMinRange(cfg);
    return empShiftsOnDay(empId, day, shift, alsoExclude).some(sid => {
      const other = shifts.find(s => s.id === sid);
      if (!other) return false;
      const [os, oe] = shiftMinRange(other);
      // True interior overlap — touching boundaries (e.g. 07–15 & 15–23) are adjacent, not overlapping
      return cs < oe && os < ce;
    });
  }

  function hasRestViolation(empId: string, day: string, shift: string, alsoExclude?: string): boolean {
    const cfg = shifts.find(s => s.id === shift);
    if (!cfg) return false;
    const [cs, ce] = shiftMinRange(cfg);
    return empShiftsOnDay(empId, day, shift, alsoExclude).some(sid => {
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
    // Shifts added in settings AFTER generation have no slot yet — create one
    // instead of silently doing nothing.
    const slot = scheduleData[day]?.[shift] ?? { employeeIds: [], employeeNames: [], pinnedIds: [] };
    if (slot.employeeIds.includes(emp.id)) return;
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
    const empWorkedDays = DAYS.filter(d => shifts.some(sc => scheduleData[d]?.[sc.id]?.employeeIds.includes(emp.id)));
    if (empWorkedDays.indexOf(day as Day) === -1 && empWorkedDays.length >= 6)
      warnings.push(`${name} כבר עובד/ת 6 ימים השבוע — יום שביעי מנוגד לחוק מנוחה שבועית`);
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
    const toSlot = scheduleData[toDay]?.[toShift] ?? { employeeIds: [], employeeNames: [], pinnedIds: [] };
    if (toSlot.employeeIds.includes(dragging.empId)) {
      setErrorToast(`${dragging.name} כבר משובץ/ת במשמרת זו`);
      setTimeout(() => setErrorToast(null), 3000);
      setDragging(null);
      return;
    }
    const doMove = () => {
      const fromSlot = scheduleData[dragging.fromDay]?.[dragging.fromShift];
      if (!fromSlot) { setDragging(null); return; }
      const idx = fromSlot.employeeIds.indexOf(dragging.empId);
      // Apply the removal first, then the add — sequentially on one object — so a
      // same-day move (fromDay === toDay) can't drop the removal via a duplicate key.
      const updated: ScheduleData = { ...scheduleData };
      updated[dragging.fromDay] = {
        ...updated[dragging.fromDay],
        [dragging.fromShift]: {
          ...fromSlot,
          employeeIds: fromSlot.employeeIds.filter((_, i) => i !== idx),
          employeeNames: fromSlot.employeeNames.filter((_, i) => i !== idx),
          pinnedIds: (fromSlot.pinnedIds ?? []).filter(id => id !== dragging.empId),
        },
      };
      const curToSlot = updated[toDay]?.[toShift] ?? toSlot;
      updated[toDay] = {
        ...updated[toDay],
        [toShift]: {
          ...curToSlot,
          employeeIds: [...curToSlot.employeeIds, dragging.empId],
          employeeNames: [...curToSlot.employeeNames, dragging.name],
          pinnedIds: [...(curToSlot.pinnedIds ?? []), dragging.empId],
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
    // Same-day move: the shift being vacated must not count against the check
    const vacating = dragging.fromDay === toDay ? dragging.fromShift : undefined;
    if (hasOverlapConflict(dragging.empId, toDay, toShift, vacating)) dragWarnings.push(`${dragging.name} כבר משובץ/ת במשמרת חופפת באותו יום`);
    else if (hasRestViolation(dragging.empId, toDay, toShift, vacating)) dragWarnings.push(`${dragging.name} לא יהיו ${minRestHours} שעות מנוחה בין המשמרות`);
    const dragDays = DAYS.filter(d => shifts.some(sc => {
      const s = scheduleData[d]?.[sc.id];
      if (!s?.employeeIds.includes(dragging.empId)) return false;
      if (d === dragging.fromDay && sc.id === dragging.fromShift) return false; // being vacated
      return true;
    }));
    if (dragDays.indexOf(toDay as Day) === -1 && dragDays.length >= 6)
      dragWarnings.push(`${dragging.name} כבר עובד/ת 6 ימים השבוע — יום שביעי מנוגד לחוק מנוחה שבועית`);
    if (dragWarnings.length > 0) {
      setConflictDialog({ lines: dragWarnings, onIgnore: doMove });
      setDragging(null);
      return;
    }
    doMove();
  }

  async function executePdfDownload() {
    setPdfLoading(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const { default: jsPDF } = await import("jspdf");
      if (!printRef.current) return;
      // Deterministic capture: wait for webfonts + the logo before rasterizing
      try { await document.fonts.ready; } catch { /* older browsers */ }
      await Promise.all(
        Array.from(printRef.current.querySelectorAll("img")).map(img => img.decode().catch(() => {}))
      );
      // scale 3 ≈ 285 DPI on landscape A4 — print-sharp and crisp on phone zoom
      const canvas = await html2canvas(printRef.current, { scale: 3, backgroundColor: "#ffffff", useCORS: true });
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const scale = Math.min((pageW - margin * 2) / canvas.width, (pageH - margin * 2) / canvas.height);
      const w = canvas.width * scale;
      const h = canvas.height * scale;
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", margin + ((pageW - margin * 2) - w) / 2, margin + ((pageH - margin * 2) - h) / 2, w, h);
      // Mid-week reprints get a version suffix so the newest file is unambiguous
      const suffix = hasUnsentEdits && existing ? `-עדכון-${format(new Date(existing.updatedAt), "ddMM-HHmm")}` : "";
      pdf.save(`סידור-עבודה-${format(weekStart, "dd-MM-yyyy")}${suffix}.pdf`);
    } catch {
      setErrorToast("שגיאה בהכנת ה-PDF — נסה שנית");
      setTimeout(() => setErrorToast(null), 4000);
    } finally {
      setPdfLoading(false);
    }
  }

  /** wa.me link with an honest, useful message — employees view their shifts in the app. */
  function waShareUrl(): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const msg = `סידור העבודה לשבוע ${weekLabel} פורסם! היכנסו לצפות במשמרות שלכם: ${origin}/my-schedule`;
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  }

  /** All (day, shift) assignments for one employee this week, in week order. */
  function empShiftEntries(empId: string): { dayLabel: string; shiftLabel: string; time: string; mins: number }[] {
    const entries: { dayLabel: string; shiftLabel: string; time: string; mins: number }[] = [];
    if (!scheduleData) return entries;
    for (const day of DAYS) {
      for (const cfg of shifts) {
        if (scheduleData[day]?.[cfg.id]?.employeeIds.includes(empId)) {
          let mins = toMins(cfg.end) - toMins(cfg.start);
          if (mins <= 0) mins += 1440;
          entries.push({ dayLabel: DAY_LABELS_HE[day as Day], shiftLabel: cfg.label, time: `${cfg.start}–${cfg.end}`, mins });
        }
      }
    }
    return entries;
  }

  /** First name only — plus a last-name initial when two employees share a first name. */
  function displayName(emp?: Employee, fallback?: string): string {
    const raw = emp ? (emp.name ?? emp.email.split("@")[0]) : (fallback ?? "");
    const clean = raw.includes("@") ? raw.split("@")[0] : raw;
    const parts = clean.trim().split(/\s+/);
    const first = parts[0] ?? "";
    const dupes = employees.filter(e => (e.name ?? e.email.split("@")[0]).trim().split(/\s+/)[0] === first).length;
    if (dupes > 1 && parts[1]) return `${first} ${parts[1].charAt(0)}׳`;
    return first;
  }

  /** wa.me deep link to a specific employee's chat, prefilled with their own shifts. */
  function personalWaUrl(emp: Employee): string {
    const digits = (emp.phone ?? "").replace(/\D/g, "").replace(/^0/, "972");
    const first = displayName(emp);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const entries = empShiftEntries(emp.id);
    const body = entries.length === 0
      ? "השבוע אינך משובץ/ת למשמרות."
      : entries.map(e => `• ${e.dayLabel} — ${e.shiftLabel} (${e.time})`).join("\n");
    const msg = `היי ${first}! המשמרות שלך לשבוע ${weekLabel}:\n${body}\nלצפייה בכל רגע: ${origin}/my-schedule`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
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
    const lines: string[] = [];
    const notSubmitted = employees.length - submittedCount;
    if (notSubmitted > 0)
      lines.push(`${notSubmitted} עובדים טרם הגישו זמינות — מי שלא הגיש ייחשב כזמין בכל המשמרות`);
    if (scheduleData)
      lines.push("יצירת סידור חדש תחליף את הסידור הנוכחי (פרט למשובצים נעוצים)");
    if (lines.length === 0) { generate(); return; }
    setConfirmGen(lines);
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
        const now = new Date().toISOString();
        setExisting(prev => (prev ? { ...prev, status: "PUBLISHED", publishedAt: now, updatedAt: now } : prev));
        setPublishStep("share");
        if (!setupDone) {
          localStorage.setItem("shiftsync_setup_done", "true");
          setSetupDone(true);
        }
      } else {
        setPublishStep(null);
        setErrorToast("שגיאה בפרסום הסידור");
        setTimeout(() => setErrorToast(null), 4000);
      }
    } catch {
      setPublishStep(null);
      setErrorToast("שגיאת רשת — נסה שנית");
      setTimeout(() => setErrorToast(null), 4000);
    }
    setPublishing(false);
  }

  function scrollToFirstProblem() {
    const key = Object.keys(problems.cells)[0];
    if (!key) return;
    const el = document.getElementById(`cell-${key}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-amber-400");
    setTimeout(() => el.classList.remove("ring-2", "ring-amber-400"), 1800);
  }

  async function copyLastWeek() {
    setCopying(true);
    try {
      // UTC math — addDays keeps local wall-clock and drifts the key across DST changes
      const prev = new Date(weekStart.getTime() - 7 * 86400000);
      const res = await fetch(`/api/schedule?weekStart=${prev.toISOString()}`);
      const data = res.ok ? await res.json() : null;
      if (!data?.schedule) {
        setErrorToast("אין סידור בשבוע הקודם להעתקה");
        setTimeout(() => setErrorToast(null), 3000);
      } else {
        await persistSchedule(data.schedule as ScheduleData);
        setToast("הסידור הועתק מהשבוע הקודם");
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      setErrorToast("שגיאה בהעתקה");
      setTimeout(() => setErrorToast(null), 4000);
    }
    setCopying(false);
  }

  function doUndo() {
    if (!undoSnap) return;
    persistSchedule(undoSnap.data);
    setUndoSnap(null);
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
        const assigned = assignedCountMap[id] ?? 0;
        const contract = emp.contractShifts;
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
            {scheduleData && contract != null && contract > 0 && (
              <span className={cn(
                "ms-1.5 tnum font-semibold",
                selected ? "text-white/85" : assigned < contract ? "text-amber-600 dark:text-amber-400" : assigned > contract ? "text-rose-600 dark:text-rose-400" : "text-navy-muted/70 dark:text-slate-500"
              )}>
                {assigned}/{contract}
              </span>
            )}
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

      {/* First-run setup checklist — disappears after the first publish */}
      {!setupDone && !loading && (
        <div className="rounded-xl border border-surface-high dark:border-white/[0.08] bg-surface-white dark:bg-white/[0.04] shadow-card px-4 py-3 flex items-center gap-x-4 gap-y-2 flex-wrap text-xs">
          <span className="font-semibold text-navy dark:text-slate-100">צעדים ראשונים:</span>
          {[
            { label: "הוסף עובדים", done: employees.length > 0, href: "/settings" },
            { label: "העובדים מגישים זמינות", done: submittedCount > 0 },
            { label: "צור סידור", done: !!scheduleData },
            { label: "פרסם לעובדים", done: isPublished },
          ].map(step => (
            <span key={step.label} className={cn("flex items-center gap-1.5", step.done ? "text-emerald-700 dark:text-emerald-400" : "text-navy-muted dark:text-slate-400")}>
              {step.done
                ? <Check className="w-3.5 h-3.5" />
                : <span className="w-3.5 h-3.5 rounded-full border-2 border-current opacity-50 inline-block" />}
              {step.href && !step.done
                ? <button onClick={() => router.push(step.href)} className="underline underline-offset-2 hover:text-brand-600 dark:hover:text-brand-400">{step.label}</button>
                : step.label}
            </span>
          ))}
          <button
            onClick={() => { localStorage.setItem("shiftsync_setup_done", "true"); setSetupDone(true); }}
            aria-label="סגור"
            className="ms-auto text-navy-muted/60 dark:text-slate-500 hover:text-navy-muted dark:hover:text-slate-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-navy dark:text-slate-100 tracking-tight">לוח בקרה</h1>
          <div className="flex items-center gap-1.5 mt-1">
            <button onClick={() => setWeekStart(w => new Date(w.getTime() - 7 * 86400000))} aria-label="שבוע קודם" className="w-7 h-7 grid place-items-center rounded-lg text-navy-muted dark:text-slate-400 hover:bg-surface-mid dark:hover:bg-white/[0.06] transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
            <p className="text-sm font-medium text-navy dark:text-slate-300 min-w-[150px] text-center tnum">{weekLabel}</p>
            <button onClick={() => setWeekStart(w => new Date(w.getTime() + 7 * 86400000))} aria-label="שבוע הבא" className="w-7 h-7 grid place-items-center rounded-lg text-navy-muted dark:text-slate-400 hover:bg-surface-mid dark:hover:bg-white/[0.06] transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          {/* Stage-aware status line — the one line that tells the manager where they are */}
          {!loading && employees.length > 0 && (
            <div className="flex items-center gap-2 mt-2.5 flex-wrap text-xs">
              {relWeek && (
                <span className="px-2 py-0.5 rounded-full bg-surface-mid dark:bg-white/[0.08] text-navy-muted dark:text-slate-300 font-medium">{relWeek}</span>
              )}
              {scheduleData ? (
                <>
                  <span className={cn(
                    "px-2 py-0.5 rounded-full font-semibold",
                    hasUnsentEdits ? "bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300"
                      : isPublished ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                      : "bg-surface-mid dark:bg-white/[0.08] text-navy-muted dark:text-slate-300"
                  )}>
                    {hasUnsentEdits ? "פורסם · יש שינויים שלא נשלחו" : isPublished ? "פורסם" : "טיוטה"}
                  </span>
                  {problems.count > 0 ? (
                    <button
                      onClick={scrollToFirstProblem}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 font-semibold hover:bg-amber-200 dark:hover:bg-amber-500/25 transition-colors"
                    >
                      <AlertTriangle className="w-3 h-3" /> {problems.count} בעיות
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium"><Check className="w-3 h-3" /> אין בעיות</span>
                  )}
                </>
              ) : (
                <>
                  <span className={cn(
                    "px-2 py-0.5 rounded-full font-semibold",
                    submittedCount < employees.length
                      ? "bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300"
                      : "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                  )}>
                    {submittedCount}/{employees.length} הגישו זמינות
                  </span>
                  {deadline && Date.now() < deadline.getTime() && (
                    <span className="text-navy-muted dark:text-slate-400">דדליין: {format(deadline, "EEEE HH:mm", { locale: he })}</span>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!scheduleData ? (
            <Button onClick={requestGenerate} loading={generating} disabled={employees.length === 0} size="lg" className="bg-gradient-to-l from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 shadow-card">
              <Sparkles className="w-[18px] h-[18px]" /> צור סידור
            </Button>
          ) : (
            <>
              <button
                onClick={requestGenerate}
                disabled={generating}
                className="text-xs font-medium text-navy-muted dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 underline underline-offset-2 disabled:opacity-50"
              >
                {generating ? "יוצר…" : "צור מחדש"}
              </button>
              {!isPublished || hasUnsentEdits ? (
                <Button onClick={() => setPublishStep("confirm")} loading={publishing} size="lg" variant="accent">
                  <Send className="w-[18px] h-[18px]" /> {hasUnsentEdits ? "שלח עדכון" : "פרסם"}
                </Button>
              ) : (
                <Button onClick={() => setPublishStep("share")} size="lg" variant="outline">
                  <Share2 className="w-[18px] h-[18px]" /> שתף
                </Button>
              )}
            </>
          )}
        </div>
      </div>

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
        <div className="rounded-2xl border border-surface-high dark:border-white/10 bg-surface-low dark:bg-white/[0.03] py-16 text-center px-6">
          <p className="text-sm text-navy-muted/70 dark:text-slate-500 mb-4">טרם נוצר סידור עבודה לשבוע זה.</p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Button onClick={requestGenerate} loading={generating} size="md">צור סידור אוטומטי</Button>
            <Button onClick={copyLastWeek} loading={copying} variant="outline" size="md"><Copy className="w-4 h-4" /> העתק מהשבוע שעבר</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {filterBar}
            {existing && <p className="text-xs text-navy-muted/70 dark:text-slate-500">עודכן: {format(new Date(existing.updatedAt), "d/M 'בשעה' HH:mm")}</p>}
          </div>
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
                  <tr key={shift} className="border-b border-surface-high dark:border-white/[0.08] last:border-0">
                    <td className="py-3 ps-4 pe-3 align-middle border-e border-surface-high/60 dark:border-white/[0.06]">
                      <div className="flex items-center gap-2">
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
                      const cellProblem = problems.cells[`${day}-${shift}`];
                      return (
                        <td
                          key={day}
                          id={`cell-${day}-${shift}`}
                          className={cn(
                            "group/cell py-2 px-2 align-top transition-colors border-e border-surface-high/60 dark:border-white/[0.06] last:border-e-0",
                            !dragging && cellProblem === "understaffed" && "bg-amber-50/70 dark:bg-amber-500/[0.08]",
                            !dragging && cellProblem === "conflict" && "bg-rose-50/70 dark:bg-rose-500/[0.08]",
                            dragging && dragBg, dropOutline
                          )}
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
                              const avBorder = av === "available" ? "border-surface-high dark:border-white/10" : av === "prefer_not" ? "border-warning-500/60" : "border-danger-500/70";
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
                                  className="absolute -top-1.5 -start-1.5 w-5 h-5 rounded-full bg-surface-white dark:bg-white/[0.04] border border-surface-high dark:border-white/[0.08] hover:bg-danger-500 hover:border-danger-500 text-navy-muted dark:text-slate-400 hover:text-white flex items-center justify-center z-10 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 shadow-xs"
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
                                  // The full truth up front: computed blockers, not just submitted availability —
                                  // otherwise the row says "זמין" and the click surprises with a warning dialog.
                                  const blockers: string[] = [];
                                  if (hasOverlapConflict(emp.id, day, shift)) blockers.push("משובץ במשמרת חופפת");
                                  else if (hasRestViolation(emp.id, day, shift)) blockers.push(`פחות מ-${minRestHours} שעות מנוחה`);
                                  const empDays = DAYS.filter(d => shifts.some(sc => scheduleData?.[d]?.[sc.id]?.employeeIds.includes(emp.id)));
                                  if (empDays.indexOf(day) === -1 && empDays.length >= 6) blockers.push("כבר עובד 6 ימים");
                                  const weekCount = Object.values(scheduleData ?? {}).flatMap(dd => Object.values(dd)).filter(s => s.employeeIds.includes(emp.id)).length;
                                  if (emp.contractShifts != null && emp.contractShifts > 0 && weekCount >= emp.contractShifts) blockers.push(`הגיע ליעד החוזה (${weekCount}/${emp.contractShifts})`);
                                  return { emp, av, blockers };
                                })
                                .sort((a, b) => {
                                  const score = (x: { av: string; blockers: string[] }) =>
                                    x.av === "unavailable" ? 3 : x.blockers.length > 0 ? 2 : x.av === "prefer_not" ? 1 : 0;
                                  return score(a) - score(b);
                                })
                                .map(({ emp, av, blockers }) => {
                                  const blocked = blockers.length > 0 || av === "unavailable";
                                  const dot = av === "unavailable" ? "bg-red-600" : blockers.length > 0 ? "bg-amber-500" : av === "prefer_not" ? "bg-yellow-400" : "bg-green-500";
                                  const statusText = av === "unavailable"
                                    ? ["לא זמין", ...blockers].join(" · ")
                                    : blockers.length > 0 ? blockers.join(" · ")
                                    : av === "prefer_not" ? "מעדיף לא" : "זמין";
                                  return (
                                    <button
                                      key={emp.id}
                                      onClick={() => addToSlot(emp, day, shift)}
                                      className={cn(
                                        "flex items-center gap-2 w-full text-right px-2.5 py-1.5 text-xs transition-colors border-b border-surface-high dark:border-white/[0.08] last:border-0 hover:bg-surface-low dark:hover:bg-white/[0.03]",
                                        blocked && "opacity-70"
                                      )}
                                    >
                                      <span className={cn("w-2 h-2 rounded-full flex-shrink-0", dot)} />
                                      <span className="flex-1">
                                        <span className="block">{emp.name ?? emp.email}</span>
                                        <span className={cn(
                                          "text-[10px]",
                                          blocked ? (av === "unavailable" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400") : "text-navy-muted/70 dark:text-slate-500"
                                        )}>
                                          {emp.roles.length > 0 ? `${emp.roles.join(", ")} · ` : ""}{statusText}
                                        </span>
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              // Always available — a busy Friday may legitimately need MORE than
                              // the minimum; prominent while understaffed, subtle once met.
                              <button
                                onClick={e => { e.stopPropagation(); setEditingCell({ day, shift }); }}
                                className={cn(
                                  "w-full flex items-center justify-center gap-1 text-[11px] font-medium py-1 rounded-lg transition-all text-navy-muted/50 dark:text-slate-600 hover:text-brand-600 dark:hover:text-brand-400",
                                  (slot?.employeeIds ?? []).length < (shifts.find(s => s.id === shift)?.minWorkers ?? 2)
                                    ? "border border-dashed border-surface-high/70 dark:border-white/[0.08] hover:border-brand-300 dark:hover:border-brand-400/40 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                                    : "opacity-100 sm:opacity-0 sm:group-hover/cell:opacity-100 focus:opacity-100"
                                )}
                                title="הוסף עובד"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                {(slot?.employeeIds ?? []).length < (shifts.find(s => s.id === shift)?.minWorkers ?? 2) ? "הוסף" : null}
                              </button>
                            )}
                            {(slot?.employeeIds ?? []).length > 0 && (
                              <button
                                onClick={e => { e.stopPropagation(); setConfirmClear({ day, shift }); }}
                                className="w-full text-center text-[10px] font-normal py-0.5 rounded text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all opacity-100 sm:opacity-0 sm:group-hover/cell:opacity-100 focus:opacity-100"
                              >
                                נקה תא
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

      {/* Confirm generate dialog — regenerate overwrite + non-submitter heads-up */}
      {confirmGen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#131f33] rounded-2xl shadow-xl p-6 max-w-sm w-full" dir="rtl">
            <p className="font-bold text-navy dark:text-slate-100 text-base mb-3">רגע לפני שיוצרים</p>
            <ul className="space-y-2 mb-5">
              {confirmGen.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-navy-muted dark:text-slate-400">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  {line}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button
                onClick={() => { setConfirmGen(null); generate(); }}
                className="flex-1 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors"
              >
                צור סידור
              </button>
              <button
                onClick={() => setConfirmGen(null)}
                className="flex-1 py-2 rounded-lg border border-surface-high dark:border-white/[0.08] hover:bg-surface-low dark:hover:bg-white/[0.03] text-navy dark:text-slate-100 text-sm font-semibold transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish confirm + share sheet */}
      {publishStep && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#131f33] rounded-2xl shadow-xl p-6 max-w-sm w-full text-center" dir="rtl">
            {publishStep === "confirm" ? (
              <>
                <p className="font-bold text-navy dark:text-slate-100 text-base mb-2">{hasUnsentEdits ? "שליחת עדכון לעובדים" : "פרסום הסידור לעובדים"}</p>
                {problems.count > 0 ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300 mb-5 flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" /> יש {problems.count} בעיות בסידור — אפשר לפרסם ולתקן אחר כך.
                  </p>
                ) : (
                  <p className="text-sm text-navy-muted dark:text-slate-400 mb-5">העובדים יוכלו לראות את המשמרות שלהם באפליקציה.</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={publish}
                    disabled={publishing}
                    className="flex-1 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors disabled:opacity-60"
                  >
                    {publishing ? "מפרסם…" : hasUnsentEdits ? "שלח עדכון" : "פרסם"}
                  </button>
                  <button
                    onClick={() => setPublishStep(null)}
                    disabled={publishing}
                    className="flex-1 py-2 rounded-lg border border-surface-high dark:border-white/[0.08] hover:bg-surface-low dark:hover:bg-white/[0.03] text-navy dark:text-slate-100 text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    ביטול
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto w-12 h-12 rounded-full bg-success-100 dark:bg-emerald-500/15 grid place-items-center mb-3">
                  <Check className="w-6 h-6 text-success-600 dark:text-emerald-400" />
                </div>
                <p className="font-bold text-navy dark:text-slate-100 text-base mb-1">הסידור פורסם!</p>
                <p className="text-sm text-navy-muted dark:text-slate-400 mb-5">שתף עם הצוות:</p>
                <div className="space-y-2">
                  <button
                    onClick={() => window.open(waShareUrl(), "_blank")}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#16a34a] hover:bg-[#15803d] text-white text-sm font-semibold transition-colors"
                  >
                    <WhatsAppIcon className="w-4 h-4" /> שלח בוואטסאפ
                  </button>
                  <button
                    onClick={executePdfDownload}
                    disabled={pdfLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-surface-high dark:border-white/10 hover:bg-surface-low dark:hover:bg-white/[0.05] text-navy dark:text-slate-100 text-sm font-semibold transition-colors disabled:opacity-60"
                  >
                    <Download className="w-4 h-4" /> {pdfLoading ? "מכין PDF…" : "הורד PDF"}
                  </button>

                  {/* Personal send — each employee gets their own shifts in their own chat */}
                  {employees.some(e => e.phone && (assignedCountMap[e.id] ?? 0) > 0) && (
                    <div className="pt-2 text-right">
                      <p className="text-xs font-semibold text-navy-muted dark:text-slate-400 mb-1.5">או שלח לכל אחד את המשמרות שלו:</p>
                      <div className="max-h-44 overflow-y-auto space-y-1 pe-0.5">
                        {employees
                          .filter(e => e.phone && (assignedCountMap[e.id] ?? 0) > 0)
                          .map(emp => {
                            const first = displayName(emp);
                            const sent = sentTo.has(emp.id);
                            return (
                              <a
                                key={emp.id}
                                href={personalWaUrl(emp)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setSentTo(prev => { const s = new Set(prev); s.add(emp.id); return s; })}
                                className={cn(
                                  "flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-sm transition-colors",
                                  sent
                                    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                    : "hover:bg-surface-low dark:hover:bg-white/[0.05] text-navy dark:text-slate-100"
                                )}
                              >
                                <Avatar name={emp.name} color={colorMap[emp.id] ?? "#6b7280"} size={20} />
                                <span className="flex-1 text-start font-medium">{first}</span>
                                <span className="text-xs text-navy-muted/70 dark:text-slate-500">{assignedCountMap[emp.id]} משמרות</span>
                                {sent
                                  ? <Check className="w-4 h-4 flex-shrink-0" />
                                  : <WhatsAppIcon className="w-4 h-4 text-[#16a34a] flex-shrink-0" />}
                              </a>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setPublishStep(null)}
                    className="w-full py-2 text-sm text-navy-muted dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 transition-colors"
                  >
                    סגור
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Conflict dialog */}
      {conflictDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#131f33] rounded-2xl shadow-xl p-6 max-w-sm w-full relative" dir="rtl">
            <button
              onClick={() => setConflictDialog(null)}
              aria-label="סגור"
              className="absolute top-4 left-4 text-navy-muted/70 dark:text-slate-500 hover:text-navy-muted dark:hover:text-slate-400 text-xl leading-none"
            >
              ×
            </button>
            <h3 className="font-bold text-navy dark:text-slate-100 text-base mb-1">שים לב לפני השיבוץ</h3>
            <p className="text-xs text-navy-muted dark:text-slate-400 mb-3">בדוק את הנקודות הבאות:</p>
            <ul className="space-y-1 mb-5">
              {conflictDialog.lines.map((line, i) => (
                <li key={i} className="text-sm text-rose-700 dark:text-rose-300 font-medium">• {line}</li>
              ))}
            </ul>
            <div className="flex gap-2 justify-start">
              <Button size="md" onClick={() => setConflictDialog(null)}>ביטול</Button>
              <Button variant="outline" size="md" onClick={() => { conflictDialog.onIgnore(); setConflictDialog(null); }}>שבץ בכל זאת</Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm clear cell dialog */}
      {confirmClear && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#131f33] rounded-2xl shadow-xl p-6 max-w-xs w-full text-center" dir="rtl">
            <p className="font-bold text-navy dark:text-slate-100 text-base mb-1">ניקוי תא</p>
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
            {/* Non-submitters — the availability data below only covers those who submitted */}
            {employees.some(e => e.constraints.length === 0) && (
              <p className="mb-3 text-xs text-navy-muted dark:text-slate-400">
                <span className="font-semibold text-amber-700 dark:text-amber-300">טרם הגישו זמינות:</span>{" "}
                {employees.filter(e => e.constraints.length === 0).map(e => (e.name ?? e.email).split(" ")[0]).join(", ")}
              </p>
            )}

            {/* Legend — only exceptions are shown; an empty cell means everyone is available */}
            <div className="flex gap-3 mb-3 text-xs text-navy-muted dark:text-slate-400 flex-wrap">
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-amber-100 dark:bg-amber-500/15 ring-1 ring-amber-300 dark:ring-amber-500/25" />מעדיף לא</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-rose-100 dark:bg-rose-500/15 ring-1 ring-rose-300 dark:ring-rose-500/25" />לא זמין</span>
              <span className="text-navy-muted/70 dark:text-slate-500">תא ריק = כולם זמינים</span>
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
                              if (emp.constraints.length === 0) return null; // listed above as "טרם הגישו"
                              const av = emp.constraints[0]?.data?.[day as Day]?.[shift] ?? "available";
                              if (av === "available") return null; // exceptions only — empty cell = available
                              const chipStyle = av === "prefer_not"
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
            width: "1050px", backgroundColor: "#ffffff",
            padding: "36px 42px", fontFamily: "var(--font-sans), Arial, sans-serif", direction: "rtl",
          }}
        >
          {/* Header — title right, logo left, navy rule; version stamp for mid-week reprints */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "16px", paddingBottom: "12px", borderBottom: "3px solid #0b2239" }}>
            <div>
              <h2 style={{ margin: "0 0 3px", fontSize: "19px", fontWeight: "800", color: "#0b2239", letterSpacing: "-0.01em" }}>
                סידור עבודה שבועי
                {hasUnsentEdits && (
                  <span style={{ display: "inline-block", marginRight: "10px", padding: "2px 10px", fontSize: "11px", fontWeight: "700", borderRadius: "999px", backgroundColor: "#fef3c7", color: "#b45309", border: "1px solid #b45309", verticalAlign: "2px" }}>
                    גרסה מעודכנת
                  </span>
                )}
              </h2>
              <p style={{ margin: 0, color: "#52647d", fontSize: "14px" }}>
                שבוע {weekLabel}
                {existing && ` · עודכן: ${format(new Date(existing.updatedAt), "d/M HH:mm")}`}
              </p>
            </div>
            <img src="/logo.png" alt="ShiftSync" style={{ height: "44px" }} />
          </div>

          {/* Table — fixed layout (no silent column clipping), wall-size type, grayscale-safe borders */}
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ padding: "10px 12px", textAlign: "right", backgroundColor: "#0b2239", color: "#ffffff", fontWeight: "700", fontSize: "13px", width: "128px" }}>
                  משמרת
                </th>
                {DAYS.map((day, di) => {
                  const date = format(addDays(weekStart, di), "d/M");
                  return (
                    <th key={day} style={{ padding: "10px 4px", textAlign: "center", backgroundColor: "#0b2239" }}>
                      <span style={{ fontSize: "17px", fontWeight: "700", color: "#ffffff" }}>{DAY_LABELS_HE[day as Day]}</span>
                      <br />
                      <span style={{ fontSize: "12px", fontWeight: "400", color: "#f1f5f9" }}>{date}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shiftKeys.map((shift) => {
                const shiftCfg = shifts.find(s => s.id === shift);
                const rc = shiftCfg?.role ? roleColorMap[shiftCfg.role] : undefined;
                return (
                  <tr key={shift}>
                    <td style={{ padding: "10px 12px", textAlign: "right", verticalAlign: "middle", backgroundColor: "#f1f5f9", borderBottom: "1px solid #cbd5e1" }}>
                      <span style={{ display: "block", color: "#0b2239", fontSize: "15px", fontWeight: "700" }}>{shiftCfg?.label ?? shift}</span>
                      {shiftCfg?.role?.trim() && (
                        <span style={{ display: "inline-block", margin: "3px 0 2px", padding: "1px 8px", fontSize: "12px", fontWeight: "600", borderRadius: "999px", background: rc?.bg ?? "#eff6ff", color: rc?.text ?? "#1e40af", border: `1px solid ${rc?.text ?? "#1e40af"}` }}>
                          {shiftCfg.role}
                        </span>
                      )}
                      <span style={{ display: "block", marginTop: "2px", fontSize: "11px", color: "#94a3b8" }} dir="ltr">{shiftCfg?.start} – {shiftCfg?.end}</span>
                    </td>
                    {DAYS.map((day) => {
                      const slot = scheduleData[day]?.[shift];
                      const names = slot?.employeeNames ?? [];
                      const isWeekend = day === "friday" || day === "saturday";
                      return (
                        <td key={day} style={{
                          padding: "8px 4px", textAlign: "center", verticalAlign: "middle",
                          backgroundColor: isWeekend ? "#e8edf3" : "#ffffff",
                          borderBottom: "1px solid #cbd5e1",
                          // solid divider before the weekend so the boundary survives a B&W printer
                          borderRight: day === "friday" ? "2px solid #0b2239" : "1px solid #e2e8f0",
                        }}>
                          {!slot ? (
                            <span style={{ color: "#cbd5e1", fontSize: "13px" }}>—</span>
                          ) : names.length === 0 ? (
                            <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: "999px", backgroundColor: "#fef3c7", color: "#b45309", fontSize: "12px", fontWeight: "700", border: "1px solid #b45309" }}>
                              משמרת פתוחה
                            </span>
                          ) : names.map((name, ni) => {
                            const empId = slot?.employeeIds?.[ni];
                            return (
                              <div key={ni} style={{ margin: "4px 0", fontSize: "16px", fontWeight: "700", color: "#0b2239", overflowWrap: "break-word" }}>
                                {displayName(empId ? empMap[empId] : undefined, name)}
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Personal summary — employee × day mini-table: find your row, scan your week */}
          {employees.some(e => empShiftEntries(e.id).length > 0) && (
            <div style={{ marginTop: "16px" }}>
              <div style={{ fontSize: "13px", fontWeight: "700", color: "#0b2239", marginBottom: "6px" }}>סיכום אישי</div>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ width: "108px", padding: "5px 8px", textAlign: "right", backgroundColor: "#f1f5f9", color: "#52647d", fontSize: "11px", fontWeight: "700", borderBottom: "1px solid #cbd5e1" }}>עובד</th>
                    {DAYS.map(day => (
                      <th key={day} style={{ padding: "5px 2px", textAlign: "center", backgroundColor: "#f1f5f9", color: "#52647d", fontSize: "11px", fontWeight: "700", borderBottom: "1px solid #cbd5e1" }}>
                        {DAY_LABELS_HE[day as Day]}
                      </th>
                    ))}
                    <th style={{ width: "88px", padding: "5px 4px", textAlign: "center", backgroundColor: "#f1f5f9", color: "#52647d", fontSize: "11px", fontWeight: "700", borderBottom: "1px solid #cbd5e1" }}>סה״כ</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => {
                    const entries = empShiftEntries(emp.id);
                    if (entries.length === 0) return null;
                    const hours = Math.round(entries.reduce((a, e) => a + e.mins, 0) / 60);
                    return (
                      <tr key={emp.id}>
                        <td style={{ padding: "5px 8px", textAlign: "right", fontSize: "12.5px", fontWeight: "700", color: "#0b2239", borderBottom: "1px solid #e2e8f0", backgroundColor: "#fbfcfe" }}>
                          {displayName(emp)}
                        </td>
                        {DAYS.map(day => {
                          const dayShifts = shifts.filter(cfg => scheduleData[day]?.[cfg.id]?.employeeIds.includes(emp.id));
                          const isWeekend = day === "friday" || day === "saturday";
                          return (
                            <td key={day} style={{ padding: "5px 2px", textAlign: "center", verticalAlign: "middle", borderBottom: "1px solid #e2e8f0", backgroundColor: isWeekend ? "#eef2f7" : "#ffffff" }}>
                              {dayShifts.map(cfg => (
                                <div key={cfg.id} style={{ fontSize: "11.5px", fontWeight: "600", color: "#0b2239", lineHeight: "1.35" }}>{cfg.label}</div>
                              ))}
                            </td>
                          );
                        })}
                        <td style={{ padding: "5px 4px", textAlign: "center", fontSize: "11px", color: "#52647d", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>
                          {entries.length} מש׳ · {hours} ש׳
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "16px", fontSize: "10.5px", color: "#94a3b8" }}>
            <span>הופק ב-ShiftSync</span>
            <span dir="ltr">{format(new Date(), "d/M/yyyy HH:mm")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
