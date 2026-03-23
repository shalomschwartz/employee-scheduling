"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DEFAULT_SHIFTS, type ShiftConfig, type SchedulingRule } from "@/lib/utils";

interface Employee {
  id: string;
  name: string;
}

export default function SettingsPage() {
  // ── Employees ──────────────────────────────────────────────────────────────
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [name, setName] = useState("");
  const [empLoading, setEmpLoading] = useState(false);
  const [empError, setEmpError] = useState("");

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
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    setEmpLoading(false);
    if (!res.ok) { setEmpError(data.error ?? "שגיאה בהוספה"); return; }
    setEmployees(prev => [...prev, data]);
    setName("");
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

  // ── Rules ──────────────────────────────────────────────────────────────────
  const [rules, setRules] = useState<SchedulingRule[]>([]);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleSaved, setRuleSaved] = useState(false);

  useEffect(() => {
    fetch("/api/rules")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.rules)) setRules(d.rules); });
  }, []);

  function addRule() {
    setRules(prev => [...prev, { id: `rule_${Date.now()}`, type: "same_shift", enabled: true, employeeAId: "", employeeBId: "" }]);
  }

  function updateRule(id: string, field: keyof SchedulingRule, value: unknown) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  function removeRule(id: string) {
    setRules(prev => prev.filter(r => r.id !== id));
  }

  async function saveRules() {
    setRuleSaving(true);
    await fetch("/api/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules }),
    });
    setRuleSaving(false);
    setRuleSaved(true);
    setTimeout(() => setRuleSaved(false), 3000);
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

          <div className="flex items-center gap-3">
            <Button onClick={saveShifts} loading={shiftSaving} size="md">
              שמור הגדרות
            </Button>
            {shiftSaved && <span className="text-sm text-green-600 font-medium">נשמר!</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── Employees ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <h2 className="font-semibold text-gray-900">עובדים</h2>
          <p className="text-xs text-gray-500">
            הוסף עובדים לפי שם. כל עובד יכנס עם שמו בלבד — ללא סיסמה.
          </p>

          <form onSubmit={handleAddEmployee} className="flex gap-2">
            <Input
              id="empName"
              type="text"
              placeholder="שם העובד"
              value={name}
              onChange={e => setName(e.target.value.replace(/[^א-תa-zA-Z\s]/g, ""))}
              maxLength={50}
              required
            />
            <Button type="submit" loading={empLoading} size="md">
              הוסף
            </Button>
          </form>

          {empError && <p className="text-sm text-red-600">{empError}</p>}

          {employees.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">אין עובדים עדיין.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {employees.map(emp => (
                <li key={emp.id} className="flex items-center justify-between py-2.5">
                  <span className="text-sm font-medium text-gray-800">{emp.name}</span>
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

      {/* ── Rules ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">כללי שיבוץ</h2>
              <p className="text-xs text-gray-500 mt-0.5">הגדר כללים שחלים על שיבוץ אוטומטי.</p>
            </div>
            <button
              onClick={addRule}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
            >
              + הוסף כלל
            </button>
          </div>

          {rules.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">אין כללים.</p>
          ) : (
            <div className="space-y-2">
              {rules.map(rule => (
                <div key={rule.id} className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={e => updateRule(rule.id, "enabled", e.target.checked)}
                    className="accent-blue-600 w-4 h-4 shrink-0"
                    title="הפעל/כבה כלל"
                  />
                  <select
                    value={rule.type}
                    onChange={e => updateRule(rule.id, "type", e.target.value)}
                    className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    <option value="same_shift">אותה משמרת</option>
                    <option value="next_shift">המשמרת הבאה</option>
                  </select>
                  <select
                    value={rule.employeeAId}
                    onChange={e => updateRule(rule.id, "employeeAId", e.target.value)}
                    className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 flex-1 min-w-[100px]"
                  >
                    <option value="">עובד א׳</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  <span className="text-xs text-gray-500 shrink-0">
                    {rule.type === "same_shift" ? "יחד עם" : "ואחריו"}
                  </span>
                  <select
                    value={rule.employeeBId}
                    onChange={e => updateRule(rule.id, "employeeBId", e.target.value)}
                    className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 flex-1 min-w-[100px]"
                  >
                    <option value="">עובד ב׳</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  <button
                    onClick={() => removeRule(rule.id)}
                    className="text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors rounded px-1.5 py-0.5 text-base font-bold leading-none shrink-0"
                    title="מחק כלל"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={saveRules} loading={ruleSaving} size="md">
              שמור כללים
            </Button>
            {ruleSaved && <span className="text-sm text-green-600 font-medium">נשמר!</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
