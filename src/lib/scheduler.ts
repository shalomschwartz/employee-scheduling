import { DAYS, DEFAULT_SHIFTS, DAY_LABELS_HE, toMins, type Day, type ShiftKey, type AvailabilityOption, type ShiftConfig } from "@/lib/utils";

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

interface Interval { start: number; end: number }

// Absolute [start, end) in minutes within the week (day 0 = Sunday) for a shift
// on a given day. Overnight shifts (end <= start, e.g. 23:00–07:00) wrap past
// midnight into the next day, so rest can be checked across day boundaries.
function shiftInterval(dayIdx: number, cfg: ShiftConfig): Interval {
  const start = dayIdx * 1440 + toMins(cfg.start);
  let dur = toMins(cfg.end) - toMins(cfg.start);
  if (dur <= 0) dur += 1440;
  return { start, end: start + dur };
}

// Two shifts can coexist for one employee only if they do not overlap and are at
// least minRestMins apart on the absolute weekly timeline (this is what makes
// overnight EVENING -> next-day MORNING correctly count as 0 minutes of rest).
function restOk(a: Interval, b: Interval, minRestMins: number): boolean {
  if (a.start < b.end && b.start < a.end) return false; // overlap
  const gap = a.start >= b.end ? a.start - b.end : b.start - a.end;
  return gap >= minRestMins;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Shuffle only contiguous runs that share the same tie key, so randomness never
// reorders candidates across a meaningful ranking boundary.
function shuffleTied<T>(arr: T[], keyOf: (item: T) => string): T[] {
  let i = 0;
  while (i < arr.length) {
    let j = i + 1;
    while (j < arr.length && keyOf(arr[j]) === keyOf(arr[i])) j++;
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

  // empIntervals[empId] = absolute weekly time intervals already assigned to that
  // employee, used for overlap + minimum-rest checks across the whole week
  // (including overnight rollovers between days).
  const empIntervals: Record<string, Interval[]> = {};

  // ── Seed pinned slots ──────────────────────────────────────────────────────
  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    const day = DAYS[dayIdx];
    schedule[day] = {} as Record<ShiftKey, ShiftSlot>;

    for (const shiftCfg of shifts) {
      const shift = shiftCfg.id as ShiftKey;
      const pinnedIds = pinnedSlots[day]?.[shift] ?? [];
      const pinned = pinnedIds
        .map(id => pool.find(e => e.id === id))
        .filter(Boolean) as EmployeeForScheduling[];
      for (const emp of pinned) {
        shiftCounts[emp.id] += 1;
        (empIntervals[emp.id] ??= []).push(shiftInterval(dayIdx, shiftCfg));
      }
      schedule[day][shift] = { employeeIds: pinned.map(e => e.id), understaffed: true };
    }
  }

  // ── Build flat list of all (day, shift) pairs ──────────────────────────────
  const allPairs: Array<{ day: Day; dayIdx: number; shiftCfg: ShiftConfig }> = [];
  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    const day = DAYS[dayIdx];
    for (const shiftCfg of shifts) {
      allPairs.push({ day, dayIdx, shiftCfg });
    }
  }

  const maxPos = Math.max(...shifts.map(s => s.minWorkers ?? 2));

  // ── findCandidates ─────────────────────────────────────────────────────────
  // Returns ranked candidates for a slot. Options control fallback levels.
  const findCandidates = (
    day: Day,
    dayIdx: number,
    shiftCfg: ShiftConfig,
    excludeIds: Set<string>,
    opts: { ignoreContract: boolean; ignoreRole: boolean; includeUnavailable: boolean }
  ): EmployeeForScheduling[] => {
    const shift = shiftCfg.id as ShiftKey;
    const shiftRole = shiftCfg.role?.trim() || undefined;
    const cand = shiftInterval(dayIdx, shiftCfg);

    const candidates: EmployeeForScheduling[] = [];
    for (const emp of pool) {
      if (excludeIds.has(emp.id)) continue;
      if (!opts.ignoreContract && emp.contractShifts != null && shiftCounts[emp.id] >= emp.contractShifts) continue;
      const existing = empIntervals[emp.id];
      if (existing && existing.some(iv => !restOk(cand, iv, minRestMins))) continue;
      if (!opts.ignoreRole && shiftRole && !emp.roles.includes(shiftRole)) continue;

      const val: AvailabilityOption = emp.constraints?.[day]?.[shift] ?? "available";
      if (val === "unavailable" && !opts.includeUnavailable) continue;

      candidates.push(emp);
    }

    // Rank: prefer available > prefer_not, then fewest shifts assigned.
    const AVAIL_ORDER: Record<AvailabilityOption, number> = { available: 0, prefer_not: 1, unavailable: 2 };
    const availRank = (e: EmployeeForScheduling) => AVAIL_ORDER[e.constraints?.[day]?.[shift] ?? "available"];

    // Employees below their contract target are placed first.
    const underContract = candidates.filter(e =>
      e.contractShifts != null && e.contractShifts > 0 && shiftCounts[e.id] < e.contractShifts
    );
    const rest = candidates.filter(e =>
      !(e.contractShifts != null && e.contractShifts > 0 && shiftCounts[e.id] < e.contractShifts)
    );

    const sortGroup = (arr: EmployeeForScheduling[]) => {
      arr.sort((a, b) => {
        const availDiff = availRank(a) - availRank(b);
        if (availDiff !== 0) return availDiff;
        return shiftCounts[a.id] - shiftCounts[b.id];
      });
      // Only shuffle runs equal in BOTH availability rank AND shift count, so a
      // less-available employee is never randomly promoted over a more-available one.
      return shuffleTied(arr, e => `${availRank(e)}:${shiftCounts[e.id]}`);
    };

    return [...sortGroup(underContract), ...sortGroup(rest)];
  };

  const assign = (emp: EmployeeForScheduling, day: Day, dayIdx: number, shiftCfg: ShiftConfig) => {
    const shift = shiftCfg.id as ShiftKey;
    schedule[day][shift].employeeIds.push(emp.id);
    shiftCounts[emp.id] += 1;
    (empIntervals[emp.id] ??= []).push(shiftInterval(dayIdx, shiftCfg));
  };

  // ── Position-by-position fill ──────────────────────────────────────────────
  // Fill position 0 for all slots before filling position 1, etc., so every slot
  // gets its 1st employee before any slot gets its 2nd.
  for (let pos = 0; pos < maxPos; pos++) {
    for (const { day, dayIdx, shiftCfg } of shuffle(allPairs)) {
      const shift = shiftCfg.id as ShiftKey;
      const minWorkers = shiftCfg.minWorkers ?? 2;
      const currentCount = schedule[day][shift].employeeIds.length;
      if (currentCount >= minWorkers) continue; // already fully staffed — never over-fill
      if (currentCount > pos) continue;          // already ahead of this position

      const excludeIds = new Set(schedule[day][shift].employeeIds);
      const emitWarning = pos === 0; // only warn on first position to avoid duplicates

      const shiftRole = shiftCfg.role?.trim() || undefined;

      // Try role-qualified candidates (within contract) first.
      let ranked = findCandidates(day, dayIdx, shiftCfg, excludeIds, { ignoreContract: false, ignoreRole: false, includeUnavailable: false });

      if (ranked.length === 0 && shiftRole) {
        // Only fall back to ignoring role if NO employee in the org has this role at all.
        const anyoneWithRole = pool.some(e => e.roles.includes(shiftRole));
        if (!anyoneWithRole) {
          if (emitWarning) {
            warnings.push(`${DAY_LABELS_HE[day]} ${shiftCfg.label}: אין עובדים עם תפקיד "${shiftRole}"`);
          }
          ranked = findCandidates(day, dayIdx, shiftCfg, excludeIds, { ignoreContract: false, ignoreRole: true, includeUnavailable: false });
        }
      }

      if (ranked.length > 0) assign(ranked[0], day, dayIdx, shiftCfg);
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
        warnings.push(`${DAY_LABELS_HE[day]} ${shiftCfg.label}: אין עובדים זמינים`);
      } else if (understaffed) {
        warnings.push(`${DAY_LABELS_HE[day]} ${shiftCfg.label}: רק ${ids.length}/${minWorkers} עובדים שובצו`);
      }
    }
  }

  return { schedule, warnings };
}
