"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, addDays } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type ConstraintData } from "@/components/availability/AvailabilityGrid";
import { getNextWeekStart, DEFAULT_SHIFTS, DAYS, DAY_LABELS_HE, cn, type Day, type ShiftConfig } from "@/lib/utils";

interface ShiftSlot { employeeIds: string[]; employeeNames: string[]; pinnedIds?: string[]; }
type ScheduleData = Record<string, Record<string, ShiftSlot>>;
interface GeneratedSchedule { id: string; status: "DRAFT" | "PUBLISHED"; schedule: ScheduleData; updatedAt: string; }
interface Employee { id: string; name: string | null; email: string; constraints: { data: ConstraintData }[]; }

const EMP_COLORS = [
  "bg-[#273c75] text-white", "bg-[#6c5ce7] text-white",
  "bg-[#e84393] text-white", "bg-[#0984e3] text-white",
  "bg-[#e17055] text-white", "bg-[#00cec9] text-white",
  "bg-[#a29bfe] text-white", "bg-[#2d3436] text-white",
];

// Hex equivalents of EMP_COLORS for PDF rendering (html2canvas needs inline styles)
const EMP_HEX = ["#273c75","#6c5ce7","#e84393","#0984e3","#e17055","#00cec9","#a29bfe","#2d3436"];

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
  const [empFilter, setEmpFilter] = useState<string[]>([]);

  // Hidden print-calendar ref for PDF capture
  const printRef = useRef<HTMLDivElement>(null);

  // Manual slot editing
  const [editingCell, setEditingCell] = useState<{ day: string; shift: string } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Conflict dialog
  const [conflictDialog, setConflictDialog] = useState<{ lines: string[]; onIgnore: () => void } | null>(null);
  const [conflictsIgnored, setConflictsIgnored] = useState(false);
  const [warningsIgnored, setWarningsIgnored] = useState(false);

  // Drag and drop
  const [dragging, setDragging] = useState<{ empId: string; name: string; fromDay: string; fromShift: string } | null>(null);
  const [dragOver, setDragOver] = useState<{ day: string; shift: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("welcome") === "1") {
      setShowWelcome(true);
      setTimeout(() => setShowWelcome(false), 1500);
      router.replace("/dashboard");
    }
  }, [searchParams, router]);

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
      fetch("/api/shifts").then(r => r.json()),
    ]).then(([sched, emps, shiftsCfg]) => {
      if (sched?.id) { setExisting(sched); setScheduleData(sched.schedule as ScheduleData); }
      if (Array.isArray(emps)) setEmployees(emps);
      if (shiftsCfg?.shifts) {
        setShifts(shiftsCfg.shifts);
      }
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
      for (const shiftCfg of shifts) {
        const slot = dayData[shiftCfg.id];
        if (!slot) continue;
        const count = slot.employeeIds.length;
        const min = shiftCfg.minWorkers ?? 2;
        if (count === 0) {
          result.push(`${DAY_LABELS_HE[day as Day]} ${shiftCfg.label}: אין עובדים משובצים`);
        } else if (count < min) {
          result.push(`${DAY_LABELS_HE[day as Day]} ${shiftCfg.label}: רק ${count}/${min} עובדים`);
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


  async function persistSchedule(updated: ScheduleData) {
    setScheduleData(updated);
    await fetch("/api/schedule", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart: weekStart.toISOString(), schedule: updated }),
    });
  }

  function removeFromSlot(name: string, day: string, shift: string) {
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

  function hasConsecutiveConflict(empId: string, day: string, shift: string): boolean {
    if (!scheduleData) return false;
    const si = shifts.findIndex(s => s.id === shift);
    if (si < 0) return false;
    const adjacent = [shifts[si - 1]?.id, shifts[si + 1]?.id].filter(Boolean) as string[];
    return adjacent.some(adjId => scheduleData[day]?.[adjId]?.employeeIds.includes(empId));
  }

  function addToSlot(emp: Employee, day: string, shift: string) {
    if (!scheduleData) return;
    setEditingCell(null);
    const slot = scheduleData[day][shift];
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
    const warnings: string[] = [];
    if (availability === "unavailable") warnings.push(`${name} ציין/ה שאינו/ה זמין/ה למשמרת זו`);
    if (hasConsecutiveConflict(emp.id, day, shift)) warnings.push(`${name} כבר משובץ/ת במשמרת צמודה באותו יום`);
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
    const toSlot = scheduleData[toDay][toShift];
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
      const fromSlot = scheduleData[dragging.fromDay][dragging.fromShift];
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
    const dragWarnings: string[] = [];
    if (availability === "unavailable") dragWarnings.push(`${dragging.name} ציין/ה שאינו/ה זמין/ה למשמרת זו`);
    if (hasConsecutiveConflict(dragging.empId, toDay, toShift)) dragWarnings.push(`${dragging.name} כבר משובץ/ת במשמרת צמודה באותו יום`);
    if (dragWarnings.length > 0) {
      setConflictDialog({ lines: dragWarnings, onIgnore: doMove });
      setDragging(null);
      return;
    }
    doMove();
  }

  async function executePdfDownload() {
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


  const submitted = employees.filter(e => e.constraints.length > 0).length;
  const shiftKeys = shifts.map(s => s.id);

  return (
    <div className="space-y-4">
      {showWelcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowWelcome(false)}>
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-2 mx-6">
            <p className="text-3xl">👋</p>
            <p className="text-2xl font-bold text-gray-900">ברוך הבא{session?.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}!</p>
          </div>
        </div>
      )}

      {/* Guide */}
      <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 text-sm text-gray-700">
          <p className="font-bold text-blue-800 mb-3 text-base">איך ShiftSync עובד</p>
          <div className="space-y-2">
            <div className="flex gap-2"><span className="font-bold text-blue-600">1.</span><span><span className="font-semibold">הוסף עובדים</span> — עבור להגדרות, הוסף את שמות העובדים ומספרי הטלפון שלהם.</span></div>
            <div className="flex gap-2"><span className="font-bold text-blue-600">2.</span><span><span className="font-semibold">קבע דדליין</span> — בהגדרות, בחר מועד אחרון להגשת זמינות (ברירת מחדל: רביעי 21:00).</span></div>
            <div className="flex gap-2"><span className="font-bold text-blue-600">3.</span><span><span className="font-semibold">עובדים ממלאים זמינות</span> — כל עובד נכנס למערכת ומסמן את הימים והמשמרות שמתאימים לו.</span></div>
            <div className="flex gap-2"><span className="font-bold text-blue-600">4.</span><span><span className="font-semibold">צור שיבוץ</span> — לחץ "צור שיבוץ" וה-AI יבנה סידור אוטומטי לפי הזמינויות.</span></div>
            <div className="flex gap-2"><span className="font-bold text-blue-600">5.</span><span><span className="font-semibold">ערוך ידנית</span> — ניתן לגרור עובדים בין משמרות ולהוסיף/להסיר ידנית.</span></div>
            <div className="flex gap-2"><span className="font-bold text-blue-600">6.</span><span><span className="font-semibold">שלח לעובדים</span> — לחץ "הורדה" להורדת PDF, או "שלח לוואצאפ" לפתיחת WhatsApp עם ה-PDF מוכן לשיתוף.</span></div>
          </div>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">לוח בקרה</h1>
          <p className="text-sm text-gray-500">שבוע {weekLabel}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Button onClick={generate} loading={generating} variant="outline" size="md">
              {"צור שיבוץ"}
            </Button>
            {scheduleData && (
              <Button onClick={handleDownload} size="md">הורדה</Button>
            )}
            {scheduleData && (
              <Button
                onClick={handleWhatsApp}
                size="md"
                className="text-white"
                style={{ backgroundColor: "#25D366", borderColor: "#25D366" }}
              >
                <svg className="w-4 h-4 ml-1.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                שלח לווצאפ
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Submission status */}
      {!loading && employees.length > 0 && (
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700">הגשת זמינות</p>
              <p className="text-xs text-gray-400">{submitted}/{employees.length} הגישו</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {employees.map(emp => {
                const hasSent = emp.constraints.length > 0;
                const name = (emp.name ?? emp.email).split(" ")[0];
                return (
                  <div key={emp.id} className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                    hasSent
                      ? "bg-green-50 border-green-300 text-green-700"
                      : "bg-red-50 border-red-300 text-red-600"
                  )}>
                    <span>{hasSent ? "✓" : "✗"}</span>
                    <span>{name}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
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
      {warnings.length > 0 && !warningsIgnored && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="py-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-yellow-800">אזהרות:</p>
              <button onClick={() => setWarningsIgnored(true)} className="text-xs text-yellow-500 hover:text-yellow-700 font-medium px-2 py-0.5 rounded hover:bg-yellow-100 transition-colors">התעלם</button>
            </div>
            <ul className="space-y-0.5">{warnings.map((w, i) => <li key={i} className="text-xs text-yellow-700">• {w}</li>)}</ul>
          </CardContent>
        </Card>
      )}

      {/* Conflicts */}
      {Object.keys(conflicts).length > 0 && !conflictsIgnored && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-red-800">התנגשויות זמינות:</p>
              <button onClick={() => setConflictsIgnored(true)} className="text-xs text-red-400 hover:text-red-600 font-medium px-2 py-0.5 rounded hover:bg-red-100 transition-colors">התעלם</button>
            </div>
            <div className="space-y-2">
              {Object.entries(conflicts).map(([name, slots]) => {
                const empIndex = employees.findIndex(e => (e.name ?? e.email) === name);
                const chipColor = empIndex >= 0 ? EMP_COLORS[empIndex % EMP_COLORS.length] : "bg-gray-200 text-gray-800";
                return (
                  <div key={name}>
                    <span className={cn("inline-block text-xs font-semibold px-2 py-0.5 rounded-md", chipColor)}>{name}</span>
                    <ul className="mt-0.5 space-y-0.5 ps-3">
                      {slots.map((s, i) => <li key={i} className="text-xs text-red-600">• {s}</li>)}
                    </ul>
                  </div>
                );
              })}
            </div>
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
          <div className="overflow-x-auto rounded-xl border-2 border-gray-300 shadow-sm">
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
                {shiftKeys.map((shift, si) => {
                  const shiftCfg = shifts.find(s => s.id === shift);
                  const dotColors = ["bg-yellow-400","bg-orange-400","bg-indigo-400","bg-blue-400","bg-pink-400"];
                  return (
                  <tr key={shift} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 ps-4 pe-3 align-middle">
                      <div className="flex items-center gap-2">
                        <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", dotColors[si % dotColors.length])} />
                        <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">{shiftCfg?.label ?? shift}</span>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap" dir="ltr">{shiftCfg?.start}–{shiftCfg?.end}</span>
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

                      const isDropTarget = dragOver?.day === day && dragOver?.shift === shift;
                      const alreadyInSlot = dragging && (slot?.employeeIds ?? []).includes(dragging.empId);
                      const cellAv = dragging && !alreadyInSlot
                        ? (empMap[dragging.empId]?.constraints[0]?.data?.[day as Day]?.[shift] ?? "available")
                        : null;
                      // Ambient bg shown for all cells while dragging
                      const dragBg = alreadyInSlot ? "bg-gray-100"
                        : cellAv === "available" ? "bg-green-50"
                        : cellAv === "prefer_not" ? "bg-yellow-50"
                        : cellAv === "unavailable" ? "bg-red-50"
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
                          className={cn("py-2 px-2 align-top transition-colors", dragging && dragBg, dropOutline)}
                          onDragOver={e => { e.preventDefault(); setDragOver({ day, shift }); }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={() => handleDrop(day, shift)}
                        >
                          <div className="flex flex-col gap-2.5">
                            {names.map((name, ni) => {
                              const empId = slot?.employeeIds?.[ni];
                              const isPinned = !!empId && pinnedIds.includes(empId);
                              const av = empId ? (empMap[empId]?.constraints[0]?.data?.[day as Day]?.[shift] ?? "available") : "available";
                              const avBorder = av === "available" ? "ring-[3px] ring-green-400" : av === "prefer_not" ? "ring-[3px] ring-yellow-400" : "ring-[3px] ring-red-500";
                              return (
                              <div
                                key={name}
                                className="group relative"
                                draggable
                                onDragStart={() => setDragging({ empId: empId!, name, fromDay: day, fromShift: shift })}
                                onDragEnd={() => { setDragging(null); setDragOver(null); }}
                              >
                                <div className={cn(
                                  "text-xs px-2 py-1 rounded-lg font-medium text-center leading-tight w-full cursor-grab active:cursor-grabbing",
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
                            ) : (slot?.employeeIds ?? []).length < (shifts.find(s => s.id === shift)?.minWorkers ?? 2) && (
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
            <div className="flex items-center justify-between mb-1">
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

            {/* Legend */}
            <div className="flex gap-3 mb-3 text-xs text-gray-600">
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-green-500" />זמין</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-yellow-400" />מעדיף לא</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" />לא זמין</span>
            </div>

            {/* Overview table */}
            <div className="overflow-x-auto rounded-xl border-2 border-gray-300 shadow-sm">
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
                  {shiftKeys.map((shift, si) => {
                    const shiftCfg = shifts.find(s => s.id === shift);
                    const dotColors = ["bg-yellow-400","bg-orange-400","bg-indigo-400","bg-blue-400","bg-pink-400"];
                    return (
                    <tr key={shift} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 ps-3 pe-2 align-middle">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("w-2 h-2 rounded-full flex-shrink-0", dotColors[si % dotColors.length])} />
                          <span className="font-semibold text-gray-700">{shiftCfg?.label ?? shift}</span>
                        </div>
                      </td>
                      {DAYS.map(day => (
                        <td key={day} className="py-1 px-1 align-top">
                          <div className="flex flex-col gap-0.5">
                            {employees.filter(e => empFilter.length === 0 || empFilter.includes(e.name ?? e.email)).map(emp => {
                              const av = emp.constraints[0]?.data?.[day as Day]?.[shift] ?? "available";
                              const chipStyle = av === "available"
                                ? "bg-emerald-500 text-white"
                                : av === "prefer_not"
                                ? "bg-amber-400 text-white"
                                : "bg-red-500 text-white";
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
                    );
                  })}
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
          <table style={{ width: "100%", borderCollapse: "collapse", backgroundColor: "white" }}>
            <thead>
              <tr>
                <th style={{ padding: "12px", textAlign: "center", backgroundColor: "#dbeafe", borderBottom: "1px solid #93c5fd", fontWeight: "700", fontSize: "14px", width: "110px" }}>
                  משמרת
                </th>
                {DAYS.map((day, di) => {
                  const date = format(addDays(weekStart, di), "d/M");
                  return (
                    <th key={day} style={{ padding: "12px", textAlign: "center", backgroundColor: "#dbeafe", borderBottom: "1px solid #93c5fd", fontWeight: "700" }}>
                      <span style={{ fontSize: "14px", color: "#111827" }}>{DAY_LABELS_HE[day as Day]}</span>
                      <br />
                      <span style={{ fontSize: "12px", color: "#9ca3af", fontWeight: "normal" }}>{date}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shiftKeys.map((shift, si) => {
                const shiftCfg = shifts.find(s => s.id === shift);
                const pdfColors = ["#15803d","#ca8a04","#3730a3","#0369a1","#9d174d","#92400e"];
                return (
                  <tr key={shift} style={{ borderBottom: "1px solid #bfdbfe" }}>
                    <td style={{ padding: "12px", textAlign: "center", backgroundColor: "#dbeafe" }}>
                      <span style={{ color: pdfColors[si % pdfColors.length], fontSize: "15px", fontWeight: "700" }}>{shiftCfg?.label ?? shift}</span>
                      <br />
                      <span style={{ fontSize: "12px", color: "#9ca3af" }} dir="ltr">{shiftCfg?.start} – {shiftCfg?.end}</span>
                    </td>
                    {DAYS.map(day => {
                      const names = scheduleData[day]?.[shift]?.employeeNames ?? [];
                      return (
                        <td key={day} style={{ padding: "12px", textAlign: "center", verticalAlign: "middle" }}>
                          {names.length === 0
                            ? <span style={{ color: "#d1d5db", fontSize: "13px" }}>—</span>
                            : names.map((name, ni) => (
                                <div key={ni} style={{ display: "inline-block", margin: "2px 3px", padding: "3px 10px", fontSize: "13px", fontWeight: "700", color: "#111827" }}>
                                  {name.split(" ")[0]}
                                </div>
                              ))}
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
