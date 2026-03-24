"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DEFAULT_SHIFTS, getNextWeekStart, type ShiftConfig } from "@/lib/utils";

interface Employee {
  id: string;
  name: string;
  phone?: string | null;
}

export default function SettingsPage() {
  // ── Employees ──────────────────────────────────────────────────────────────
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [empLoading, setEmpLoading] = useState(false);
  const [empError, setEmpError] = useState("");

  // ── Deadline ────────────────────────────────────────────────────────────────
  const [deadlineInput, setDeadlineInput] = useState("");
  const [deadlineSaving, setDeadlineSaving] = useState(false);
  const [deadlineSaved, setDeadlineSaved] = useState(false);

  useEffect(() => {
    fetch("/api/deadline")
      .then(r => r.json())
      .then(d => {
        if (d.deadline) setDeadlineInput(toDatetimeLocal(d.deadline));
      });
  }, []);

  function toDatetimeLocal(iso: string): string {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const p = (type: string) => parts.find(x => x.type === type)?.value ?? "00";
    return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}`;
  }

  async function saveDeadline() {
    if (!deadlineInput) return;
    setDeadlineSaving(true);
    // datetime-local value treated as Jerusalem local time → convert to UTC
    const utcIso = new Date(deadlineInput).toISOString();
    await fetch("/api/deadline", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deadline: utcIso }),
    });
    setDeadlineSaving(false);
    setDeadlineSaved(true);
    setTimeout(() => setDeadlineSaved(false), 3000);
  }

  useEffect(() => {
    fetch("/api/employees")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setEmployees(data); });
  }, []);

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setEmpLoading(true);
    setEmpError("");
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
    });
    const data = await res.json();
    setEmpLoading(false);
    if (!res.ok) { setEmpError(data.error ?? "שגיאה בהוספה"); return; }
    setEmployees(prev => [...prev, data]);
    setName("");
    setPhone("");
  }

  async function handleDeleteEmployee(id: string) {
    const res = await fetch("/api/employees", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setEmployees(prev => prev.filter(e => e.id !== id));
  }

  // ── Shifts ─────────────────────────────────────────────────────────────────
  const [shifts, setShifts] = useState<ShiftConfig[]>(DEFAULT_SHIFTS);
  const [shiftSaving, setShiftSaving] = useState(false);
  const [shiftSaved, setShiftSaved] = useState(false);
  const [shiftError, setShiftError] = useState("");
  const [minWorkersChanged, setMinWorkersChanged] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerated, setRegenerated] = useState(false);

  useEffect(() => {
    fetch("/api/shifts")
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : data?.shifts;
        if (Array.isArray(arr)) setShifts(arr);
      });
  }, []);

  function updateShift(id: string, field: keyof ShiftConfig, value: string | number) {
    setShifts(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
    setShiftSaved(false);
    if (field === "minWorkers") setMinWorkersChanged(true);
  }

  async function handleRegenerate() {
    setRegenerating(true);
    // Save shifts first so the generator reads the updated minWorkers
    await fetch("/api/shifts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shifts }),
    });
    await fetch("/api/schedule/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart: getNextWeekStart().toISOString() }),
    });
    setRegenerating(false);
    setMinWorkersChanged(false);
    setRegenerated(true);
    setTimeout(() => setRegenerated(false), 3000);
  }

  function addShift() {
    const newId = `SHIFT_${Date.now()}`;
    setShifts(prev => [...prev, { id: newId, label: "משמרת חדשה", start: "08:00", end: "16:00", minWorkers: 2 }]);
    setShiftSaved(false);
  }

  function removeShift(id: string) {
    if (shifts.length <= 1) return;
    setShifts(prev => prev.filter(s => s.id !== id));
    setShiftSaved(false);
  }

  async function saveShifts() {
    setShiftSaving(true);
    setShiftError("");
    const res = await fetch("/api/shifts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shifts }),
    });
    setShiftSaving(false);
    if (!res.ok) { setShiftError("שגיאה בשמירה"); return; }
    setShiftSaved(true);
    setTimeout(() => setShiftSaved(false), 3000);
  }

  // Live overlap detection — computed every render
  const toM = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const overlappingIds = new Set<string>();
  shifts.forEach((a, i) => shifts.slice(i + 1).forEach(b => {
    const ae = toM(a.end) <= toM(a.start) ? toM(a.end) + 1440 : toM(a.end);
    const be = toM(b.end) <= toM(b.start) ? toM(b.end) + 1440 : toM(b.end);
    if (toM(a.start) < be && toM(b.start) < ae) {
      overlappingIds.add(a.id);
      overlappingIds.add(b.id);
    }
  }));

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-xl font-bold text-gray-900">הגדרות</h1>

      {/* ── Shifts ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">משמרות</h2>
              <p className="text-xs text-gray-500 mt-0.5">ניתן לשנות שעות, שם, להוסיף או למחוק משמרות.</p>
            </div>
            <button
              onClick={addShift}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
            >
              + הוסף משמרת
            </button>
          </div>

          <div className="space-y-2">
            {shifts.map((shift, i) => (
              <div key={shift.id} className={cn(
                "flex flex-col gap-2 p-3 rounded-lg border bg-gray-50 transition-all",
                overlappingIds.has(shift.id) ? "border-red-400 ring-2 ring-red-200" : "border-gray-200"
              )}>
                {/* Row 1: number + name */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-4 text-center font-bold shrink-0">{i + 1}</span>
                  <input
                    type="text"
                    value={shift.label}
                    onChange={e => updateShift(shift.id, "label", e.target.value)}
                    className="flex-1 text-sm font-medium bg-white border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    placeholder="שם המשמרת"
                  />
                </div>
                {/* Row 2: time range + workers + delete */}
                <div className="flex items-center gap-2 ps-6 flex-wrap">
                  <div className="flex items-center gap-1 shrink-0" dir="ltr">
                    <span className="text-[10px] text-gray-400">מ</span>
                    <input
                      type="time"
                      value={shift.start}
                      onChange={e => updateShift(shift.id, "start", e.target.value)}
                      className="text-xs bg-white border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300 w-[88px]"
                    />
                    <span className="text-gray-400 text-xs">—</span>
                    <input
                      type="time"
                      value={shift.end}
                      onChange={e => updateShift(shift.id, "end", e.target.value)}
                      className="text-xs bg-white border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300 w-[88px]"
                    />
                    <span className="text-[10px] text-gray-400">עד</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-gray-400">עובדים:</span>
                    <button onClick={() => updateShift(shift.id, "minWorkers", Math.max(1, (shift.minWorkers ?? 2) - 1))} className="w-6 h-6 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-sm leading-none">−</button>
                    <span className="w-5 text-center text-xs font-semibold text-gray-800">{shift.minWorkers ?? 2}</span>
                    <button onClick={() => updateShift(shift.id, "minWorkers", Math.min(20, (shift.minWorkers ?? 2) + 1))} className="w-6 h-6 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-sm leading-none">+</button>
                  </div>
                  <button
                    onClick={() => removeShift(shift.id)}
                    disabled={shifts.length <= 1}
                    className={cn(
                      "text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors rounded px-1.5 py-0.5 text-base font-bold leading-none",
                      shifts.length <= 1 && "opacity-30 cursor-not-allowed"
                    )}
                    title="מחק משמרת"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>

          {overlappingIds.size > 0 && (
            <p className="text-sm text-red-600 font-medium">
              ⚠ משמרות חופפות: {shifts.filter(s => overlappingIds.has(s.id)).map(s => s.label).join(", ")}
            </p>
          )}
          {shiftError && <p className="text-sm text-red-600">{shiftError}</p>}

          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={saveShifts} loading={shiftSaving} size="md">
              שמור הגדרות
            </Button>
            {minWorkersChanged && (
              <Button onClick={handleRegenerate} loading={regenerating} size="md"
                className="bg-indigo-600 hover:bg-indigo-700">
                צור מחדש
              </Button>
            )}
            {shiftSaved && <span className="text-sm text-green-600 font-medium">נשמר!</span>}
            {regenerated && <span className="text-sm text-green-600 font-medium">לוח נוצר מחדש!</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── Deadline ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900">מועד הגשת זמינות</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              הגדר עד מתי העובדים יכולים לשלוח זמינות. ניתן לשנות בכל עת — אם תרצה לתת הארכה, פשוט הזז את התאריך קדימה.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="datetime-local"
              value={deadlineInput}
              onChange={e => setDeadlineInput(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <Button onClick={saveDeadline} loading={deadlineSaving} size="md">
              שמור
            </Button>
            {deadlineSaved && <span className="text-sm text-green-600 font-medium">נשמר!</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── Employees ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <h2 className="font-semibold text-gray-900">עובדים</h2>
          <p className="text-xs text-gray-500">
            הוסף עובדים לפי שם וטלפון. העובד יכנס עם שמו ומספר הטלפון שלו.
          </p>

          <form onSubmit={handleAddEmployee} className="space-y-2">
            <div className="flex gap-2">
              <Input
                id="empName"
                type="text"
                placeholder="שם העובד"
                value={name}
                onChange={e => setName(e.target.value.replace(/[^א-תa-zA-Z\s]/g, ""))}
                maxLength={50}
                required
              />
              <Input
                id="empPhone"
                type="tel"
                placeholder="טלפון"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                maxLength={20}
                required
              />
            </div>
            <Button type="submit" loading={empLoading} size="md" className="w-full">
              הוסף עובד
            </Button>
          </form>

          {empError && <p className="text-sm text-red-600">{empError}</p>}

          {employees.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">אין עובדים עדיין.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {employees.map(emp => (
                <li key={emp.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{emp.name}</span>
                    {emp.phone && <span className="block text-xs text-gray-400">{emp.phone}</span>}
                  </div>
                  <button
                    onClick={() => handleDeleteEmployee(emp.id)}
                    className={cn(
                      "text-xs text-gray-400 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50"
                    )}
                  >
                    הסר
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
