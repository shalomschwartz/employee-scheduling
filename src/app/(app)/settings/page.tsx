"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DEFAULT_SHIFTS, getNextWeekStart, type ShiftConfig } from "@/lib/utils";

interface Employee {
  id: string;
  name: string;
  phone?: string | null;
  roles: string[];
  contractShifts: number | null;
}

export default function SettingsPage() {
  // ── Shift role types ────────────────────────────────────────────────────────
  const [shiftRoles, setShiftRoles] = useState<string[]>([]);
  const [newRole, setNewRole] = useState("");
  const [rolesSaving, setRolesSaving] = useState(false);
  const [rolesSaved, setRolesSaved] = useState(false);

  useEffect(() => {
    fetch("/api/shift-roles")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.roles)) setShiftRoles(d.roles); });
  }, []);

  async function saveRoles(updated: string[]) {
    setRolesSaving(true);
    await fetch("/api/shift-roles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: updated }),
    });
    setRolesSaving(false);
    setRolesSaved(true);
    setTimeout(() => setRolesSaved(false), 2000);
  }

  function addRole() {
    const trimmed = newRole.trim();
    if (!trimmed || shiftRoles.includes(trimmed)) return;
    const updated = [...shiftRoles, trimmed];
    setShiftRoles(updated);
    setNewRole("");
    saveRoles(updated);
  }

  function removeRole(role: string) {
    const updated = shiftRoles.filter(r => r !== role);
    setShiftRoles(updated);
    saveRoles(updated);
  }

  // ── Employees ──────────────────────────────────────────────────────────────
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [newRoles, setNewRoles] = useState<string[]>([]);
  const [newContract, setNewContract] = useState<number>(0);
  const [empLoading, setEmpLoading] = useState(false);
  const [empError, setEmpError] = useState("");
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [confirmDeleteEmp, setConfirmDeleteEmp] = useState<string | null>(null);
  const [dirtyEmps, setDirtyEmps] = useState<Set<string>>(new Set());
  const [savingEmps, setSavingEmps] = useState<Set<string>>(new Set());

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
    if (!res.ok) { setEmpLoading(false); setEmpError(data.error ?? "שגיאה בהוספה"); return; }
    // Save roles + contract immediately if set
    if (newRoles.length > 0 || newContract > 0) {
      await fetch("/api/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: data.id, roles: newRoles, contractShifts: newContract > 0 ? newContract : null }),
      });
      data.roles = newRoles;
      data.contractShifts = newContract > 0 ? newContract : null;
    }
    setEmpLoading(false);
    setEmployees(prev => [...prev, data]);
    setName("");
    setPhone("");
    setNewRoles([]);
    setNewContract(0);
  }

  async function handleDeleteEmployee(id: string) {
    const res = await fetch("/api/employees", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setEmployees(prev => prev.filter(e => e.id !== id));
  }

  function updateEmpLocal(id: string, patch: { roles?: string[]; contractShifts?: number | null }) {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
    setDirtyEmps(prev => new Set(prev).add(id));
  }

  async function saveEmployee(id: string) {
    const emp = employees.find(e => e.id === id);
    if (!emp) return;
    setSavingEmps(prev => new Set(prev).add(id));
    await fetch("/api/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, roles: emp.roles, contractShifts: emp.contractShifts }),
    });
    setSavingEmps(prev => { const s = new Set(prev); s.delete(id); return s; });
    setDirtyEmps(prev => { const s = new Set(prev); s.delete(id); return s; });
  }

  // ── Shifts ─────────────────────────────────────────────────────────────────
  const [shifts, setShifts] = useState<ShiftConfig[]>(DEFAULT_SHIFTS);
  const [shiftSaving, setShiftSaving] = useState(false);
  const [shiftSaved, setShiftSaved] = useState(false);
  const [shiftError, setShiftError] = useState("");
  const [overlapIgnored, setOverlapIgnored] = useState(false);
  const savedShifts = useRef<ShiftConfig[]>([]);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerated, setRegenerated] = useState(false);

  useEffect(() => {
    fetch("/api/shifts")
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : data?.shifts;
        if (Array.isArray(arr)) { setShifts(arr); savedShifts.current = arr; }
      });
  }, []);

  function updateShift(id: string, field: keyof ShiftConfig, value: string | number) {
    setShifts(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
    setShiftSaved(false);
    setOverlapIgnored(false);
  }

  async function handleRegenerate() {
    setRegenerating(true);
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
    savedShifts.current = shifts;
    setRegenerating(false);
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

  function duplicateShift(id: string) {
    const src = shifts.find(s => s.id === id);
    if (!src) return;
    const newId = `SHIFT_${Date.now()}`;
    setShifts(prev => {
      const idx = prev.findIndex(s => s.id === id);
      const copy = { ...src, id: newId, label: `${src.label} (עותק)` };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
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
    savedShifts.current = shifts;
    setShiftSaved(true);
    setTimeout(() => setShiftSaved(false), 3000);
  }

  const shiftsChanged =
    shifts.length !== savedShifts.current.length ||
    shifts.some(s => {
      const orig = savedShifts.current.find(o => o.id === s.id);
      return !orig || orig.minWorkers !== s.minWorkers || orig.start !== s.start || orig.end !== s.end;
    });

  // Live overlap detection
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

      {/* ── Shift role types ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900">סוגי תפקידים</h2>
            <p className="text-xs text-gray-500 mt-0.5">הגדר את התפקידים האפשריים (למשל: מלצר, ברמן, הוסטס). ניתן לשייך תפקיד לכל משמרת ועובד.</p>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addRole())}
              placeholder="שם תפקיד חדש"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <Button onClick={addRole} size="md" disabled={!newRole.trim()}>הוסף</Button>
          </div>

          {shiftRoles.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">אין תפקידים מוגדרים עדיין.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {shiftRoles.map(role => (
                <span key={role} className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 text-purple-700 text-xs font-medium px-3 py-1.5 rounded-full">
                  {role}
                  <button
                    onClick={() => removeRole(role)}
                    className="text-purple-400 hover:text-purple-700 font-bold leading-none"
                    title="הסר תפקיד"
                  >×</button>
                </span>
              ))}
            </div>
          )}
          {rolesSaving && <p className="text-xs text-gray-400">שומר...</p>}
          {rolesSaved && <p className="text-xs text-green-600 font-medium">נשמר!</p>}
        </CardContent>
      </Card>

      {/* ── Shifts ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">משמרות</h2>
              <p className="text-xs text-gray-500 mt-0.5">ניתן לשנות שעות, שם, תפקיד, להוסיף או למחוק משמרות.</p>
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
                overlappingIds.has(shift.id) && !overlapIgnored ? "border-red-400 ring-2 ring-red-200" : "border-gray-200"
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
                    onClick={() => duplicateShift(shift.id)}
                    className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 border border-blue-300 transition-colors rounded px-2 py-0.5 text-xs font-medium leading-none"
                  >
                    שכפול
                  </button>
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
                {/* Row 3: role */}
                <div className="flex items-center gap-2 ps-6">
                  <span className="text-[10px] text-gray-400 shrink-0">תפקיד:</span>
                  <select
                    value={shift.role ?? ""}
                    onChange={e => updateShift(shift.id, "role", e.target.value)}
                    className="flex-1 text-xs bg-white border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    <option value="">ללא (כל עובד)</option>
                    {shiftRoles.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          {overlappingIds.size > 0 && !overlapIgnored && (
            <div className="flex items-center justify-between gap-3 p-2 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-600 font-medium">
                ⚠ משמרות חופפות: {shifts.filter(s => overlappingIds.has(s.id)).map(s => s.label).join(", ")}
              </p>
              <button onClick={() => setOverlapIgnored(true)} className="text-xs text-red-400 hover:text-red-600 font-medium whitespace-nowrap px-2 py-0.5 rounded hover:bg-red-100 transition-colors flex-shrink-0">התעלם</button>
            </div>
          )}
          {shiftError && <p className="text-sm text-red-600">{shiftError}</p>}

          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={saveShifts} loading={shiftSaving} size="md">
              שמור הגדרות
            </Button>
            {shiftsChanged && (
              <Button onClick={handleRegenerate} loading={regenerating} size="md"
                className="bg-green-500 hover:bg-green-600">
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
            הוסף עובדים לפי שם וטלפון. לחץ על שם העובד להגדרת תפקידים וחוזה.
          </p>

          <form onSubmit={handleAddEmployee} className="space-y-3 p-3 rounded-xl border border-gray-200 bg-gray-50">
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
            {/* Contract */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 shrink-0">חוזה (משמרות/שבוע):</span>
              <button type="button" onClick={() => setNewContract(c => Math.max(0, c - 1))} className="w-6 h-6 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-sm leading-none">−</button>
              <span className="w-6 text-center text-sm font-semibold text-gray-800">{newContract === 0 ? "—" : newContract}</span>
              <button type="button" onClick={() => setNewContract(c => Math.min(7, c + 1))} className="w-6 h-6 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-sm leading-none">+</button>
            </div>
            {/* Roles */}
            {shiftRoles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-gray-500 shrink-0">תפקידים:</span>
                {shiftRoles.map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setNewRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role])}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-full border font-medium transition-colors",
                      newRoles.includes(role)
                        ? "bg-blue-500 text-white border-blue-500"
                        : "bg-white text-gray-600 border-gray-300 hover:border-blue-300"
                    )}
                  >
                    {role}
                  </button>
                ))}
              </div>
            )}
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
                <li key={emp.id}>
                  {/* Main row */}
                  <div className="flex items-center justify-between py-2.5">
                    <button
                      type="button"
                      onClick={() => setExpandedEmp(expandedEmp === emp.id ? null : emp.id)}
                      className="flex items-center gap-1.5 text-start"
                    >
                      <span className="text-sm font-medium text-gray-800">{emp.name}</span>
                      {emp.contractShifts != null && emp.contractShifts > 0 && (
                        <span className="text-[10px] text-blue-500 font-medium bg-blue-50 px-1.5 py-0.5 rounded-full">
                          {emp.contractShifts} משמרות
                        </span>
                      )}
                      {emp.roles.length > 0 && (
                        <span className="text-[10px] text-purple-600 font-medium bg-purple-50 px-1.5 py-0.5 rounded-full">
                          {emp.roles.join(", ")}
                        </span>
                      )}
                      <svg className={cn("w-3.5 h-3.5 text-gray-400 transition-transform", expandedEmp === emp.id && "rotate-180")} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </button>
                    <div className="flex items-center gap-2">
                      {emp.phone && <span className="text-xs text-gray-400">{emp.phone}</span>}
                      <button
                        onClick={() => setConfirmDeleteEmp(emp.id)}
                        className="text-xs text-gray-400 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50"
                      >
                        הסר
                      </button>
                    </div>
                  </div>

                  {/* Expanded section */}
                  {expandedEmp === emp.id && (
                    <div className="pb-3 ps-2 space-y-3">
                      {/* Contract shifts */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-24 shrink-0">משמרות בשבוע:</span>
                        <button
                          onClick={() => updateEmpLocal(emp.id, { contractShifts: Math.max(0, (emp.contractShifts ?? 0) - 1) || null })}
                          className="w-6 h-6 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-sm leading-none"
                        >−</button>
                        <span className="w-6 text-center text-xs font-semibold text-gray-800">
                          {emp.contractShifts ?? 0}
                        </span>
                        <button
                          onClick={() => updateEmpLocal(emp.id, { contractShifts: (emp.contractShifts ?? 0) + 1 })}
                          className="w-6 h-6 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center justify-center text-sm leading-none"
                        >+</button>
                        <span className="text-[10px] text-gray-400">{emp.contractShifts ? "יעד לשבוע" : "ללא חוזה"}</span>
                      </div>

                      {/* Roles */}
                      {shiftRoles.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-gray-500 w-24 shrink-0 pt-0.5">תפקידים:</span>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              onClick={() => updateEmpLocal(emp.id, { roles: [...shiftRoles] })}
                              className={cn(
                                "text-xs px-2.5 py-1 rounded-full border font-medium transition-colors",
                                emp.roles.length === shiftRoles.length
                                  ? "bg-purple-600 text-white border-purple-600"
                                  : "bg-white text-gray-500 border-gray-300 hover:border-purple-400"
                              )}
                            >
                              הכל
                            </button>
                            {shiftRoles.map(role => {
                              const active = emp.roles.includes(role);
                              return (
                                <button
                                  key={role}
                                  onClick={() => updateEmpLocal(emp.id, {
                                    roles: active
                                      ? emp.roles.filter(r => r !== role)
                                      : [...emp.roles, role],
                                  })}
                                  className={cn(
                                    "text-xs px-2.5 py-1 rounded-full border font-medium transition-colors",
                                    active
                                      ? "bg-purple-600 text-white border-purple-600"
                                      : "bg-white text-gray-500 border-gray-300 hover:border-purple-400"
                                  )}
                                >
                                  {role}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {shiftRoles.length === 0 && (
                        <p className="text-xs text-gray-400">הגדר תפקידים בכרטיס "סוגי תפקידים" כדי להציג כאן.</p>
                      )}

                      {/* Save button */}
                      {dirtyEmps.has(emp.id) && (
                        <div className="pt-1">
                          <Button
                            size="md"
                            onClick={() => saveEmployee(emp.id)}
                            loading={savingEmps.has(emp.id)}
                          >
                            שמור
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {confirmDeleteEmp && (() => {
        const emp = employees.find(e => e.id === confirmDeleteEmp);
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-xs w-full text-center" dir="rtl">
              <p className="font-bold text-gray-900 text-base mb-1">הסרת עובד</p>
              <p className="text-sm text-gray-500 mb-5">האם אתה בטוח שברצונך להסיר את <span className="font-semibold text-gray-800">{emp?.name}</span>?</p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => { handleDeleteEmployee(confirmDeleteEmp); setConfirmDeleteEmp(null); }}
                  className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors"
                >
                  הסר
                </button>
                <button
                  onClick={() => setConfirmDeleteEmp(null)}
                  className="flex-1 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold transition-colors"
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
