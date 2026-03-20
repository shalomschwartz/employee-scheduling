"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, addDays } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type ConstraintData } from "@/components/availability/AvailabilityGrid";
import { getNextWeekStart, SHIFTS, DAYS, DAY_LABELS_HE, cn, type Day } from "@/lib/utils";

type ShiftKey = "MORNING" | "AFTERNOON" | "EVENING";

interface ShiftSlot { employeeIds: string[]; employeeNames: string[]; pinnedIds?: string[]; }
type ScheduleData = Record<string, Record<ShiftKey, ShiftSlot>>;
interface GeneratedSchedule { id: string; status: "DRAFT" | "PUBLISHED"; schedule: ScheduleData; updatedAt: string; }
interface Employee { id: string; name: string | null; email: string; constraints: { data: ConstraintData }[]; }

const EMP_COLORS = [
  "bg-blue-300 text-blue-900", "bg-violet-300 text-violet-900",
  "bg-pink-300 text-pink-900", "bg-indigo-300 text-indigo-900",
  "bg-sky-300 text-sky-900", "bg-fuchsia-300 text-fuchsia-900",
  "bg-purple-300 text-purple-900", "bg-slate-300 text-slate-900",
];

// Hex equivalents of EMP_COLORS for PDF rendering (html2canvas needs inline styles)
const EMP_HEX = ["#93c5fd","#c4b5fd","#f9a8d4","#a5b4fc","#7dd3fc","#f0abfc","#d8b4fe","#cbd5e1"];

export default function DashboardPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [existing, setExisting] = useState<GeneratedSchedule | null>(null);
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [minPerShift, setMinPerShift] = useState(2);

  const [empFilter, setEmpFilter] = useState<string[]>([]);

  // Hidden print-calendar ref for PDF capture
  const printRef = useRef<HTMLDivElement>(null);

  // Manual slot editing
  const [editingCell, setEditingCell] = useState<{ day: string; shift: ShiftKey } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Conflict dialog
  const [conflictDialog, setConflictDialog] = useState<{ lines: string[]; onIgnore: () => void } | null>(null);

const weekStart = getNextWeekStart();
  const weekLabel = `${format(weekStart, "d/M")} – ${format(addDays(weekStart, 6), "d/M/yyyy")}`;

  async function fetchEmployees() {
    const res = await fetch(`/api/admin/constraints?weekStart=${weekStart.toISOString()}`);
    const emps = await res.json();
    if (Array.isArray(emps)) setEmployees(emps);
  }

  useEffect(() => {
    Promise.all([
      fetch(`/api/schedule?weekStart=${weekStart.toISOString()}`).then(r => r.json()),
      fetch(`/api/admin/constraints?weekStart=${weekStart.toISOString()}`).then(r => r.json()),
    ]).then(([sched, emps]) => {
      if (sched?.id) { setExisting(sched); setScheduleData(sched.schedule as ScheduleData); }
      if (Array.isArray(emps)) setEmployees(emps);
      setLoading(false);
    }).catch(() => setLoading(false));

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
    if (!scheduleData) return [];
    const result: string[] = [];
    for (const day of DAYS) {
      const dayData = scheduleData[day];
      if (!dayData) continue;
      for (const shift of (["MORNING", "AFTERNOON", "EVENING"] as ShiftKey[])) {
        const slot = dayData[shift];
        if (!slot) continue;
        const count = slot.employeeIds.length;
        if (count === 0) {
          result.push(`${DAY_LABELS_HE[day as Day]} ${SHIFTS[shift].label}: אין עובדים משובצים`);
        } else if (count < minPerShift) {
          result.push(`${DAY_LABELS_HE[day as Day]} ${SHIFTS[shift].label}: רק ${count}/${minPerShift} עובדים`);
        }
      }
    }
    return result;
  }, [scheduleData, minPerShift]);

  const conflicts = useMemo(() => {
    if (!scheduleData) return [];
    const result: string[] = [];
    for (const day of DAYS) {
      const dayData = scheduleData[day];
      if (!dayData) continue;
      for (const shift of (["MORNING", "AFTERNOON", "EVENING"] as ShiftKey[])) {
        const slot = dayData[shift];
        if (!slot) continue;
        slot.employeeIds.forEach((empId, i) => {
          const emp = empMap[empId];
          if (!emp) return;
          const availability = emp.constraints[0]?.data?.[day as Day]?.[shift] ?? "available";
          if (availability === "unavailable") {
            const name = slot.employeeNames[i] ?? emp.name ?? emp.email;
            result.push(`${name} — ${DAY_LABELS_HE[day as Day]} ${SHIFTS[shift].label}`);
          }
        });
      }
    }
    return result;
  }, [scheduleData, employees]);

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    employees.forEach((emp, i) => {
      map[emp.name ?? emp.email] = EMP_COLORS[i % EMP_COLORS.length];
    });
    return map;
  }, [employees]);

  const hoursMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!scheduleData) return map;
    function shiftHours(shift: ShiftKey) {
      const { start, end } = SHIFTS[shift];
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      return (endMins > startMins ? endMins - startMins : 1440 - startMins + endMins) / 60;
    }
    for (const day of DAYS) {
      for (const shift of (["MORNING", "AFTERNOON", "EVENING"] as ShiftKey[])) {
        const slot = scheduleData[day]?.[shift];
        if (!slot) continue;
        const h = shiftHours(shift);
        slot.employeeIds.forEach(id => {
          map[id] = (map[id] ?? 0) + h;
        });
      }
    }
    return map;
  }, [scheduleData]);


  async function persistSchedule(updated: ScheduleData) {
    setScheduleData(updated);
    await fetch("/api/schedule", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart: weekStart.toISOString(), schedule: updated }),
    });
  }

  function removeFromSlot(name: string, day: string, shift: ShiftKey) {
    if (!scheduleData) return;
    const slot = scheduleData[day][shift];
    const idx = slot.employeeNames.indexOf(name);
    if (idx === -1) return;
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
  }

  function addToSlot(emp: Employee, day: string, shift: ShiftKey) {
    if (!scheduleData) return;
    setEditingCell(null);
    const slot = scheduleData[day][shift];
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
    if (availability === "unavailable") {
      setConflictDialog({
        lines: [`${name} ציין/ה שאינו/ה זמין/ה למשמרת זו`],
        onIgnore: doAdd,
      });
      return;
    }
    doAdd();
  }

  async function handleDownload() {
    if (!scheduleData) return;
    const downloadConflicts: string[] = [];

    for (const day of DAYS) {
      const dayData = scheduleData[day];
      if (!dayData) continue;
      for (const shift of (["MORNING", "AFTERNOON", "EVENING"] as ShiftKey[])) {
        const slot = dayData[shift];
        if (!slot) continue;
        slot.employeeIds.forEach((empId, i) => {
          const emp = empMap[empId];
          if (!emp) return;
          const availability = emp.constraints[0]?.data?.[day as Day]?.[shift] ?? "available";
          if (availability === "unavailable") {
            const name = slot.employeeNames[i] ?? emp.name ?? emp.email;
            downloadConflicts.push(`${name} — ${DAY_LABELS_HE[day as Day]} ${SHIFTS[shift].label}`);
          }
        });
      }
    }

    const doDownload = async () => {
      const { default: html2canvas } = await import("html2canvas");
      const { default: jsPDF } = await import("jspdf");
      if (!printRef.current) return;
      const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const scale = Math.min((pageW - margin * 2) / canvas.width, (pageH - margin * 2) / canvas.height);
      const w = canvas.width * scale;
      const h = canvas.height * scale;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", margin + ((pageW - margin * 2) - w) / 2, margin + ((pageH - margin * 2) - h) / 2, w, h);
      pdf.save(`סידור-עבודה-${format(weekStart, "dd-MM-yyyy")}.pdf`);
    };

    if (downloadConflicts.length > 0) {
      setConflictDialog({ lines: downloadConflicts, onIgnore: doDownload });
    } else {
      await doDownload();
    }
  }

  async function generate() {
    setGenerating(true);
    const res = await fetch("/api/schedule/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minPerShift, weekStart: weekStart.toISOString() }),
    });
    if (res.ok) {
      const data = await res.json();
      setExisting(data.schedule);
      setScheduleData(data.schedule.schedule as ScheduleData);
    }
    setGenerating(false);
  }


  const submitted = employees.filter(e => e.constraints.length > 0).length;
  const shiftKeys: ShiftKey[] = ["MORNING", "AFTERNOON", "EVENING"];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">לוח בקרה</h1>
          <p className="text-sm text-gray-500">שבוע {weekLabel}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Button onClick={generate} loading={generating} variant="outline" size="md">
              {scheduleData ? "צור מחדש" : "צור סידור"}
            </Button>
            {scheduleData && (
              <Button onClick={handleDownload} size="md">הורדה</Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">עובדים למשמרת:</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setMinPerShift(n => Math.max(1, n - 1))} className="w-6 h-6 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 flex items-center justify-center text-base leading-none">−</button>
              <span className="w-6 text-center font-semibold text-gray-800 text-sm">{minPerShift}</span>
              <button onClick={() => setMinPerShift(n => Math.min(10, n + 1))} className="w-6 h-6 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 flex items-center justify-center text-base leading-none">+</button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      {!loading && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "עובדים", value: employees.length },
            { label: "הגישו זמינות", value: submitted, color: submitted === employees.length && employees.length > 0 ? "text-green-600" : "text-amber-600" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="py-3">
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className={cn("text-xl font-bold mt-0.5", s.color ?? "text-gray-900")}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Employee hours cards */}
      {!loading && employees.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {employees.map((emp, i) => {
            const name = emp.name ?? emp.email;
            const hours = hoursMap[emp.id] ?? 0;
            const colorClass = EMP_COLORS[i % EMP_COLORS.length];
            return (
              <Card key={emp.id} className="overflow-hidden">
                <div className={cn("h-1.5 w-full", colorClass.split(" ")[0])} />
                <CardContent className="py-3">
                  <p className="text-xs font-semibold text-gray-700 truncate">{name}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{hours}<span className="text-xs font-normal text-gray-400 mr-1">שעות</span></p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="py-3">
            <p className="text-xs font-semibold text-yellow-800 mb-1">אזהרות:</p>
            <ul className="space-y-0.5">{warnings.map((w, i) => <li key={i} className="text-xs text-yellow-700">• {w}</li>)}</ul>
          </CardContent>
        </Card>
      )}

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3">
            <p className="text-xs font-semibold text-red-800 mb-1">התנגשויות זמינות:</p>
            <ul className="space-y-0.5">{conflicts.map((c, i) => <li key={i} className="text-xs text-red-700">• {c}</li>)}</ul>
          </CardContent>
        </Card>
      )}

      {/* Schedule grid */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />)}</div>
      ) : !scheduleData ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-sm text-gray-400 mb-4">טרם נוצר סידור עבודה לשבוע זה.</p>
            <Button onClick={generate} loading={generating} size="md">צור סידור אוטומטי</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">X להסרה • + להוספה ידנית 📌</p>
            {existing && <p className="text-xs text-gray-400">עודכן: {format(new Date(existing.updatedAt), "d/M 'בשעה' HH:mm")}</p>}
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-right py-3 ps-4 pe-3 text-xs font-semibold text-gray-500 w-28 whitespace-nowrap">משמרת</th>
                  {DAYS.map(day => (
                    <th key={day} className="py-3 px-3 text-center text-xs font-semibold text-gray-700 min-w-[90px]">
                      {DAY_LABELS_HE[day as Day]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shiftKeys.map(shift => (
                  <tr key={shift} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 ps-4 pe-3 align-middle">
                      <div className="flex items-center gap-2">
                        <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0",
                          shift === "MORNING" ? "bg-yellow-400" : shift === "AFTERNOON" ? "bg-orange-400" : "bg-indigo-400"
                        )} />
                        <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">{SHIFTS[shift].label}</span>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">{SHIFTS[shift].start}–{SHIFTS[shift].end}</span>
                      </div>
                    </td>
                    {DAYS.map(day => {
                      const slot = scheduleData[day]?.[shift];
                      const names = slot?.employeeNames ?? [];
                      const isEditingThis = editingCell?.day === day && editingCell?.shift === shift;
                      const AVAIL_ORDER = { available: 0, prefer_not: 1, unavailable: 2 };
                      const availableToAdd = employees
                        .filter(e => !(slot?.employeeIds ?? []).includes(e.id))
                        .sort((a, b) => {
                          const av = a.constraints[0]?.data?.[day as Day]?.[shift] ?? "available";
                          const bv = b.constraints[0]?.data?.[day as Day]?.[shift] ?? "available";
                          return AVAIL_ORDER[av] - AVAIL_ORDER[bv];
                        });
                      const pinnedIds = slot?.pinnedIds ?? [];

                      return (
                        <td key={day} className="py-2 px-2 align-top">
                          <div className="flex flex-col gap-1">
                            {names.map((name, ni) => {
                              const empId = slot?.employeeIds?.[ni];
                              const isPinned = !!empId && pinnedIds.includes(empId);
                              const av = empId ? (empMap[empId]?.constraints[0]?.data?.[day as Day]?.[shift] ?? "available") : "available";
                              const avBorder = av === "available" ? "border-2 border-green-500" : av === "prefer_not" ? "border-2 border-yellow-400" : "border-2 border-red-500";
                              return (
                              <div key={name} className="group relative">
                                <div className={cn(
                                  "text-xs px-2 py-1 rounded-lg font-medium text-center leading-tight w-full",
                                  colorMap[name] ?? "bg-gray-100 text-gray-700",
                                  avBorder
                                )}>
                                  <span className="flex items-center justify-center gap-1">
                                    {isPinned && <span className="text-[9px]">📌</span>}
                                    {name.split(" ")[0]}
                                  </span>
                                </div>
                                {/* Remove button */}
                                <button
                                  onClick={e => { e.stopPropagation(); removeFromSlot(name, day, shift); }}
                                  className="absolute -top-1 -start-1 w-4 h-4 rounded-full bg-gray-400 hover:bg-red-500 text-white text-[9px] font-bold hidden group-hover:flex items-center justify-center z-10 transition-colors"
                                  title="הסר ממשמרת"
                                >
                                  ×
                                </button>
                              </div>
                              );
                            })}

                            {/* Add employee picker */}
                            {isEditingThis ? (
                              <div ref={pickerRef} className="rounded-lg border border-gray-200 bg-white shadow-md overflow-hidden z-20 relative">
                                {availableToAdd.length === 0 ? (
                                  <p className="px-2 py-1.5 text-xs text-gray-400">כולם כבר מוקצים</p>
                                ) : availableToAdd.map(emp => {
                                  const av = emp.constraints[0]?.data?.[day as Day]?.[shift] ?? "available";
                                  const dot = av === "available" ? "bg-green-500" : av === "prefer_not" ? "bg-yellow-400" : "bg-red-600";
                                  const label = av === "available" ? "זמין" : av === "prefer_not" ? "מעדיף לא" : "לא זמין";
                                  return (
                                    <button
                                      key={emp.id}
                                      onClick={() => addToSlot(emp, day, shift)}
                                      className="flex items-center gap-2 w-full text-right px-2.5 py-1.5 text-xs hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                                    >
                                      <span className={cn("w-2 h-2 rounded-full flex-shrink-0", dot)} />
                                      <span className="flex-1">{emp.name ?? emp.email}</span>
                                      <span className="text-[10px] text-gray-400">{label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <button
                                onClick={e => { e.stopPropagation(); setEditingCell({ day, shift }); }}
                                className="w-full text-center text-gray-300 hover:text-gray-500 text-sm py-0.5 rounded hover:bg-gray-50 transition-colors leading-none"
                                title="הוסף עובד"
                              >
                                +
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </>
      )}

      {/* Conflict dialog */}
      {conflictDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full relative" dir="rtl">
            <button
              onClick={() => setConflictDialog(null)}
              className="absolute top-4 left-4 text-gray-400 hover:text-gray-600 text-xl leading-none"
            >
              ×
            </button>
            <h3 className="font-bold text-gray-900 text-base mb-1">התנגשות בזמינות</h3>
            <p className="text-xs text-gray-500 mb-3">העובדים הבאים ציינו שאינם זמינים:</p>
            <ul className="space-y-1 mb-5">
              {conflictDialog.lines.map((line, i) => (
                <li key={i} className="text-sm text-red-600 font-medium">• {line}</li>
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

      {/* Employee constraints overview */}
      {!loading && employees.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm text-gray-900">זמינות עובדים</h2>
              <div className="flex gap-1.5 flex-wrap justify-end">
                <button
                  onClick={() => setEmpFilter([])}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-medium border transition-colors",
                    empFilter.length === 0 ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  )}
                >
                  הכל
                </button>
                {employees.map((emp, i) => {
                  const name = emp.name ?? emp.email;
                  const selected = empFilter.includes(name);
                  return (
                    <button
                      key={emp.id}
                      onClick={() => setEmpFilter(prev => selected ? prev.filter(n => n !== name) : [...prev, name])}
                      className={cn(
                        "px-3 py-1 rounded-lg text-xs font-medium border transition-colors",
                        selected ? cn(EMP_COLORS[i % EMP_COLORS.length], "border-transparent") : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                      )}
                    >
                      {name.split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Overview table */}
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-right py-2 ps-3 pe-2 font-semibold text-gray-500 w-24 whitespace-nowrap">משמרת</th>
                    {DAYS.map(day => (
                      <th key={day} className="py-2 px-1 text-center font-semibold text-gray-700 min-w-[72px]">
                        {DAY_LABELS_HE[day as Day]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shiftKeys.map(shift => (
                    <tr key={shift} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 ps-3 pe-2 align-middle">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("w-2 h-2 rounded-full flex-shrink-0",
                            shift === "MORNING" ? "bg-yellow-400" : shift === "AFTERNOON" ? "bg-orange-400" : "bg-indigo-400"
                          )} />
                          <span className="font-semibold text-gray-700">{SHIFTS[shift].label}</span>
                        </div>
                      </td>
                      {DAYS.map(day => (
                        <td key={day} className="py-1 px-1 align-top">
                          <div className="flex flex-col gap-0.5">
                            {employees.filter(e => empFilter.length === 0 || empFilter.includes(e.name ?? e.email)).map(emp => {
                              const av = emp.constraints[0]?.data?.[day as Day]?.[shift] ?? "available";
                              const chipStyle = av === "available"
                                ? "bg-green-100 text-green-800 hover:bg-green-200"
                                : av === "prefer_not"
                                ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                : "bg-red-100 text-red-800 hover:bg-red-200";
                              return (
                                <div
                                  key={emp.id}
                                  className={cn(
                                    "text-[10px] px-1.5 py-0.5 rounded font-medium text-center w-full",
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
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hidden print calendar — captured by html2canvas for PDF download */}
      {scheduleData && (
        <div
          ref={printRef}
          style={{
            position: "absolute", left: "-9999px", top: 0,
            width: "860px", backgroundColor: "#f7f7f7",
            padding: "30px 36px", fontFamily: "'Heebo', Arial, sans-serif", direction: "rtl",
          }}
        >
          {/* Title */}
          <h2 style={{ textAlign: "center", marginBottom: "6px", fontSize: "22px", fontWeight: "800", color: "#111827" }}>
            סידור עבודה שבועי
          </h2>
          <p style={{ textAlign: "center", color: "#6b7280", fontSize: "13px", marginBottom: "20px" }}>{weekLabel}</p>

          {/* Table — days as rows, shifts as columns */}
          <table style={{ width: "100%", borderCollapse: "collapse", backgroundColor: "white" }}>
            <thead>
              <tr>
                <th style={{ padding: "12px", textAlign: "center", backgroundColor: "#f0f0f0", borderBottom: "1px solid #ddd", fontWeight: "700", fontSize: "14px", width: "110px" }}>
                  יום
                </th>
                {shiftKeys.map(shift => {
                  const color = shift === "MORNING" ? "#15803d" : shift === "AFTERNOON" ? "#ca8a04" : "#3730a3";
                  return (
                    <th key={shift} style={{ padding: "12px", textAlign: "center", backgroundColor: "#f0f0f0", borderBottom: "1px solid #ddd", fontWeight: "700" }}>
                      <span style={{ color, fontSize: "15px" }}>{SHIFTS[shift].label}</span>
                      <br />
                      <span style={{ fontSize: "12px", color: "#9ca3af", fontWeight: "normal" }}>
                        {SHIFTS[shift].start} – {SHIFTS[shift].end}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, di) => {
                const date = format(addDays(weekStart, di), "d/M");
                return (
                  <tr key={day} style={{ borderBottom: "1px solid #ddd" }}>
                    <td style={{ padding: "12px", textAlign: "center", backgroundColor: "#f9fafb", fontWeight: "700", fontSize: "14px", color: "#111827" }}>
                      {DAY_LABELS_HE[day as Day]}
                      <br />
                      <span style={{ fontWeight: "normal", fontSize: "12px", color: "#9ca3af" }}>{date}</span>
                    </td>
                    {shiftKeys.map(shift => {
                      const names = scheduleData[day]?.[shift]?.employeeNames ?? [];
                      return (
                        <td key={shift} style={{ padding: "12px", textAlign: "center", verticalAlign: "middle" }}>
                          {names.length === 0
                            ? <span style={{ color: "#d1d5db", fontSize: "13px" }}>—</span>
                            : names.map((name, ni) => {
                                return (
                                  <div key={ni} style={{ display: "inline-block", margin: "2px 3px", padding: "3px 10px", fontSize: "13px", fontWeight: "700", color: "#111827" }}>
                                    {name.split(" ")[0]}
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

          <div style={{ marginTop: "14px", textAlign: "center", fontSize: "10px", color: "#d1d5db" }}>הופק ע"י ShiftSync</div>
        </div>
      )}
    </div>
  );
}
