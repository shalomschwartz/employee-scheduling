import { DAYS, DEFAULT_SHIFTS, DAY_LABELS_HE, toMins, gapMins, type Day, type ShiftKey, type AvailabilityOption, type ShiftConfig } from "@/lib/utils";

export interface EmployeeForScheduling {
  id: string;
  name: string | null;
  email: string;
  isShiftLead: boolean;
  constraints: Record<Day, Record<ShiftKey, AvailabilityOption>> | null;
  roles: string[];               // which shift roles this employee can work
  contractShifts: number | null; // target shifts/week (null = no contract)
}

export interface ShiftSlot {
  employeeIds: string[];
  understaffed: boolean;
}

export type ScheduleData = Record<Day, Record<ShiftKey, ShiftSlot>>;

// Time-gap helpers (toMins, gapMins) are imported from @/lib/utils
function shiftsOverlap(a: ShiftConfig, b: ShiftConfig): boolean {
  return gapMins(a.start, b.start) < gapMins(a.start, a.end)
      || gapMins(b.start, a.start) < gapMins(b.start, b.end);
}
function hasEnoughRest(si: number, assignedSi: number, shifts: ShiftConfig[], minRestMins: number): boolean {
  const a = shifts[si]; const b = shifts[assignedSi];
  if (shiftsOverlap(a, b)) return false;
  return Math.min(gapMins(a.end, b.start), gapMins(b.end, a.start)) >= minRestMins;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function runScheduler(
  employees: EmployeeForScheduling[],
  pinnedSlots: Record<string, Record<string, string[]>> = {},
  shifts: ShiftConfig[] = DEFAULT_SHIFTS,
  minRestHours: number = 7
): { schedule: ScheduleData; warnings: string[] } {
  const pool = shuffle(employees);
  const shiftCounts: Record<string, number> = {};
  for (const emp of pool) shiftCounts[emp.id] = 0;

  const schedule = {} as ScheduleData;
  const warnings: string[] = [];
  const minRestMins = minRestHours * 60;

  for (const day of DAYS) {
    schedule[day] = {} as Record<ShiftKey, ShiftSlot>;
    // Tracks which shift indices each employee already has this day (for rest/overlap checks)
    const dayEmpShiftIdx: Record<string, Set<number>> = {};

    // ── Seed pinned employees into every slot ────────────────────────────────
    for (const [si, shiftCfg] of shifts.entries()) {
      const shift = shiftCfg.id as ShiftKey;
      const pinnedIds = pinnedSlots[day]?.[shift] ?? [];
      const pinned = pinnedIds
        .map(id => pool.find(e => e.id === id))
        .filter(Boolean) as EmployeeForScheduling[];
      for (const emp of pinned) {
        shiftCounts[emp.id] += 1;
        (dayEmpShiftIdx[emp.id] ??= new Set()).add(si);
      }
      schedule[day][shift] = { employeeIds: pinned.map(e => e.id), understaffed: true };
    }

    // ── Shared helpers ───────────────────────────────────────────────────────
    const softCap = () => {
      const total = Object.values(shiftCounts).reduce((s, c) => s + c, 0);
      return pool.length > 0 ? total / pool.length + 1 : 1;
    };

    const byShiftCount = (a: EmployeeForScheduling, b: EmployeeForScheduling) =>
      shiftCounts[a.id] - shiftCounts[b.id];

    // Build a ranked candidate list for a shift, excluding already-assigned ids.
    // Returns null if a role-fallback warning was already emitted.
    const getRanked = (
      si: number,
      shiftCfg: ShiftConfig,
      excludeIds: Set<string>,
      emitRoleWarning: boolean
    ): EmployeeForScheduling[] => {
      const shift = shiftCfg.id as ShiftKey;
      const shiftRole = shiftCfg.role?.trim();
      const eligible = (emp: EmployeeForScheduling, ignoreRole = false) => {
        if (excludeIds.has(emp.id)) return false;
        if (emp.contractShifts != null && shiftCounts[emp.id] >= emp.contractShifts) return false;
        const empShifts = dayEmpShiftIdx[emp.id];
        if (empShifts && [...empShifts].some(aSi => !hasEnoughRest(si, aSi, shifts, minRestMins))) return false;
        if (!ignoreRole && shiftRole && !emp.roles.includes(shiftRole)) return false;
        return true;
      };

      const bucket = (ignoreRole = false) => {
        const avail: EmployeeForScheduling[] = [];
        const pref: EmployeeForScheduling[] = [];
        for (const emp of pool) {
          if (!eligible(emp, ignoreRole)) continue;
          const val: AvailabilityOption = emp.constraints?.[day]?.[shift] ?? "available";
          if (val === "available") avail.push(emp);
          else if (val === "prefer_not") pref.push(emp);
        }
        return [...avail, ...pref];
      };

      let candidates = bucket();

      // Role fallback: if no one qualifies by role, warn once then ignore role
      if (shiftRole && candidates.length === 0) {
        if (emitRoleWarning) {
          warnings.push(`${DAY_LABELS_HE[day as Day]} ${shiftCfg.label}: אין עובדים עם תפקיד "${shiftRole}"`);
        }
        candidates = bucket(true);
      }

      const cap = softCap();
      const underContract = candidates.filter(e => e.contractShifts != null && e.contractShifts > 0 && shiftCounts[e.id] < e.contractShifts);
      const belowCap = candidates.filter(e => !(e.contractShifts != null && e.contractShifts > 0 && shiftCounts[e.id] < e.contractShifts) && shiftCounts[e.id] <= cap);
      const aboveCap  = candidates.filter(e => !(e.contractShifts != null && e.contractShifts > 0 && shiftCounts[e.id] < e.contractShifts) && shiftCounts[e.id] > cap);

      underContract.sort(byShiftCount);
      belowCap.sort(byShiftCount);
      aboveCap.sort(byShiftCount);

      return [...underContract, ...belowCap, ...aboveCap];
    };

    const assign = (emp: EmployeeForScheduling, si: number, shift: ShiftKey) => {
      schedule[day][shift].employeeIds.push(emp.id);
      shiftCounts[emp.id] += 1;
      (dayEmpShiftIdx[emp.id] ??= new Set()).add(si);
    };

    // ── Pass 1: coverage — guarantee at least 1 employee per shift ───────────
    for (const [si, shiftCfg] of shifts.entries()) {
      const shift = shiftCfg.id as ShiftKey;
      if (schedule[day][shift].employeeIds.length >= 1) continue; // pinned already covered

      const excludeIds = new Set(schedule[day][shift].employeeIds);
      const ranked = getRanked(si, shiftCfg, excludeIds, true);
      if (ranked.length > 0) assign(ranked[0], si, shift);
    }

    // ── Pass 2: fill — top-up each shift to minWorkers ───────────────────────
    for (const [si, shiftCfg] of shifts.entries()) {
      const shift = shiftCfg.id as ShiftKey;
      const minWorkers = shiftCfg.minWorkers ?? 2;
      const current = schedule[day][shift].employeeIds;
      if (current.length >= minWorkers) continue;

      const excludeIds = new Set(current);
      // Role warning already emitted in pass 1; suppress duplicate in pass 2
      const ranked = getRanked(si, shiftCfg, excludeIds, false);
      for (const emp of ranked) {
        if (schedule[day][shift].employeeIds.length >= minWorkers) break;
        if (schedule[day][shift].employeeIds.includes(emp.id)) continue;
        assign(emp, si, shift);
      }
    }

    // ── Finalise understaffed flags + warnings ───────────────────────────────
    for (const shiftCfg of shifts) {
      const shift = shiftCfg.id as ShiftKey;
      const minWorkers = shiftCfg.minWorkers ?? 2;
      const ids = schedule[day][shift].employeeIds;
      const understaffed = ids.length < minWorkers;
      schedule[day][shift] = { employeeIds: ids, understaffed };

      if (ids.length === 0) {
        warnings.push(`${DAY_LABELS_HE[day as Day]} ${shiftCfg.label}: אין עובדים זמינים`);
      } else if (understaffed) {
        warnings.push(`${DAY_LABELS_HE[day as Day]} ${shiftCfg.label}: רק ${ids.length}/${minWorkers} עובדים שובצו`);
      }
    }
  }

  return { schedule, warnings };
}
