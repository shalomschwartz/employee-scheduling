"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DEFAULT_SHIFTS, type ShiftConfig } from "@/lib/utils";

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
      .then(data => { if (Array.isArray(data)) setShifts(data); });
  }, []);

  function updateShift(id: string, field: keyof ShiftConfig, value: string) {
    setShifts(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
    setShiftSaved(false);
  }

  function addShift() {
    const newId = `SHIFT_${Date.now()}`;
    setShifts(prev => [...prev, { id: newId, label: "משמרת חדשה", start: "08:00", end: "16:00" }]);
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
      body: JSON.stringify(shifts),
    });
    setShiftSaving(false);
    if (!res.ok) { setShiftError("שגיאה בשמירה"); return; }
    setShiftSaved(true);
    setTimeout(() => setShiftSaved(false), 3000);
  }

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
              <div key={shift.id} className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50">
                <span className="text-xs text-gray-400 w-4 text-center font-bold">{i + 1}</span>
                <input
                  type="text"
                  value={shift.label}
                  onChange={e => updateShift(shift.id, "label", e.target.value)}
                  className="flex-1 min-w-0 text-sm font-medium bg-white border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="שם המשמרת"
                />
                <input
                  type="time"
                  value={shift.start}
                  onChange={e => updateShift(shift.id, "start", e.target.value)}
                  className="text-xs bg-white border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300 w-24"
                />
                <span className="text-gray-400 text-xs">—</span>
                <input
                  type="time"
                  value={shift.end}
                  onChange={e => updateShift(shift.id, "end", e.target.value)}
                  className="text-xs bg-white border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300 w-24"
                />
                <button
                  onClick={() => removeShift(shift.id)}
                  disabled={shifts.length <= 1}
                  className={cn(
                    "text-gray-300 hover:text-red-500 transition-colors text-lg leading-none w-6 flex items-center justify-center",
                    shifts.length <= 1 && "opacity-30 cursor-not-allowed"
                  )}
                  title="מחק משמרת"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {shiftError && <p className="text-sm text-red-600">{shiftError}</p>}

          <div className="flex items-center gap-3">
            <Button onClick={saveShifts} loading={shiftSaving} size="md">
              שמור משמרות
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
              onChange={e => setName(e.target.value)}
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
    </div>
  );
}
