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

function shuffleTied(arr: EmployeeForScheduling[], shiftCounts: Record<string, number>): EmployeeForScheduling[] {
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

  // dayEmpShiftIdx[day][empId] = Set of shift indices assigned that day (for rest checks)
  const dayEmpShiftIdx: Record<string, Record<string, Set<number>>> = {};

  // ── Seed pinned slots ──────────────────────────────────────────────────────
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

  // ── Build flat list of all (day, shift) pairs ──────────────────────────────
  const allPairs: Array<{ day: string; si: number; shiftCfg: ShiftConfig }> = [];
  for (const day of DAYS) {
    for (const [si, shiftCfg] of shifts.entries()) {
      allPairs.push({ day, si, shiftCfg });
    }
  }

  const maxPos = Math.max(...shifts.map(s => s.minWorkers ?? 2));

  // ── findCandidates ─────────────────────────────────────────────────────────
  // Returns ranked candidates for a slot. Options control fallback levels.
  const findCandidates = (
    day: string,
    si: number,
    shiftCfg: ShiftConfig,
    excludeIds: Set<string>,
    opts: { ignoreContract: boolean; ignoreRole: boolean; includeUnavailable: boolean }
  ): EmployeeForScheduling[] => {
    const shift = shiftCfg.id as ShiftKey;
    const shiftRole = shiftCfg.role?.trim() || undefined;

    const candidates: EmployeeForScheduling[] = [];
    for (const emp of pool) {
      if (excludeIds.has(emp.id)) continue;
      if (!opts.ignoreContract && emp.contractShifts != null && shiftCounts[emp.id] >= emp.contractShifts) continue;
      const empShifts = dayEmpShiftIdx[day][emp.id];
      if (empShifts && [...empShifts].some(aSi => !hasEnoughRest(si, aSi, shifts, minRestMins))) continue;
      if (!opts.ignoreRole && shiftRole && !emp.roles.includes(shiftRole)) continue;

      const val: AvailabilityOption = emp.constraints?.[day as Day]?.[shift] ?? "available";
      if (val === "unavailable" && !opts.includeUnavailable) continue;

      candidates.push(emp);
    }

    // Sort: employees below their contract target first, then everyone else.
    // Within each group, sort by fewest shifts assigned (ascending).
    // Ties within same shiftCount are randomly shuffled.
    const underContract = candidates.filter(e =>
      e.contractShifts != null && e.contractShifts > 0 && shiftCounts[e.id] < e.contractShifts
    );
    const rest = candidates.filter(e =>
      !(e.contractShifts != null && e.contractShifts > 0 && shiftCounts[e.id] < e.contractShifts)
    );

    // Within each group, sort by availability preference first (available > prefer_not > unavailable),
    // then by fewest shifts (ascending). Shuffle tied groups for randomness.
    const AVAIL_ORDER: Record<AvailabilityOption, number> = { available: 0, prefer_not: 1, unavailable: 2 };
    const sortGroup = (arr: EmployeeForScheduling[]) => {
      arr.sort((a, b) => {
        const av = a.constraints?.[day as Day]?.[shift] ?? "available";
        const bv = b.constraints?.[day as Day]?.[shift] ?? "available";
        const availDiff = AVAIL_ORDER[av] - AVAIL_ORDER[bv];
        if (availDiff !== 0) return availDiff;
        return shiftCounts[a.id] - shiftCounts[b.id];
      });
      return shuffleTied(arr, shiftCounts);
    };

    return [...sortGroup(underContract), ...sortGroup(rest)];
  };

  const assign = (emp: EmployeeForScheduling, day: string, si: number, shift: ShiftKey) => {
    schedule[day as Day][shift].employeeIds.push(emp.id);
    shiftCounts[emp.id] += 1;
    (dayEmpShiftIdx[day][emp.id] ??= new Set()).add(si);
  };

  // ── Position-by-position fill ──────────────────────────────────────────────
  // Fill position 0 for all slots before filling position 1, etc.
  // This guarantees every slot gets its 1st employee before any slot gets its 2nd,
  // preventing early days from monopolising the pool.
  for (let pos = 0; pos < maxPos; pos++) {
    for (const { day, si, shiftCfg } of shuffle(allPairs)) {
      const shift = shiftCfg.id as ShiftKey;
      const minWorkers = shiftCfg.minWorkers ?? 2;
      const currentCount = schedule[day as Day][shift].employeeIds.length;
      if (currentCount >= minWorkers) continue; // already fully staffed — never over-fill
      if (currentCount > pos) continue;          // already ahead of this position

      const excludeIds = new Set(schedule[day as Day][shift].employeeIds);
      const emitWarning = pos === 0; // only warn on first position to avoid duplicates

      // 4-level fallback
      let ranked = findCandidates(day, si, shiftCfg, excludeIds, { ignoreContract: false, ignoreRole: false, includeUnavailable: false });

      if (ranked.length === 0) {
        // Role fallback
        const shiftRole = shiftCfg.role?.trim() || undefined;
        if (shiftRole && emitWarning) {
          warnings.push(`${DAY_LABELS_HE[day as Day]} ${shiftCfg.label}: אין עובדים עם תפקיד "${shiftRole}"`);
        }
        ranked = findCandidates(day, si, shiftCfg, excludeIds, { ignoreContract: false, ignoreRole: true, includeUnavailable: false });
      }

      if (ranked.length === 0) {
        // Contract fallback
        ranked = findCandidates(day, si, shiftCfg, excludeIds, { ignoreContract: true, ignoreRole: true, includeUnavailable: false });
      }

      if (ranked.length === 0) {
        // Last resort: include unavailable employees
        ranked = findCandidates(day, si, shiftCfg, excludeIds, { ignoreContract: true, ignoreRole: true, includeUnavailable: true });
      }

      if (ranked.length > 0) assign(ranked[0], day, si, shift);
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
