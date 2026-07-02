"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, Copy, Check, ChevronDown, ChevronUp, Users, CalendarClock, Tag, SlidersHorizontal, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, empHex } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DEFAULT_SHIFTS, type ShiftConfig } from "@/lib/utils";
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

/** Transient "נשמר ✓" line shown after an auto-save completes. */
function SavedTick({ show, hint }: { show: boolean; hint?: string }) {
  if (!show) return null;
  return (
    <p className="text-sm text-green-600 dark:text-emerald-400 font-medium" role="status">
      נשמר ✓{hint ? <span className="text-navy-muted/70 dark:text-slate-500 font-normal"> — {hint}</span> : null}
    </p>
  );
}

export default function SettingsPage() {
  // One debounce registry for every auto-saving control on the page
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  function debounced(key: string, fn: () => void, ms = 800) {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, ms);
  }

  // A save failure anywhere on the page must be SAID — auto-save with a false
  // "נשמר ✓" (or silence) is silent data loss.
  const [saveError, setSaveError] = useState("");

  // ── Shift role types (already auto-saving) ─────────────────────────────────
  const [shiftRoles, setShiftRoles] = useState<string[]>([]);
  const [newRole, setNewRole] = useState("");
  const [rolesSaved, setRolesSaved] = useState(false);

  useEffect(() => {
    fetch("/api/shift-roles")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.roles)) setShiftRoles(d.roles); });
  }, []);

  async function saveRoles(updated: string[]) {
    try {
      const res = await fetch("/api/shift-roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: updated }),
      });
      if (!res.ok) throw new Error();
      setSaveError("");
      setRolesSaved(true);
      setTimeout(() => setRolesSaved(false), 2000);
    } catch {
      setSaveError("שגיאה בשמירת התפקידים — נסה שנית");
    }
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
    // Clear the deleted role everywhere it's referenced, so no shift or employee
    // stays silently restricted to a role that no longer exists.
    if (shiftsRef.current.some(s => s.role === role)) {
      setShifts(prev => prev.map(s => (s.role === role ? { ...s, role: "" } : s)));
      queueSaveShifts();
    }
    empsRef.current
      .filter(e => e.roles.includes(role))
      .forEach(e => updateEmpLocal(e.id, { roles: e.roles.filter(r => r !== role) }));
  }

  // ── Employees ──────────────────────────────────────────────────────────────
  const [employees, setEmployees] = useState<Employee[]>([]);
  const empsRef = useRef(employees);
  empsRef.current = employees;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [newRoles, setNewRoles] = useState<string[]>([]);
  const [newContract, setNewContract] = useState<number>(0);
  const [empLoading, setEmpLoading] = useState(false);
  const [empError, setEmpError] = useState("");
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [confirmDeleteEmp, setConfirmDeleteEmp] = useState<string | null>(null);
  const [confirmDeleteShift, setConfirmDeleteShift] = useState<string | null>(null);
  const [empSaved, setEmpSaved] = useState<string | null>(null);

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
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) { setEmpError(data?.error ?? "שגיאה בהוספה"); return; }
      // Save roles + contract immediately if set — only reflect locally if persisted
      if (newRoles.length > 0 || newContract > 0) {
        const patchRes = await fetch("/api/employees", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: data.id, roles: newRoles, contractShifts: newContract > 0 ? newContract : null }),
        });
        if (patchRes.ok) {
          data.roles = newRoles;
          data.contractShifts = newContract > 0 ? newContract : null;
        }
      }
      setEmployees(prev => [...prev, data]);
      setName("");
      setPhone("");
      setNewRoles([]);
      setNewContract(0);
    } catch {
      setEmpError("שגיאת רשת — נסה שנית");
    } finally {
      setEmpLoading(false);
    }
  }

  async function handleDeleteEmployee(id: string) {
    const res = await fetch("/api/employees", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setEmployees(prev => prev.filter(e => e.id !== id));
    else { setEmpError("שגיאה בהסרת העובד — נסה שנית"); setTimeout(() => setEmpError(""), 4000); }
  }

  /** Local update + debounced auto-save — no save button, no dirty tracking. */
  function updateEmpLocal(id: string, patch: { roles?: string[]; contractShifts?: number | null; isShiftLead?: boolean }) {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
    debounced(`emp-${id}`, async () => {
      const emp = empsRef.current.find(e => e.id === id);
      if (!emp) return;
      try {
        const res = await fetch("/api/employees", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, roles: emp.roles, contractShifts: emp.contractShifts, isShiftLead: emp.isShiftLead ?? false }),
        });
        if (!res.ok) throw new Error();
        setSaveError("");
        setEmpSaved(id);
        setTimeout(() => setEmpSaved(cur => (cur === id ? null : cur)), 2000);
      } catch {
        setSaveError(`שגיאה בשמירת ${emp.name} — נסה שנית`);
      }
    });
  }

  // ── Shifts (auto-saving) ────────────────────────────────────────────────────
  const [shifts, setShifts] = useState<ShiftConfig[]>(DEFAULT_SHIFTS);
  const shiftsRef = useRef(shifts);
  shiftsRef.current = shifts;
  const [shiftSaved, setShiftSaved] = useState(false);
  const [shiftError, setShiftError] = useState("");
  const [overlapIgnored, setOverlapIgnored] = useState(false);

  // ── Invite employees (org code) ─────────────────────────────────────────────
  const [orgCode, setOrgCode] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  useEffect(() => {
    fetch("/api/shifts")
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : data?.shifts;
        if (Array.isArray(arr)) setShifts(arr);
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

  function queueSaveShifts() {
    debounced("shifts", async () => {
      setShiftError("");
      const res = await fetch("/api/shifts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shifts: shiftsRef.current }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setShiftError(data?.error ?? "שגיאה בשמירה");
        return;
      }
      setShiftSaved(true);
      setTimeout(() => setShiftSaved(false), 3500);
    });
  }

  function updateShift(id: string, field: keyof ShiftConfig, value: string | number) {
    setShifts(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
    setOverlapIgnored(false);
    queueSaveShifts();
  }

  function addShift() {
    const newId = `SHIFT_${crypto.randomUUID().slice(0, 8)}`;
    setShifts(prev => [...prev, { id: newId, label: "משמרת חדשה", start: "08:00", end: "16:00", minWorkers: 2 }]);
    queueSaveShifts();
  }

  function removeShift(id: string) {
    if (shifts.length <= 1) return;
    setShifts(prev => prev.filter(s => s.id !== id));
    queueSaveShifts();
  }

  function duplicateShift(id: string) {
    const src = shifts.find(s => s.id === id);
    if (!src) return;
    const newId = `SHIFT_${crypto.randomUUID().slice(0, 8)}`;
    setShifts(prev => {
      const idx = prev.findIndex(s => s.id === id);
      const copy = { ...src, id: newId, label: `${src.label} (עותק)` };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    queueSaveShifts();
  }

  /** Reorder via arrows (row drag was removed from the dashboard grid). */
  function moveShift(index: number, dir: -1 | 1) {
    setShifts(prev => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
    queueSaveShifts();
  }

  // ── Advanced settings (deadline / rest / rules) — collapsed by default ─────
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [deadlineInput, setDeadlineInput] = useState("");
  const [deadlineSaved, setDeadlineSaved] = useState(false);
  const [minRestHours, setMinRestHours] = useState(8);
  const [restSaved, setRestSaved] = useState(false);
  const [maxConsecutiveDays, setMaxConsecutiveDays] = useState(0);
  const [requireShiftLead, setRequireShiftLead] = useState(false);
  const [managerPhone, setManagerPhone] = useState("");
  const [rulesSaved, setRulesSaved] = useState(false);
  const rulesRef = useRef({ maxConsecutiveDays, requireShiftLead, managerPhone });
  rulesRef.current = { maxConsecutiveDays, requireShiftLead, managerPhone };
  const restRef = useRef(minRestHours);
  restRef.current = minRestHours;
  const deadlineRef = useRef(deadlineInput);
  deadlineRef.current = deadlineInput;

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

  /** Interpret a datetime-local string as Asia/Jerusalem wall-clock time and return UTC ISO
   *  (display already formats in Asia/Jerusalem — save must be symmetric). */
  function fromJerusalemLocal(v: string): string {
    const asUtc = new Date(v + ":00Z");
    const offsetMs =
      new Date(asUtc.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })).getTime() -
      new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
    return new Date(asUtc.getTime() - offsetMs).toISOString();
  }

  function queueSaveDeadline(value: string) {
    setDeadlineInput(value);
    debounced("deadline", async () => {
      const v = deadlineRef.current;
      if (v && isNaN(new Date(v).getTime())) return;
      try {
        const res = await fetch("/api/deadline", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          // Empty field = clear the deadline (unlocks submissions with no time limit)
          body: JSON.stringify({ deadline: v ? fromJerusalemLocal(v) : null }),
        });
        if (!res.ok) throw new Error();
        setSaveError("");
        setDeadlineSaved(true);
        setTimeout(() => setDeadlineSaved(false), 2000);
      } catch {
        setSaveError("שגיאה בשמירת מועד ההגשה — נסה שנית");
      }
    });
  }

  function queueSaveRest(value: number) {
    setMinRestHours(value);
    debounced("rest", async () => {
      try {
        const res = await fetch("/api/min-rest-hours", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ minRestHours: restRef.current }),
        });
        if (!res.ok) throw new Error();
        setSaveError("");
        setRestSaved(true);
        setTimeout(() => setRestSaved(false), 2000);
      } catch {
        setSaveError("שגיאה בשמירת שעות המנוחה — נסה שנית");
      }
    });
  }

  function queueSaveRules(patch: Partial<{ maxConsecutiveDays: number; requireShiftLead: boolean; managerPhone: string }>) {
    if (patch.maxConsecutiveDays !== undefined) setMaxConsecutiveDays(patch.maxConsecutiveDays);
    if (patch.requireShiftLead !== undefined) setRequireShiftLead(patch.requireShiftLead);
    if (patch.managerPhone !== undefined) setManagerPhone(patch.managerPhone);
    debounced("rules", async () => {
      try {
        const res = await fetch("/api/scheduling-rules", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rulesRef.current),
        });
        if (!res.ok) throw new Error();
        setSaveError("");
        setRulesSaved(true);
        setTimeout(() => setRulesSaved(false), 2000);
      } catch {
        setSaveError("שגיאה בשמירת כללי השיבוץ — נסה שנית");
      }
    });
  }

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

  const stepperCls = "w-9 h-9 sm:w-6 sm:h-6 rounded border border-surface-high dark:border-white/10 text-navy-muted dark:text-slate-400 hover:bg-surface-mid dark:hover:bg-white/[0.08] flex items-center justify-center text-sm leading-none";
  // Same shift-dot colors as the dashboard grid — cross-screen identity
  const shiftDotColors = ["bg-yellow-400", "bg-orange-400", "bg-indigo-400", "bg-blue-400", "bg-pink-400"];

  // Glanceable summary of the advanced settings while the accordion is closed
  const advSummary = [
    deadlineInput && !isNaN(new Date(deadlineInput).getTime())
      ? `דדליין: ${format(new Date(deadlineInput), "EEEE HH:mm", { locale: he })}`
      : "ללא דדליין",
    `מנוחה: ${minRestHours} ש׳`,
    maxConsecutiveDays > 0 ? `עד ${maxConsecutiveDays} ימים רצופים` : null,
    requireShiftLead ? "ראש משמרת נדרש" : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-xl font-bold text-navy dark:text-slate-100">הגדרות</h1>
        <p className="text-sm text-navy-muted/70 dark:text-slate-500 mt-0.5">כל שינוי נשמר אוטומטית.</p>
        {saveError && <p className="text-sm text-red-600 dark:text-rose-300 mt-2" role="alert">{saveError}</p>}
      </div>

      {/* ── 1. Employees — the first thing a new manager needs ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <h2 className="font-semibold text-navy dark:text-slate-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-600 dark:text-brand-400" /> עובדים
            {employees.length > 0 && <span className="text-xs font-normal text-navy-muted/70 dark:text-slate-500">({employees.length})</span>}
          </h2>
          <p className="text-sm text-navy-muted dark:text-slate-400">
            הוסף עובדים לפי שם וטלפון. לחץ על שם העובד להגדרת תפקידים וחוזה.
          </p>

          {/* Invite employees — the org join code lives here, next to where employees are added */}
          {orgCode && (
            <div className="flex items-center gap-3 flex-wrap p-3 rounded-xl border border-brand-200 dark:border-brand-400/20 bg-brand-50 dark:bg-brand-500/10">
              <KeyRound className="w-4 h-4 text-brand-600 dark:text-brand-400 flex-shrink-0" />
              <div className="flex-1 min-w-[180px]">
                <p className="text-sm font-semibold text-navy dark:text-slate-100">
                  קוד כניסה לעובדים: <span className="font-mono tracking-[0.2em] text-brand-700 dark:text-brand-300">{orgCode}</span>
                </p>
                <p className="text-xs text-navy-muted dark:text-slate-400 mt-0.5">עובדים נכנסים עם שם, טלפון והקוד הזה.</p>
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
              <span className="text-sm text-navy-muted dark:text-slate-400 shrink-0">חוזה (משמרות/שבוע):</span>
              <button type="button" onClick={() => setNewContract(c => Math.max(0, c - 1))} className={stepperCls}>−</button>
              <span className="w-6 text-center text-sm font-semibold text-navy dark:text-slate-100">{newContract === 0 ? "—" : newContract}</span>
              <button type="button" onClick={() => setNewContract(c => Math.min(7, c + 1))} className={stepperCls}>+</button>
            </div>
            {/* Roles */}
            {shiftRoles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-sm text-navy-muted dark:text-slate-400 shrink-0">תפקידים:</span>
                <RoleChipSelector roles={shiftRoles} selected={newRoles} onChange={setNewRoles} />
              </div>
            )}
            <Button type="submit" loading={empLoading} size="md" className="w-full">
              הוסף עובד
            </Button>
          </form>

          {empError && <p className="text-sm text-red-600 dark:text-rose-300" role="alert">{empError}</p>}

          {employees.length === 0 ? (
            <div className="text-center py-5">
              <Users className="w-8 h-8 text-navy-muted/30 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-navy-muted/70 dark:text-slate-500">אין עובדים עדיין — הוסף את הראשון למעלה.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-white/10">
              {employees.map((emp, i) => (
                <li key={emp.id}>
                  {/* Main row */}
                  <div className="flex items-center justify-between py-2.5">
                    <button
                      type="button"
                      onClick={() => setExpandedEmp(expandedEmp === emp.id ? null : emp.id)}
                      className="flex items-center gap-2 text-start"
                    >
                      <Avatar name={emp.name} color={empHex(i)} size={24} />
                      <span className="text-[15px] font-medium text-navy dark:text-slate-100">{emp.name}</span>
                      {emp.contractShifts != null && emp.contractShifts > 0 && (
                        <span className="text-[11px] text-blue-500 dark:text-brand-300 font-medium bg-blue-50 dark:bg-brand-500/15 px-1.5 py-0.5 rounded-full">
                          {emp.contractShifts} משמרות
                        </span>
                      )}
                      {emp.roles.length > 0 && (
                        <span className="text-[11px] text-purple-600 dark:text-purple-300 font-medium bg-purple-50 dark:bg-purple-500/15 px-1.5 py-0.5 rounded-full">
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
                    <div className="mb-3 p-3 rounded-xl bg-surface-low dark:bg-white/[0.03] border border-surface-high/60 dark:border-white/[0.06] space-y-3">
                      {/* Contract shifts */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-navy-muted dark:text-slate-400 w-24 shrink-0">משמרות בשבוע:</span>
                        <button onClick={() => updateEmpLocal(emp.id, { contractShifts: Math.max(0, (emp.contractShifts ?? 0) - 1) || null })} className={stepperCls}>−</button>
                        <span className="w-6 text-center text-sm font-semibold text-navy dark:text-slate-100">
                          {emp.contractShifts ?? 0}
                        </span>
                        <button onClick={() => updateEmpLocal(emp.id, { contractShifts: (emp.contractShifts ?? 0) + 1 })} className={stepperCls}>+</button>
                        <span className="text-xs text-navy-muted/70 dark:text-slate-500">{emp.contractShifts ? "יעד לשבוע" : "ללא חוזה"}</span>
                      </div>

                      {/* Roles */}
                      {shiftRoles.length > 0 ? (
                        <div className="flex items-start gap-2">
                          <span className="text-sm text-navy-muted dark:text-slate-400 w-24 shrink-0 pt-0.5">תפקידים:</span>
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
                        <span className="text-sm text-navy dark:text-slate-100">ראש משמרת</span>
                      </label>

                      <SavedTick show={empSaved === emp.id} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Shifts ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-navy dark:text-slate-100 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-brand-600 dark:text-brand-400" /> משמרות
              </h2>
              <p className="text-sm text-navy-muted dark:text-slate-400 mt-0.5">שם, שעות, תפקיד ומספר עובדים לכל משמרת. הסדר כאן הוא הסדר בלוח.</p>
            </div>
            <button
              onClick={addShift}
              className="flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-brand-300 hover:text-blue-800 dark:hover:text-brand-200 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-brand-500/15 transition-colors"
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
                {/* Row 1: reorder + name */}
                <div className="flex items-center gap-2">
                  <div className="flex flex-col shrink-0">
                    <button
                      onClick={() => moveShift(i, -1)}
                      disabled={i === 0}
                      aria-label="הזז למעלה"
                      className="text-navy-muted/70 dark:text-slate-500 hover:text-navy dark:hover:text-slate-200 disabled:opacity-25 p-0.5"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveShift(i, 1)}
                      disabled={i === shifts.length - 1}
                      aria-label="הזז למטה"
                      className="text-navy-muted/70 dark:text-slate-500 hover:text-navy dark:hover:text-slate-200 disabled:opacity-25 p-0.5"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", shiftDotColors[i % shiftDotColors.length])} />
                  <input
                    type="text"
                    value={shift.label}
                    onChange={e => updateShift(shift.id, "label", e.target.value)}
                    className="flex-1 text-base sm:text-sm font-medium bg-white dark:bg-white/[0.06] border border-surface-high dark:border-white/10 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    placeholder="שם המשמרת"
                  />
                </div>
                {/* Row 2: time range + workers + delete */}
                <div className="flex items-center gap-2 ps-6 flex-wrap">
                  <div className="flex items-center gap-1 shrink-0" dir="ltr">
                    <span className="text-xs text-navy-muted/70 dark:text-slate-500">מ</span>
                    <input
                      type="time"
                      value={shift.start}
                      onChange={e => updateShift(shift.id, "start", e.target.value)}
                      className="text-base sm:text-sm bg-white dark:bg-white/[0.06] border border-surface-high dark:border-white/10 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500/30 w-[88px]"
                    />
                    <span className="text-navy-muted/70 dark:text-slate-500 text-xs">—</span>
                    <input
                      type="time"
                      value={shift.end}
                      onChange={e => updateShift(shift.id, "end", e.target.value)}
                      className="text-base sm:text-sm bg-white dark:bg-white/[0.06] border border-surface-high dark:border-white/10 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500/30 w-[88px]"
                    />
                    <span className="text-xs text-navy-muted/70 dark:text-slate-500">עד</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-navy-muted/70 dark:text-slate-500">עובדים נדרשים:</span>
                    <button onClick={() => updateShift(shift.id, "minWorkers", Math.max(1, (shift.minWorkers ?? 2) - 1))} className={stepperCls}>−</button>
                    <span className="w-5 text-center text-sm font-semibold text-navy dark:text-slate-100">{shift.minWorkers ?? 2}</span>
                    <button onClick={() => updateShift(shift.id, "minWorkers", Math.min(20, (shift.minWorkers ?? 2) + 1))} className={stepperCls}>+</button>
                  </div>
                  <button
                    onClick={() => duplicateShift(shift.id)}
                    aria-label={`שכפל את ${shift.label}`}
                    title="שכפל משמרת"
                    className="w-8 h-8 sm:w-7 sm:h-7 grid place-items-center rounded-lg text-navy-muted dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/15 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteShift(shift.id)}
                    disabled={shifts.length <= 1}
                    aria-label={`הסר את ${shift.label}`}
                    title="הסר משמרת"
                    className={cn(
                      "w-8 h-8 sm:w-7 sm:h-7 grid place-items-center rounded-lg text-navy-muted dark:text-slate-400 hover:text-red-600 dark:hover:text-rose-300 hover:bg-red-50 dark:hover:bg-rose-500/10 transition-colors",
                      shifts.length <= 1 && "opacity-30 cursor-not-allowed"
                    )}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* Row 3: role */}
                <div className="flex items-center gap-2 ps-6">
                  <span className="text-xs text-navy-muted/70 dark:text-slate-500 shrink-0">תפקיד:</span>
                  <select
                    value={shift.role ?? ""}
                    onChange={e => updateShift(shift.id, "role", e.target.value)}
                    className="flex-1 text-base sm:text-sm bg-white dark:bg-white/[0.06] border border-surface-high dark:border-white/10 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
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
          {shiftError && <p className="text-sm text-red-600 dark:text-rose-300" role="alert">{shiftError}</p>}
          <SavedTick show={shiftSaved} hint="לחץ 'צור מחדש' בלוח הבקרה כדי להחיל על הסידור" />
        </CardContent>
      </Card>

      {/* ── 3. Shift role types ── */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div>
            <h2 className="font-semibold text-navy dark:text-slate-100 flex items-center gap-2">
              <Tag className="w-4 h-4 text-brand-600 dark:text-brand-400" /> סוגי תפקידים
            </h2>
            <p className="text-sm text-navy-muted dark:text-slate-400 mt-0.5">הגדר את התפקידים האפשריים (למשל: מלצר, ברמן, הוסטס). ניתן לשייך תפקיד לכל משמרת ועובד.</p>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addRole())}
              placeholder="שם תפקיד חדש"
              className="flex-1 text-base sm:text-sm bg-white dark:bg-white/[0.06] border border-surface-high dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
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
                    aria-label={`הסר תפקיד ${role}`}
                    className="text-purple-400 dark:text-purple-300 hover:text-purple-700 dark:hover:text-purple-300 font-bold leading-none"
                  >×</button>
                </span>
              ))}
            </div>
          )}
          <SavedTick show={rolesSaved} />
        </CardContent>
      </Card>

      {/* ── 4. Advanced — set once, then forget ── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <button onClick={() => setShowAdvanced(v => !v)} className="w-full flex items-center justify-between">
            <span className="font-semibold text-navy dark:text-slate-100 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-brand-600 dark:text-brand-400" /> הגדרות מתקדמות
            </span>
            <ChevronDown className={cn("w-5 h-5 text-navy-muted dark:text-slate-400 transition-transform", showAdvanced && "rotate-180")} />
          </button>
          {!showAdvanced && (
            <p className="mt-1.5 text-sm text-navy-muted/70 dark:text-slate-500 text-right">{advSummary}</p>
          )}
          {showAdvanced && (
            <div className="mt-5 space-y-6">
              {/* Deadline */}
              <div className="space-y-2">
                <h3 className="text-[15px] font-semibold text-navy dark:text-slate-100">מועד הגשת זמינות</h3>
                <p className="text-sm text-navy-muted dark:text-slate-400">
                  עד מתי העובדים יכולים לשלוח זמינות. להארכה — פשוט הזז את התאריך קדימה.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    type="datetime-local"
                    value={deadlineInput}
                    onChange={e => queueSaveDeadline(e.target.value)}
                    className="text-base sm:text-sm bg-white dark:bg-white/[0.06] border border-surface-high dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                  <SavedTick show={deadlineSaved} />
                </div>
              </div>

              {/* Min rest */}
              <div className="space-y-2">
                <h3 className="text-[15px] font-semibold text-navy dark:text-slate-100">מינימום שעות מנוחה בין משמרות</h3>
                <p className="text-sm text-navy-muted dark:text-slate-400">מינימום חוקי בישראל: 8 שעות.</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => queueSaveRest(Math.max(0, minRestHours - 1))} className={stepperCls}>−</button>
                  <span className="text-xl font-bold text-navy dark:text-slate-100 w-8 text-center">{minRestHours}</span>
                  <button onClick={() => queueSaveRest(Math.min(24, minRestHours + 1))} className={stepperCls}>+</button>
                  <span className="text-sm text-navy-muted dark:text-slate-400">שעות</span>
                  <SavedTick show={restSaved} />
                </div>
                {minRestHours < 8 && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">שים לב: פחות מ-8 שעות הוא מתחת למינימום החוקי בישראל.</p>
                )}
              </div>

              {/* Rules */}
              <div className="space-y-3">
                <h3 className="text-[15px] font-semibold text-navy dark:text-slate-100">כללי שיבוץ</h3>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-navy-muted dark:text-slate-400">מקסימום ימים רצופים:</span>
                  <button onClick={() => queueSaveRules({ maxConsecutiveDays: Math.max(0, maxConsecutiveDays - 1) })} className={stepperCls}>−</button>
                  <span className="text-base font-bold text-navy dark:text-slate-100 w-14 text-center">{maxConsecutiveDays === 0 ? "ללא" : maxConsecutiveDays}</span>
                  <button onClick={() => queueSaveRules({ maxConsecutiveDays: Math.min(7, maxConsecutiveDays + 1) })} className={stepperCls}>+</button>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer w-fit">
                  <input type="checkbox" checked={requireShiftLead} onChange={e => queueSaveRules({ requireShiftLead: e.target.checked })} className="w-4 h-4 accent-brand-600" />
                  <span className="text-sm text-navy dark:text-slate-100">דרוש ראש משמרת בכל משמרת</span>
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-navy-muted dark:text-slate-400 shrink-0">טלפון המנהל (לפניות עובדים):</span>
                  <input
                    type="tel"
                    value={managerPhone}
                    onChange={e => queueSaveRules({ managerPhone: e.target.value })}
                    placeholder="050-0000000"
                    maxLength={20}
                    className="text-base sm:text-sm bg-white dark:bg-white/[0.06] border border-surface-high dark:border-white/10 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/30 w-40"
                  />
                </div>
                <p className="text-xs text-navy-muted/70 dark:text-slate-500">מאפשר לעובדים לשלוח לך "לא יכול להגיע" בוואטסאפ ישירות מהמשמרת.</p>
                <SavedTick show={rulesSaved} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {confirmDeleteShift && (() => {
        const s = shifts.find(s => s.id === confirmDeleteShift);
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div role="dialog" aria-modal="true" className="bg-white dark:bg-[#131f33] dark:border dark:border-white/10 rounded-2xl shadow-xl p-6 max-w-xs w-full text-center" dir="rtl">
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
            <div role="dialog" aria-modal="true" className="bg-white dark:bg-[#131f33] dark:border dark:border-white/10 rounded-2xl shadow-xl p-6 max-w-xs w-full text-center" dir="rtl">
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
