import { DAYS, SHIFTS, DAY_LABELS_HE, type Day, type ShiftKey, type AvailabilityOption } from "@/lib/utils";

export interface EmployeeForScheduling {
  id: string;
  name: string | null;
  email: string;
  isShiftLead: boolean;
  constraints: Record<Day, Record<ShiftKey, AvailabilityOption>> | null;
}

export interface ShiftSlot {
  employeeIds: string[];
  understaffed: boolean;
  noShiftLead: boolean;
}

export type ScheduleData = Record<Day, Record<ShiftKey, ShiftSlot>>;

function shiftHours(shift: ShiftKey): number {
  const { start, end } = SHIFTS[shift];
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  return (endMins > startMins ? endMins - startMins : 1440 - startMins + endMins) / 60;
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
  minPerShift = 2,
  pinnedSlots: Record<string, Record<string, string[]>> = {}
): { schedule: ScheduleData; warnings: string[] } {
  // Shuffle once so ties are broken randomly, not by DB order
  const pool = shuffle(employees);

  const hourCounts: Record<string, number> = {};
  for (const emp of pool) hourCounts[emp.id] = 0;

  const schedule = {} as ScheduleData;
  const warnings: string[] = [];

  for (const day of DAYS) {
    schedule[day] = {} as Record<ShiftKey, ShiftSlot>;

    for (const shift of Object.keys(SHIFTS) as ShiftKey[]) {
      const hours = shiftHours(shift);
      const pinnedIds = pinnedSlots[day]?.[shift] ?? [];

      // Always include pinned employees first (manager overrides)
      const pinned = pinnedIds
        .map(id => pool.find(e => e.id === id))
        .filter(Boolean) as EmployeeForScheduling[];
      const assigned: EmployeeForScheduling[] = [...pinned];
      for (const emp of pinned) hourCounts[emp.id] += hours;

      const available: EmployeeForScheduling[] = [];
      const preferNot: EmployeeForScheduling[] = [];

      for (const emp of pool) {
        if (pinnedIds.includes(emp.id)) continue;
        const val: AvailabilityOption = emp.constraints?.[day]?.[shift] ?? "available";
        if (val === "available") available.push(emp);
        else if (val === "prefer_not") preferNot.push(emp);
      }

      // Sort by hours ascending — employee with least hours gets priority
      const byHours = (a: EmployeeForScheduling, b: EmployeeForScheduling) =>
        hourCounts[a.id] - hourCounts[b.id];
      available.sort(byHours);
      preferNot.sort(byHours);

      for (const emp of [...available, ...preferNot]) {
        if (assigned.length >= minPerShift) break;
        assigned.push(emp);
        hourCounts[emp.id] += hours;
      }

      const understaffed = assigned.length < minPerShift;

      if (assigned.length === 0) {
        warnings.push(`${DAY_LABELS_HE[day as Day]} ${SHIFTS[shift].label}: אין עובדים זמינים`);
      } else if (understaffed) {
        warnings.push(`${DAY_LABELS_HE[day as Day]} ${SHIFTS[shift].label}: רק ${assigned.length}/${minPerShift} עובדים שובצו`);
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
