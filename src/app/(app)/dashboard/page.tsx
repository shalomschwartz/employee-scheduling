"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, addDays } from "date-fns";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AvailabilityGrid, defaultConstraintData, type ConstraintData } from "@/components/availability/AvailabilityGrid";
import { getNextWeekStart, SHIFTS, DAYS, DAY_LABELS_HE, cn, type Day } from "@/lib/utils";

type ShiftKey = "MORNING" | "AFTERNOON" | "EVENING";

interface ShiftSlot { employeeIds: string[]; employeeNames: string[]; pinnedIds?: string[]; }
type ScheduleData = Record<string, Record<ShiftKey, ShiftSlot>>;
interface GeneratedSchedule { id: string; status: "DRAFT" | "PUBLISHED"; schedule: ScheduleData; updatedAt: string; }
interface Employee { id: string; name: string | null; email: string; constraints: { data: ConstraintData }[]; }

const EMP_COLORS = [
  "bg-blue-100 text-blue-800", "bg-violet-100 text-violet-800",
  "bg-emerald-100 text-emerald-800", "bg-rose-100 text-rose-800",
  "bg-amber-100 text-amber-800", "bg-cyan-100 text-cyan-800",
];

export default function DashboardPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [existing, setExisting] = useState<GeneratedSchedule | null>(null);
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [minPerShift, setMinPerShift] = useState(2);

  // Constraint editing
  const [selectedEmp, setSelectedEmp] = useState<{ id: string; name: string } | null>(null);
  const [empConstraints, setEmpConstraints] = useState<ConstraintData>(defaultConstraintData());
  const [loadingConstraints, setLoadingConstraints] = useState(false);
  const [savingConstraints, setSavingConstraints] = useState(false);

  // Manual slot editing
  const [editingCell, setEditingCell] = useState<{ day: string; shift: ShiftKey } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Conflict dialog
  const [conflictDialog, setConflictDialog] = useState<{ lines: string[]; onIgnore: () => void } | null>(null);

  // Bottom constraints panel
  const [cvEmpId, setCvEmpId] = useState<string | null>(null);
  const [cvData, setCvData] = useState<ConstraintData>(defaultConstraintData());
  const [cvEditing, setCvEditing] = useState(false);
  const [cvSaving, setCvSaving] = useState(false);

  const weekStart = getNextWeekStart();
  const weekLabel = `${format(weekStart, "d/M")} – ${format(addDays(weekStart, 6), "d/M/yyyy")}`;

  useEffect(() => {
    Promise.all([
      fetch(`/api/schedule?weekStart=${weekStart.toISOString()}`).then(r => r.json()),
      fetch(`/api/admin/constraints?weekStart=${weekStart.toISOString()}`).then(r => r.json()),
    ]).then(([sched, emps]) => {
      if (sched?.id) { setExisting(sched); setScheduleData(sched.schedule as ScheduleData); }
      if (Array.isArray(emps)) {
        setEmployees(emps);
        if (emps.length > 0) {
          setCvEmpId(emps[0].id);
          setCvData((emps[0].constraints[0]?.data as ConstraintData) ?? defaultConstraintData());
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
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

  const conflicts = useMemo(() => {
    if (!scheduleData) return [];
    const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
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
    if (!scheduleData) return {} as Record<string, string>;
    const names = new Set<string>();
    for (const dayData of Object.values(scheduleData))
      for (const slot of Object.values(dayData))
        for (const n of slot.employeeNames ?? []) names.add(n);
    const map: Record<string, string> = {};
    [...names].forEach((name, i) => { map[name] = EMP_COLORS[i % EMP_COLORS.length]; });
    return map;
  }, [scheduleData]);

  const nameToId = useMemo(() => {
    if (!scheduleData) return {} as Record<string, string>;
    const map: Record<string, string> = {};
    for (const dayData of Object.values(scheduleData))
      for (const slot of Object.values(dayData))
        (slot.employeeIds ?? []).forEach((id, i) => { const n = (slot.employeeNames ?? [])[i]; if (n) map[n] = id; });
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

  function handleDownload() {
    if (!scheduleData) return;
    const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
    const conflicts: string[] = [];

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
            conflicts.push(`${name} — ${DAY_LABELS_HE[day as Day]} ${SHIFTS[shift].label}`);
          }
        });
      }
    }

    const open = () => window.open(`/print?weekStart=${weekStart.toISOString()}`, "_blank");
    if (conflicts.length > 0) {
      setConflictDialog({ lines: conflicts, onIgnore: open });
    } else {
      open();
    }
  }

  async function handleNameClick(name: string) {
    const id = nameToId[name];
    if (!id) return;
    if (selectedEmp?.id === id) { setSelectedEmp(null); return; }
    setSelectedEmp({ id, name });
    setLoadingConstraints(true);
    const res = await fetch(`/api/admin/constraints?weekStart=${weekStart.toISOString()}`);
    if (res.ok) {
      const emps = await res.json();
      const emp = emps.find((e: { id: string }) => e.id === id);
      setEmpConstraints(emp?.constraints[0]?.data ?? defaultConstraintData());
    }
    setLoadingConstraints(false);
  }

  async function generate() {
    setGenerating(true);
    setWarnings([]);
    const res = await fetch("/api/schedule/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minPerShift, weekStart: weekStart.toISOString() }),
    });
    if (res.ok) {
      const data = await res.json();
      setExisting(data.schedule);
      setScheduleData(data.schedule.schedule as ScheduleData);
      setWarnings(data.warnings ?? []);
      setSelectedEmp(null);
    }
    setGenerating(false);
  }

  async function saveEmpConstraints() {
    if (!selectedEmp) return;
    setSavingConstraints(true);
    await fetch("/api/admin/constraints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedEmp.id, weekStart: weekStart.toISOString(), data: empConstraints }),
    });
    setSelectedEmp(null);
    setSavingConstraints(false);
    await generate();
  }

  function selectCvEmp(emp: Employee) {
    setCvEmpId(emp.id);
    setCvData((emp.constraints[0]?.data as ConstraintData) ?? defaultConstraintData());
    setCvEditing(false);
  }

  async function saveCvConstraints() {
    if (!cvEmpId) return;
    setCvSaving(true);
    await fetch("/api/admin/constraints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: cvEmpId, weekStart: weekStart.toISOString(), data: cvData }),
    });
    // Update local employees state
    setEmployees(prev => prev.map(e => e.id === cvEmpId ? { ...e, constraints: [{ data: cvData }] } : e));
    setCvEditing(false);
    setCvSaving(false);
    await generate();
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
            {existing && (
              <Badge variant={existing.status === "PUBLISHED" ? "success" : "warning"}>
                {existing.status === "PUBLISHED" ? "פורסם" : "טיוטה"}
              </Badge>
            )}
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
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "עובדים", value: employees.length },
            { label: "הגישו זמינות", value: submitted, color: submitted === employees.length && employees.length > 0 ? "text-green-600" : "text-amber-600" },
            { label: "סטטוס", value: existing?.status === "PUBLISHED" ? "פורסם" : existing ? "טיוטה" : "אין", color: existing?.status === "PUBLISHED" ? "text-green-600" : "text-gray-500" },
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
            <p className="text-xs text-gray-400">לחץ על שם לעריכת זמינות • X להסרה • + להוספה ידנית 📌</p>
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
                              return (
                              <div key={name} className="group relative">
                                <button
                                  onClick={() => handleNameClick(name)}
                                  className={cn(
                                    "text-xs px-2 py-1 rounded-lg font-medium text-center leading-tight w-full transition-all",
                                    colorMap[name] ?? "bg-gray-100 text-gray-700",
                                    isPinned ? "ring-2 ring-inset ring-gray-400/60" : "",
                                    selectedEmp?.name === name ? "ring-2 ring-offset-1 ring-gray-400" : "hover:opacity-80"
                                  )}
                                >
                                  {isPinned && <span className="me-0.5 text-[9px]">📌</span>}
                                  {name.split(" ")[0]}
                                </button>
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
                                  const dot = av === "available" ? "bg-green-400" : av === "prefer_not" ? "bg-amber-400" : "bg-red-400";
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

          {/* Inline constraint editor */}
          {selectedEmp && (
            <Card className="border-brand-200 bg-brand-50/30">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-sm text-gray-900">זמינות: {selectedEmp.name}</p>
                  <button onClick={() => setSelectedEmp(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">סגור</button>
                </div>
                {loadingConstraints ? (
                  <div className="h-40 rounded-lg bg-gray-100 animate-pulse" />
                ) : (
                  <AvailabilityGrid value={empConstraints} onChange={setEmpConstraints} disabled={savingConstraints} />
                )}
              </CardContent>
              {!loadingConstraints && (
                <CardFooter className="flex justify-end gap-2 pt-0">
                  <Button variant="outline" size="md" onClick={() => setSelectedEmp(null)}>ביטול</Button>
                  <Button size="md" loading={savingConstraints} onClick={saveEmpConstraints}>שמור ועדכן סידור</Button>
                </CardFooter>
              )}
            </Card>
          )}
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

      {/* Employee constraints panel */}
      {!loading && employees.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm text-gray-900">זמינות עובדים</h2>
              {cvEditing ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="md" onClick={() => setCvEditing(false)}>ביטול</Button>
                  <Button size="md" loading={cvSaving} onClick={saveCvConstraints}>שמור ועדכן סידור</Button>
                </div>
              ) : (
                <Button variant="outline" size="md" onClick={() => setCvEditing(true)}>ערוך</Button>
              )}
            </div>

            {/* Employee tabs */}
            <div className="flex gap-1.5 flex-wrap mb-4">
              {employees.map((emp, i) => (
                <button
                  key={emp.id}
                  onClick={() => selectCvEmp(emp)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                    cvEmpId === emp.id
                      ? cn(EMP_COLORS[i % EMP_COLORS.length], "border-transparent")
                      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  )}
                >
                  {emp.name ?? emp.email}
                  {emp.constraints.length === 0 && (
                    <span className="ms-1 text-amber-500">•</span>
                  )}
                </button>
              ))}
            </div>
          </CardContent>

          {cvEmpId && (
            <CardContent className="pt-0 pb-4">
              <AvailabilityGrid value={cvData} onChange={setCvData} disabled={!cvEditing || cvSaving} />
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
