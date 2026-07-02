"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, Copy, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DEFAULT_SHIFTS, getNextWeekStart, type ShiftConfig } from "@/lib/utils";
import { useEscapeClose } from "@/lib/useEscapeClose";

interface Employee {
  id: string;
  name: string;
  phone?: string | null;
  roles: string[];
  contractShifts: number | null;
  isShiftLead?: boolean;
}

function RoleChipSelector({ roles, selected, onChange, showAll = false }: {
  roles: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  showAll?: boolean;
}) {
  if (roles.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {showAll && (
        <button
          type="button"
          onClick={() => onChange([...roles])}
          className={cn(
            "text-xs px-2.5 py-1 rounded-full border font-medium transition-colors",
            selected.length === roles.length
              ? "bg-purple-600 text-white border-purple-600"
              : "bg-white dark:bg-white/[0.06] text-navy-muted dark:text-slate-400 border-surface-high dark:border-white/10 hover:border-purple-400"
          )}
        >
          הכל
        </button>
      )}
      {roles.map(role => {
        const active = selected.includes(role);
        return (
          <button
            key={role}
            type="button"
            onClick={() => onChange(active ? selected.filter(r => r !== role) : [...selected, role])}
            className={cn(
              "text-xs px-2.5 py-1 rounded-full border font-medium transition-colors",
              active
                ? "bg-blue-500 text-white border-blue-500"
                : "bg-white dark:bg-white/[0.06] text-navy-muted dark:text-slate-400 border-surface-high dark:border-white/10 hover:border-blue-300"
            )}
          >
            {role}
          </button>
        );
      })}
    </div>
  );
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
  const [confirmDeleteShift, setConfirmDeleteShift] = useState<string | null>(null);
  const [dirtyEmps, setDirtyEmps] = useState<Set<string>>(new Set());
  const [savingEmps, setSavingEmps] = useState<Set<string>>(new Set());

  // ── Deadline ────────────────────────────────────────────────────────────────
  const [deadlineInput, setDeadlineInput] = useState("");
  const [deadlineSaving, setDeadlineSaving] = useState(false);
  const [deadlineSaved, setDeadlineSaved] = useState(false);

  // ── Min rest hours (global) ─────────────────────────────────────────────────
  const [minRestHours, setMinRestHours] = useState(7);
  const [restSaving, setRestSaving] = useState(false);
  const [restSaved, setRestSaved] = useState(false);

  // ── Scheduling rules ────────────────────────────────────────────────────────
  const [maxConsecutiveDays, setMaxConsecutiveDays] = useState(0);
  const [requireShiftLead, setRequireShiftLead] = useState(false);
  const [managerPhone, setManagerPhone] = useState("");
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);

  useEffect(() => {
    fetch("/api/deadline")
      .then(r => r.json())
      .then(d => {
        if (d.deadline) setDeadlineInput(toDatetimeLocal(d.deadline));
      });
    fetch("/api/min-rest-hours")
      .then(r => r.json())
      .then(d => { if (typeof d.minRestHours === "number") setMinRestHours(d.minRestHours); });
    fetch("/api/scheduling-rules")
      .then(r => r.json())
      .then(d => {
        if (typeof d.maxConsecutiveDays === "number") setMaxConsecutiveDays(d.maxConsecutiveDays);
        if (typeof d.requireShiftLead === "boolean") setRequireShiftLead(d.requireShiftLead);
        if (typeof d.managerPhone === "string") setManagerPhone(d.managerPhone);
      });
  }, []);

  async function saveRestHours() {
    setRestSaving(true);
    await fetch("/api/min-rest-hours", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minRestHours }),
    });
    setRestSaving(false);
    setRestSaved(true);
    setTimeout(() => setRestSaved(false), 2000);
  }

  async function saveRules() {
    setRulesSaving(true);
    await fetch("/api/scheduling-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxConsecutiveDays, requireShiftLead, managerPhone }),
    });
    setRulesSaving(false);
    setRulesSaved(true);
    setTimeout(() => setRulesSaved(false), 2000);
  }

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

  function updateEmpLocal(id: string, patch: { roles?: string[]; contractShifts?: number | null; isShiftLead?: boolean }) {
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
      body: JSON.stringify({ id, roles: emp.roles, contractShifts: emp.contractShifts, isShiftLead: emp.isShiftLead ?? false }),
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

  // ── Invite employees (org code) ─────────────────────────────────────────────
  const [orgCode, setOrgCode] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  useEffect(() => {
    fetch("/api/shifts")
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : data?.shifts;
        if (Array.isArray(arr)) { setShifts(arr); savedShifts.current = arr; }
        if (typeof data?.orgCode === "string") setOrgCode(data.orgCode);
      });
  }, []);

  function copyInviteCode() {
    if (!orgCode) return;
    navigator.clipboard?.writeText(orgCode).then(() => {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 1800);
    }).catch(() => {});
  }

  function inviteWhatsAppUrl(): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const msg = `היי! מהיום מגישים זמינות למשמרות באפליקציה 🙌\nנכנסים לכאן: ${origin}/login\nבוחרים "עובד" ומתחברים עם השם המלא, מספר הטלפון והקוד: ${orgCode}`;
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  }

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
      return !orig || orig.minWorkers !== s.minWorkers || orig.start !== s.start || orig.end !== s.end || orig.label !== s.label || orig.role !== s.role;
    });

  const dirtyShiftIds = new Set(
    shifts
      .filter(s => {
        const orig = savedShifts.current.find(o => o.id === s.id);
        return !orig || orig.label !== s.label || orig.start !== s.start || orig.end !== s.end || orig.minWorkers !== s.minWorkers || orig.role !== s.role;
      })
      .map(s => s.id)
  );

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

  useEscapeClose(!!confirmDeleteShift, () => setConfirmDeleteShift(null));
  useEscapeClose(!!confirmDeleteEmp, () => setConfirmDeleteEmp(null));

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-xl font-bold text-navy dark:text-slate-100">הגדרות</h1>

      {/* ── Shift role types ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div>
            <h2 className="font-semibold text-navy dark:text-slate-100">סוגי תפקידים</h2>
            <p className="text-xs text-navy-muted dark:text-slate-400 mt-0.5">הגדר את התפקידים האפשריים (למשל: מלצר, ברמן, הוסטס). ניתן לשייך תפקיד לכל משמרת ועובד.</p>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addRole())}
              placeholder="שם תפקיד חדש"
              className="flex-1 text-base sm:text-sm border border-surface-high dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <Button onClick={addRole} size="md" disabled={!newRole.trim()}>הוסף</Button>
          </div>

          {shiftRoles.length === 0 ? (
            <p className="text-sm text-navy-muted/70 dark:text-slate-500 text-center py-2">אין תפקידים מוגדרים עדיין.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {shiftRoles.map(role => (
                <span key={role} className="flex items-center gap-1.5 bg-purple-50 dark:bg-purple-500/15 border border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-300 text-xs font-medium px-3 py-1.5 rounded-full">
                  {role}
                  <button
                    onClick={() => removeRole(role)}
                    className="text-purple-400 dark:text-purple-300 hover:text-purple-700 dark:hover:text-purple-300 font-bold leading-none"
                    title="הסר תפקיד"
                  >×</button>
                </span>
              ))}
            </div>
          )}
          {rolesSaving && <p className="text-xs text-navy-muted/70 dark:text-slate-500">שומר...</p>}
          {rolesSaved && <p className="text-xs text-green-600 dark:text-emerald-400 font-medium">נשמר!</p>}
        </CardContent>
      </Card>

      {/* ── Shifts ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-navy dark:text-slate-100">משמרות</h2>
              <p className="text-xs text-navy-muted dark:text-slate-400 mt-0.5">ניתן לשנות שעות, שם, תפקיד, להוסיף או למחוק משמרות.</p>
            </div>
            <button
              onClick={addShift}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-brand-300 hover:text-blue-800 dark:hover:text-brand-200 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-brand-500/15 transition-colors"
            >
              + הוסף משמרת
            </button>
          </div>

          <div className="space-y-2">
            {shifts.map((shift, i) => (
              <div key={shift.id} className={cn(
                "flex flex-col gap-2 p-3 rounded-lg border bg-surface-low dark:bg-white/[0.03] transition-all",
                overlappingIds.has(shift.id) && !overlapIgnored ? "border-red-400 dark:border-rose-500/40 ring-2 ring-red-200" : "border-surface-high dark:border-white/10"
              )}>
                {/* Row 1: number + name + dirty badge */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-navy-muted/70 dark:text-slate-500 w-4 text-center font-bold shrink-0">{i + 1}</span>
                  <input
                    type="text"
                    value={shift.label}
                    onChange={e => updateShift(shift.id, "label", e.target.value)}
                    className="flex-1 text-base sm:text-sm font-medium bg-white dark:bg-white/[0.06] border border-surface-high dark:border-white/10 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    placeholder="שם המשמרת"
                  />
                  {dirtyShiftIds.has(shift.id) && (
                    <span className="text-[10px] font-medium text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0">
                      לא שמור
                    </span>
                  )}
                </div>
                {/* Row 2: time range + workers + delete */}
                <div className="flex items-center gap-2 ps-6 flex-wrap">
                  <div className="flex items-center gap-1 shrink-0" dir="ltr">
                    <span className="text-[10px] text-navy-muted/70 dark:text-slate-500">מ</span>
                    <input
                      type="time"
                      value={shift.start}
                      onChange={e => updateShift(shift.id, "start", e.target.value)}
                      className="text-base sm:text-xs bg-white dark:bg-white/[0.06] border border-surface-high dark:border-white/10 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500/30 w-[88px]"
                    />
                    <span className="text-navy-muted/70 dark:text-slate-500 text-xs">—</span>
                    <input
                      type="time"
                      value={shift.end}
                      onChange={e => updateShift(shift.id, "end", e.target.value)}
                      className="text-base sm:text-xs bg-white dark:bg-white/[0.06] border border-surface-high dark:border-white/10 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500/30 w-[88px]"
                    />
                    <span className="text-[10px] text-navy-muted/70 dark:text-slate-500">עד</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-navy-muted/70 dark:text-slate-500">עובדים נדרשים:</span>
                    <button onClick={() => updateShift(shift.id, "minWorkers", Math.max(1, (shift.minWorkers ?? 2) - 1))} className="w-9 h-9 sm:w-6 sm:h-6 rounded border border-surface-high dark:border-white/10 text-navy-muted dark:text-slate-400 hover:bg-surface-mid dark:hover:bg-white/[0.08] flex items-center justify-center text-sm leading-none">−</button>
                    <span className="w-5 text-center text-xs font-semibold text-navy dark:text-slate-100">{shift.minWorkers ?? 2}</span>
                    <button onClick={() => updateShift(shift.id, "minWorkers", Math.min(20, (shift.minWorkers ?? 2) + 1))} className="w-9 h-9 sm:w-6 sm:h-6 rounded border border-surface-high dark:border-white/10 text-navy-muted dark:text-slate-400 hover:bg-surface-mid dark:hover:bg-white/[0.08] flex items-center justify-center text-sm leading-none">+</button>
                  </div>
                  <button
                    onClick={() => duplicateShift(shift.id)}
                    className="text-blue-500 dark:text-brand-300 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-brand-500/15 border border-blue-300 transition-colors rounded px-2 py-0.5 text-xs font-medium leading-none"
                  >
                    שכפול
                  </button>
                  <button
                    onClick={() => setConfirmDeleteShift(shift.id)}
                    disabled={shifts.length <= 1}
                    className={cn(
                      "text-red-500 dark:text-rose-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-rose-500/10 border border-red-300 dark:border-rose-500/30 transition-colors rounded px-2 py-0.5 text-xs font-medium leading-none",
                      shifts.length <= 1 && "opacity-30 cursor-not-allowed"
                    )}
                  >
                    הסר
                  </button>
                </div>
                {/* Row 3: role */}
                <div className="flex items-center gap-2 ps-6">
                  <span className="text-[10px] text-navy-muted/70 dark:text-slate-500 shrink-0">תפקיד:</span>
                  <select
                    value={shift.role ?? ""}
                    onChange={e => updateShift(shift.id, "role", e.target.value)}
                    className="flex-1 text-base sm:text-xs bg-white dark:bg-white/[0.06] border border-surface-high dark:border-white/10 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  >
                    <option value="">כללי</option>
                    {shiftRoles.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          {overlappingIds.size > 0 && !overlapIgnored && (
            <div className="flex items-center justify-between gap-3 p-2 rounded-lg bg-red-50 dark:bg-rose-500/10 border border-red-200 dark:border-rose-500/20">
              <p className="text-sm text-red-600 dark:text-rose-300 font-medium">
                ⚠ משמרות חופפות: {shifts.filter(s => overlappingIds.has(s.id)).map(s => s.label).join(", ")}
              </p>
              <button onClick={() => setOverlapIgnored(true)} className="text-xs text-red-400 dark:text-rose-400 hover:text-red-600 dark:hover:text-rose-300 font-medium whitespace-nowrap px-2 py-0.5 rounded hover:bg-red-100 transition-colors flex-shrink-0">התעלם</button>
            </div>
          )}
          {shiftError && <p className="text-sm text-red-600 dark:text-rose-300">{shiftError}</p>}

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
            {shiftSaved && <span className="text-sm text-green-600 dark:text-emerald-400 font-medium">נשמר!</span>}
            {regenerated && <span className="text-sm text-green-600 dark:text-emerald-400 font-medium">לוח נוצר מחדש!</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── Deadline ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div>
            <h2 className="font-semibold text-navy dark:text-slate-100">מועד הגשת זמינות</h2>
            <p className="text-xs text-navy-muted dark:text-slate-400 mt-0.5">
              הגדר עד מתי העובדים יכולים לשלוח זמינות. ניתן לשנות בכל עת — אם תרצה לתת הארכה, פשוט הזז את התאריך קדימה.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="datetime-local"
              value={deadlineInput}
              onChange={e => setDeadlineInput(e.target.value)}
              className="text-base sm:text-sm border border-surface-high dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <Button onClick={saveDeadline} loading={deadlineSaving} size="md">
              שמור
            </Button>
            {deadlineSaved && <span className="text-sm text-green-600 dark:text-emerald-400 font-medium">נשמר!</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── Min rest hours ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div>
            <h2 className="font-semibold text-navy dark:text-slate-100">מינימום שעות מנוחה בין משמרות</h2>
            <p className="text-xs text-navy-muted dark:text-slate-400 mt-1">
              מספר השעות המינימלי הנדרש בין סיום משמרת לתחילת משמרת הבאה (ברירת מחדל: 7 שעות).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setMinRestHours(h => Math.max(0, h - 1))} className="w-10 h-10 sm:w-8 sm:h-8 rounded border border-surface-high dark:border-white/10 text-navy-muted dark:text-slate-400 hover:bg-surface-mid dark:hover:bg-white/[0.08] flex items-center justify-center text-lg leading-none">−</button>
            <span className="text-2xl font-bold text-navy dark:text-slate-100 w-10 text-center">{minRestHours}</span>
            <button onClick={() => setMinRestHours(h => Math.min(24, h + 1))} className="w-10 h-10 sm:w-8 sm:h-8 rounded border border-surface-high dark:border-white/10 text-navy-muted dark:text-slate-400 hover:bg-surface-mid dark:hover:bg-white/[0.08] flex items-center justify-center text-lg leading-none">+</button>
            <span className="text-sm text-navy-muted dark:text-slate-400">שעות</span>
            <Button onClick={saveRestHours} loading={restSaving} size="md">שמור</Button>
            {restSaved && <span className="text-sm text-green-600 dark:text-emerald-400 font-medium">נשמר!</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── Scheduling rules ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div>
            <h2 className="font-semibold text-navy dark:text-slate-100">כללי שיבוץ</h2>
            <p className="text-xs text-navy-muted dark:text-slate-400 mt-1">
              כללים שהאלגוריתם מנסה לכבד בעת יצירת הסידור.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-navy-muted dark:text-slate-400">מקסימום ימים רצופים:</span>
            <button onClick={() => setMaxConsecutiveDays(d => Math.max(0, d - 1))} className="w-10 h-10 sm:w-8 sm:h-8 rounded border border-surface-high dark:border-white/10 text-navy-muted dark:text-slate-400 hover:bg-surface-mid dark:hover:bg-white/[0.08] flex items-center justify-center text-lg leading-none">−</button>
            <span className="text-base font-bold text-navy dark:text-slate-100 w-16 text-center">{maxConsecutiveDays === 0 ? "ללא" : maxConsecutiveDays}</span>
            <button onClick={() => setMaxConsecutiveDays(d => Math.min(7, d + 1))} className="w-10 h-10 sm:w-8 sm:h-8 rounded border border-surface-high dark:border-white/10 text-navy-muted dark:text-slate-400 hover:bg-surface-mid dark:hover:bg-white/[0.08] flex items-center justify-center text-lg leading-none">+</button>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer w-fit">
            <input type="checkbox" checked={requireShiftLead} onChange={e => setRequireShiftLead(e.target.checked)} className="w-4 h-4 accent-brand-600" />
            <span className="text-sm text-navy dark:text-slate-100">דרוש ראש משמרת בכל משמרת</span>
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-navy-muted dark:text-slate-400 shrink-0">טלפון המנהל (לפניות עובדים):</span>
            <input
              type="tel"
              value={managerPhone}
              onChange={e => setManagerPhone(e.target.value)}
              placeholder="050-0000000"
              maxLength={20}
              className="text-base sm:text-sm bg-white dark:bg-white/[0.06] border border-surface-high dark:border-white/10 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/30 w-40"
            />
          </div>
          <p className="text-[11px] text-navy-muted/70 dark:text-slate-500 -mt-2">מאפשר לעובדים לשלוח לך "לא יכול להגיע" בוואטסאפ ישירות מהמשמרת.</p>
          <div className="flex items-center gap-3">
            <Button onClick={saveRules} loading={rulesSaving} size="md">שמור</Button>
            {rulesSaved && <span className="text-sm text-green-600 dark:text-emerald-400 font-medium">נשמר!</span>}
          </div>
        </CardContent>
      </Card>

      {/* ── Employees ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <h2 className="font-semibold text-navy dark:text-slate-100">עובדים</h2>
          <p className="text-xs text-navy-muted dark:text-slate-400">
            הוסף עובדים לפי שם וטלפון. לחץ על שם העובד להגדרת תפקידים וחוזה.
          </p>

          {/* Invite employees — the org join code lives here, next to where employees are added */}
          {orgCode && (
            <div className="flex items-center gap-3 flex-wrap p-3 rounded-xl border border-brand-200 dark:border-brand-400/20 bg-brand-50 dark:bg-brand-500/10">
              <KeyRound className="w-4 h-4 text-brand-600 dark:text-brand-400 flex-shrink-0" />
              <div className="flex-1 min-w-[180px]">
                <p className="text-xs font-semibold text-navy dark:text-slate-100">
                  קוד כניסה לעובדים: <span className="font-mono tracking-[0.2em] text-brand-700 dark:text-brand-300">{orgCode}</span>
                </p>
                <p className="text-[11px] text-navy-muted dark:text-slate-400 mt-0.5">עובדים נכנסים עם שם, טלפון והקוד הזה.</p>
              </div>
              <button
                type="button"
                onClick={copyInviteCode}
                className="flex items-center gap-1 text-xs font-medium text-navy-muted dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 px-2 py-1.5 rounded-lg hover:bg-brand-100 dark:hover:bg-brand-500/15 transition-colors"
              >
                {inviteCopied ? <Check className="w-3.5 h-3.5 text-success-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {inviteCopied ? "הועתק" : "העתק"}
              </button>
              <a
                href={inviteWhatsAppUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] px-3 py-1.5 rounded-lg transition-colors"
              >
                הזמן בוואטסאפ
              </a>
            </div>
          )}

          <form onSubmit={handleAddEmployee} className="space-y-3 p-3 rounded-xl border border-surface-high dark:border-white/10 bg-surface-low dark:bg-white/[0.03]">
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
              <span className="text-xs text-navy-muted dark:text-slate-400 shrink-0">חוזה (משמרות/שבוע):</span>
              <button type="button" onClick={() => setNewContract(c => Math.max(0, c - 1))} className="w-9 h-9 sm:w-6 sm:h-6 rounded border border-surface-high dark:border-white/10 text-navy-muted dark:text-slate-400 hover:bg-surface-mid dark:hover:bg-white/[0.08] flex items-center justify-center text-sm leading-none">−</button>
              <span className="w-6 text-center text-sm font-semibold text-navy dark:text-slate-100">{newContract === 0 ? "—" : newContract}</span>
              <button type="button" onClick={() => setNewContract(c => Math.min(7, c + 1))} className="w-9 h-9 sm:w-6 sm:h-6 rounded border border-surface-high dark:border-white/10 text-navy-muted dark:text-slate-400 hover:bg-surface-mid dark:hover:bg-white/[0.08] flex items-center justify-center text-sm leading-none">+</button>
            </div>
            {/* Roles */}
            {shiftRoles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-navy-muted dark:text-slate-400 shrink-0">תפקידים:</span>
                <RoleChipSelector roles={shiftRoles} selected={newRoles} onChange={setNewRoles} />
              </div>
            )}
            <Button type="submit" loading={empLoading} size="md" className="w-full">
              הוסף עובד
            </Button>
          </form>

          {empError && <p className="text-sm text-red-600 dark:text-rose-300">{empError}</p>}

          {employees.length === 0 ? (
            <p className="text-sm text-navy-muted/70 dark:text-slate-500 text-center py-4">אין עובדים עדיין.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-white/10">
              {employees.map(emp => (
                <li key={emp.id}>
                  {/* Main row */}
                  <div className="flex items-center justify-between py-2.5">
                    <button
                      type="button"
                      onClick={() => setExpandedEmp(expandedEmp === emp.id ? null : emp.id)}
                      className="flex items-center gap-1.5 text-start"
                    >
                      <span className="text-sm font-medium text-navy dark:text-slate-100">{emp.name}</span>
                      {emp.contractShifts != null && emp.contractShifts > 0 && (
                        <span className="text-[10px] text-blue-500 dark:text-brand-300 font-medium bg-blue-50 dark:bg-brand-500/15 px-1.5 py-0.5 rounded-full">
                          {emp.contractShifts} משמרות
                        </span>
                      )}
                      {emp.roles.length > 0 && (
                        <span className="text-[10px] text-purple-600 dark:text-purple-300 font-medium bg-purple-50 dark:bg-purple-500/15 px-1.5 py-0.5 rounded-full">
                          {emp.roles.join(", ")}
                        </span>
                      )}
                      <svg className={cn("w-3.5 h-3.5 text-navy-muted/70 dark:text-slate-500 transition-transform", expandedEmp === emp.id && "rotate-180")} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </button>
                    <div className="flex items-center gap-2">
                      {emp.phone && <span className="text-xs text-navy-muted/70 dark:text-slate-500">{emp.phone}</span>}
                      <button
                        onClick={() => setConfirmDeleteEmp(emp.id)}
                        className="text-xs text-navy-muted/70 dark:text-slate-500 hover:text-red-600 dark:hover:text-rose-300 transition-colors px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-rose-500/10"
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
                        <span className="text-xs text-navy-muted dark:text-slate-400 w-24 shrink-0">משמרות בשבוע:</span>
                        <button
                          onClick={() => updateEmpLocal(emp.id, { contractShifts: Math.max(0, (emp.contractShifts ?? 0) - 1) || null })}
                          className="w-9 h-9 sm:w-6 sm:h-6 rounded border border-surface-high dark:border-white/10 text-navy-muted dark:text-slate-400 hover:bg-surface-mid dark:hover:bg-white/[0.08] flex items-center justify-center text-sm leading-none"
                        >−</button>
                        <span className="w-6 text-center text-xs font-semibold text-navy dark:text-slate-100">
                          {emp.contractShifts ?? 0}
                        </span>
                        <button
                          onClick={() => updateEmpLocal(emp.id, { contractShifts: (emp.contractShifts ?? 0) + 1 })}
                          className="w-9 h-9 sm:w-6 sm:h-6 rounded border border-surface-high dark:border-white/10 text-navy-muted dark:text-slate-400 hover:bg-surface-mid dark:hover:bg-white/[0.08] flex items-center justify-center text-sm leading-none"
                        >+</button>
                        <span className="text-[10px] text-navy-muted/70 dark:text-slate-500">{emp.contractShifts ? "יעד לשבוע" : "ללא חוזה"}</span>
                      </div>

                      {/* Roles */}
                      {shiftRoles.length > 0 ? (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-navy-muted dark:text-slate-400 w-24 shrink-0 pt-0.5">תפקידים:</span>
                          <RoleChipSelector
                            roles={shiftRoles}
                            selected={emp.roles}
                            onChange={roles => updateEmpLocal(emp.id, { roles })}
                            showAll
                          />
                        </div>
                      ) : (
                        <p className="text-xs text-navy-muted/70 dark:text-slate-500">הגדר תפקידים בכרטיס "סוגי תפקידים" כדי להציג כאן.</p>
                      )}

                      {/* Shift lead */}
                      <label className="flex items-center gap-2 cursor-pointer w-fit">
                        <input
                          type="checkbox"
                          checked={!!emp.isShiftLead}
                          onChange={e => updateEmpLocal(emp.id, { isShiftLead: e.target.checked })}
                          className="w-4 h-4 accent-brand-600"
                        />
                        <span className="text-xs text-navy dark:text-slate-100">ראש משמרת</span>
                      </label>

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

      {confirmDeleteShift && (() => {
        const s = shifts.find(s => s.id === confirmDeleteShift);
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-[#131f33] dark:border dark:border-white/10 rounded-2xl shadow-xl p-6 max-w-xs w-full text-center" dir="rtl">
              <p className="font-bold text-navy dark:text-slate-100 text-base mb-1">הסרת משמרת</p>
              <p className="text-sm text-navy-muted dark:text-slate-400 mb-5">האם אתה בטוח שברצונך להסיר את <span className="font-semibold text-navy dark:text-slate-100">{s?.label}</span>?</p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => { removeShift(confirmDeleteShift); setConfirmDeleteShift(null); }}
                  className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors"
                >
                  הסר
                </button>
                <button
                  onClick={() => setConfirmDeleteShift(null)}
                  className="flex-1 py-2 rounded-lg border border-surface-high dark:border-white/10 hover:bg-surface-low dark:hover:bg-white/[0.03] text-navy dark:text-slate-100 text-sm font-semibold transition-colors"
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {confirmDeleteEmp && (() => {
        const emp = employees.find(e => e.id === confirmDeleteEmp);
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-[#131f33] dark:border dark:border-white/10 rounded-2xl shadow-xl p-6 max-w-xs w-full text-center" dir="rtl">
              <p className="font-bold text-navy dark:text-slate-100 text-base mb-1">הסרת עובד</p>
              <p className="text-sm text-navy-muted dark:text-slate-400 mb-5">האם אתה בטוח שברצונך להסיר את <span className="font-semibold text-navy dark:text-slate-100">{emp?.name}</span>?</p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => { handleDeleteEmployee(confirmDeleteEmp); setConfirmDeleteEmp(null); }}
                  className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors"
                >
                  הסר
                </button>
                <button
                  onClick={() => setConfirmDeleteEmp(null)}
                  className="flex-1 py-2 rounded-lg border border-surface-high dark:border-white/10 hover:bg-surface-low dark:hover:bg-white/[0.03] text-navy dark:text-slate-100 text-sm font-semibold transition-colors"
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
