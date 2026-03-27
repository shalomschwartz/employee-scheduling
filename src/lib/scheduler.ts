import { DAYS, DEFAULT_SHIFTS, DAY_LABELS_HE, type Day, type ShiftKey, type AvailabilityOption, type ShiftConfig } from "@/lib/utils";

export interface EmployeeForScheduling {
  id: string;
  name: string | null;
  email: string;
  isShiftLead: boolean;
  constraints: Record<Day, Record<ShiftKey, AvailabilityOption>> | null;
  roles: string[];               // which shift roles this employee can work
  contractShifts: number | null; // target shifts/week (null = no contract)
  minRestHours: number | null;   // minimum hours between shifts (null = default 7)
}

export interface ShiftSlot {
  employeeIds: string[];
  understaffed: boolean;
  noShiftLead: boolean;
}

export type ScheduleData = Record<Day, Record<ShiftKey, ShiftSlot>>;

// Time-gap helpers for rest-between-shifts enforcement
const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
function gapMins(fromTime: string, toTime: string): number {
  const from = toMins(fromTime); const to = toMins(toTime);
  return to >= from ? to - from : 1440 - from + to;
}
function hasEnoughRest(si: number, assignedSi: number, shifts: ShiftConfig[], minRestMins: number): boolean {
  const a = shifts[si]; const b = shifts[assignedSi];
  return Math.min(gapMins(a.end, b.start), gapMins(b.end, a.start)) >= minRestMins;
}

// Fisher-Yates shuffle — breaks tie-breaking bias between runs
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
  shifts: ShiftConfig[] = DEFAULT_SHIFTS
): { schedule: ScheduleData; warnings: string[] } {
  // Shuffle once so ties are broken randomly, not by DB order
  const pool = shuffle(employees);

  // Track number of shifts assigned (not hours) for even distribution
  const shiftCounts: Record<string, number> = {};
  for (const emp of pool) shiftCounts[emp.id] = 0;

  const schedule = {} as ScheduleData;
  const warnings: string[] = [];

  for (const day of DAYS) {
    schedule[day] = {} as Record<ShiftKey, ShiftSlot>;
    // Track which shift indices each employee is assigned to this day (for adjacent-shift prevention)
    const dayEmpShiftIdx: Record<string, Set<number>> = {};

    for (const [si, shiftCfg] of shifts.entries()) {
      const shift = shiftCfg.id as ShiftKey;
      const pinnedIds = pinnedSlots[day]?.[shift] ?? [];

      // Always include pinned employees first (manager overrides)
      const pinned = pinnedIds
        .map(id => pool.find(e => e.id === id))
        .filter(Boolean) as EmployeeForScheduling[];
      const assigned: EmployeeForScheduling[] = [...pinned];
      for (const emp of pinned) {
        shiftCounts[emp.id] += 1;
        (dayEmpShiftIdx[emp.id] ??= new Set()).add(si);
      }

      // Role filter: if shift has a role, only employees with that role are eligible
      const shiftRole = shiftCfg.role?.trim();
      const roleEligible = (emp: EmployeeForScheduling) =>
        !shiftRole || emp.roles.includes(shiftRole);

      const available: EmployeeForScheduling[] = [];
      const preferNot: EmployeeForScheduling[] = [];

      for (const emp of pool) {
        if (pinnedIds.includes(emp.id)) continue;
        // Hard cap: skip if employee has reached their contract shift limit
        if (emp.contractShifts != null && shiftCounts[emp.id] >= emp.contractShifts) continue;
        // Rest check: skip if insufficient rest between this and any already-assigned shift today
        const restMins = (emp.minRestHours ?? 7) * 60;
        const empShifts = dayEmpShiftIdx[emp.id];
        if (empShifts && [...empShifts].some(assignedSi => !hasEnoughRest(si, assignedSi, shifts, restMins))) continue;
        // Role check
        if (!roleEligible(emp)) continue;
        const val: AvailabilityOption = emp.constraints?.[day]?.[shift] ?? "available";
        if (val === "available") available.push(emp);
        else if (val === "prefer_not") preferNot.push(emp);
      }

      // If role filter left nobody, fall back to all available employees and warn
      const usedAvailable = available;
      const usedPreferNot = preferNot;
      if (shiftRole && usedAvailable.length === 0 && usedPreferNot.length === 0 && assigned.length === 0) {
        warnings.push(`${DAY_LABELS_HE[day as Day]} ${shiftCfg.label}: אין עובדים עם תפקיד "${shiftRole}"`);
        // fallback: use all employees regardless of role
        for (const emp of pool) {
          if (pinnedIds.includes(emp.id)) continue;
          if (emp.contractShifts != null && shiftCounts[emp.id] >= emp.contractShifts) continue;
          const restMins = (emp.minRestHours ?? 7) * 60;
          const empShifts = dayEmpShiftIdx[emp.id];
          if (empShifts && [...empShifts].some(assignedSi => !hasEnoughRest(si, assignedSi, shifts, restMins))) continue;
          const val: AvailabilityOption = emp.constraints?.[day]?.[shift] ?? "available";
          if (val === "available") usedAvailable.push(emp);
          else if (val === "prefer_not") usedPreferNot.push(emp);
        }
      }

      // Compute current average shift count
      const totalShifts = Object.values(shiftCounts).reduce((s, c) => s + c, 0);
      const avgShifts = pool.length > 0 ? totalShifts / pool.length : 0;
      const softCap = avgShifts + 1; // allow 1 above average before deprioritising

      // Priority buckets (within each bucket, sort by fewest shifts first):
      // 1. Under contract → highest priority
      // 2. Below/at soft cap → normal
      // 3. Above soft cap → deprioritized
      const byShiftCount = (a: EmployeeForScheduling, b: EmployeeForScheduling) =>
        shiftCounts[a.id] - shiftCounts[b.id];

      const candidates = [...usedAvailable, ...usedPreferNot];

      const underContract = candidates.filter(e =>
        e.contractShifts != null && e.contractShifts > 0 && shiftCounts[e.id] < e.contractShifts
      );
      const belowCap = candidates.filter(e =>
        !(e.contractShifts != null && e.contractShifts > 0 && shiftCounts[e.id] < e.contractShifts) &&
        shiftCounts[e.id] <= softCap
      );
      const aboveCap = candidates.filter(e =>
        !(e.contractShifts != null && e.contractShifts > 0 && shiftCounts[e.id] < e.contractShifts) &&
        shiftCounts[e.id] > softCap
      );

      underContract.sort(byShiftCount);
      belowCap.sort(byShiftCount);
      aboveCap.sort(byShiftCount);

      const minWorkers = shiftCfg.minWorkers ?? 2;
      for (const emp of [...underContract, ...belowCap, ...aboveCap]) {
        if (assigned.length >= minWorkers) break;
        assigned.push(emp);
        shiftCounts[emp.id] += 1;
        (dayEmpShiftIdx[emp.id] ??= new Set()).add(si);
      }

      const understaffed = assigned.length < minWorkers;

      if (assigned.length === 0) {
        warnings.push(`${DAY_LABELS_HE[day as Day]} ${shiftCfg.label}: אין עובדים זמינים`);
      } else if (understaffed) {
        warnings.push(`${DAY_LABELS_HE[day as Day]} ${shiftCfg.label}: רק ${assigned.length}/${minWorkers} עובדים שובצו`);
      }

      schedule[day][shift] = {
        employeeIds: assigned.map((e) => e.id),
        understaffed,
        noShiftLead: false,
      };
    }
  }

  return { schedule, warnings };
}
