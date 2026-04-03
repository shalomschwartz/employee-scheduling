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

  // dayEmpShiftIdx[day][empId] = Set of shift indices assigned that day
  const dayEmpShiftIdx: Record<string, Record<string, Set<number>>> = {};

  // ── Seed pinned employees into every slot ──────────────────────────────────
  for (const day of DAYS) {
    schedule[day] = {} as Record<ShiftKey, ShiftSlot>;
    dayEmpShiftIdx[day] = {};

    for (const [si, shiftCfg] of shifts.entries()) {
      const shift = shiftCfg.id as ShiftKey;
      const pinnedIds = pinnedSlots[day]?.[shift] ?? [];
      const pinned = pinnedIds
        .map(id => pool.find(e => e.id === id))
        .filter(Boolean) as EmployeeForScheduling[];
      for (const emp of pinned) {
        shiftCounts[emp.id] += 1;
        (dayEmpShiftIdx[day][emp.id] ??= new Set()).add(si);
      }
      schedule[day][shift] = { employeeIds: pinned.map(e => e.id), understaffed: true };
    }
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────
  const softCap = () => {
    const total = Object.values(shiftCounts).reduce((s, c) => s + c, 0);
    return pool.length > 0 ? total / pool.length + 1 : 1;
  };

  const byShiftCount = (a: EmployeeForScheduling, b: EmployeeForScheduling) =>
    shiftCounts[a.id] - shiftCounts[b.id];

  // getRanked builds a ranked candidate list for a slot.
  // ignoreContract: skip contract cap check (used as last resort).
  // includeUnavailable: also include employees who marked this shift "unavailable"
  //   (used only in pass 1's final fallback to guarantee at least 1 person per slot).
  const getRanked = (
    day: string,
    si: number,
    shiftCfg: ShiftConfig,
    excludeIds: Set<string>,
    emitRoleWarning: boolean,
    ignoreContract = false,
    includeUnavailable = false
  ): EmployeeForScheduling[] => {
    const shift = shiftCfg.id as ShiftKey;
    const shiftRole = shiftCfg.role?.trim() || undefined;

    const eligible = (emp: EmployeeForScheduling, ignoreRole = false) => {
      if (excludeIds.has(emp.id)) return false;
      if (!ignoreContract && emp.contractShifts != null && shiftCounts[emp.id] >= emp.contractShifts) return false;
      const empShifts = dayEmpShiftIdx[day][emp.id];
      if (empShifts && [...empShifts].some(aSi => !hasEnoughRest(si, aSi, shifts, minRestMins))) return false;
      if (!ignoreRole && shiftRole && !emp.roles.includes(shiftRole)) return false;
      return true;
    };

    const bucket = (ignoreRole = false) => {
      const avail: EmployeeForScheduling[] = [];
      const pref: EmployeeForScheduling[] = [];
      const unavail: EmployeeForScheduling[] = [];
      for (const emp of pool) {
        if (!eligible(emp, ignoreRole)) continue;
        const val: AvailabilityOption = emp.constraints?.[day as Day]?.[shift] ?? "available";
        if (val === "available") avail.push(emp);
        else if (val === "prefer_not") pref.push(emp);
        else if (includeUnavailable) unavail.push(emp);
      }
      return [...avail, ...pref, ...unavail];
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

    const shuffleTied = (arr: EmployeeForScheduling[]) => {
      let i = 0;
      while (i < arr.length) {
        let j = i + 1;
        while (j < arr.length && shiftCounts[arr[j].id] === shiftCounts[arr[i].id]) j++;
        for (let k = j - 1; k > i; k--) {
          const r = i + Math.floor(Math.random() * (k - i + 1));
          [arr[k], arr[r]] = [arr[r], arr[k]];
        }
        i = j;
      }
      return arr;
    };

    return [...shuffleTied(underContract), ...shuffleTied(belowCap), ...shuffleTied(aboveCap)];
  };

  const assign = (emp: EmployeeForScheduling, day: string, si: number, shift: ShiftKey) => {
    schedule[day as Day][shift].employeeIds.push(emp.id);
    shiftCounts[emp.id] += 1;
    (dayEmpShiftIdx[day][emp.id] ??= new Set()).add(si);
  };

  // ── Build flat list of all (day, shift) pairs ──────────────────────────────
  const allPairs: Array<{ day: string; si: number; shiftCfg: ShiftConfig }> = [];
  for (const day of DAYS) {
    for (const [si, shiftCfg] of shifts.entries()) {
      allPairs.push({ day, si, shiftCfg });
    }
  }

  // ── Global pass 1: coverage — guarantee at least 1 employee per shift ──────
  // Shuffle pairs so no day is systematically favored when draining the pool.
  // Three-level fallback ensures coverage even in edge cases:
  //   level 1 — respect contracts, skip unavailable
  //   level 2 — ignore contracts, skip unavailable
  //   level 3 — ignore contracts, include unavailable (last resort)
  for (const { day, si, shiftCfg } of shuffle(allPairs)) {
    const shift = shiftCfg.id as ShiftKey;
    if (schedule[day as Day][shift].employeeIds.length >= 1) continue;

    const excludeIds = new Set(schedule[day as Day][shift].employeeIds);
    let ranked = getRanked(day, si, shiftCfg, excludeIds, true,  false, false);
    if (ranked.length === 0) ranked = getRanked(day, si, shiftCfg, excludeIds, false, true,  false);
    if (ranked.length === 0) ranked = getRanked(day, si, shiftCfg, excludeIds, false, true,  true);
    if (ranked.length > 0) assign(ranked[0], day, si, shift);
  }

  // ── Global pass 2: fill — top-up each shift to minWorkers ─────────────────
  // Round-robin: add ONE employee per slot per round so no slot can drain the
  // pool before other slots have had a chance to receive their second employee.
  let progress = true;
  while (progress) {
    progress = false;
    for (const { day, si, shiftCfg } of shuffle(allPairs)) {
      const shift = shiftCfg.id as ShiftKey;
      const minWorkers = shiftCfg.minWorkers ?? 2;
      if (schedule[day as Day][shift].employeeIds.length >= minWorkers) continue;

      const excludeIds = new Set(schedule[day as Day][shift].employeeIds);
      // Try respecting contracts first; fall back to ignoring them (same as pass 1)
      let ranked = getRanked(day, si, shiftCfg, excludeIds, false, false, false);
      if (ranked.length === 0) ranked = getRanked(day, si, shiftCfg, excludeIds, false, true, false);
      if (ranked.length > 0) {
        assign(ranked[0], day, si, shift);
        progress = true;
      }
    }
  }

  // ── Finalise understaffed flags + warnings ─────────────────────────────────
  for (const day of DAYS) {
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
