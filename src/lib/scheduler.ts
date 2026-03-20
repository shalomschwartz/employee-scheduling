import { DAYS, SHIFTS, type Day, type ShiftKey, type AvailabilityOption } from "@/lib/utils";

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

export function runScheduler(
  employees: EmployeeForScheduling[],
  minPerShift = 2
): { schedule: ScheduleData; warnings: string[] } {
  const shiftCounts: Record<string, number> = {};
  for (const emp of employees) shiftCounts[emp.id] = 0;

  const schedule = {} as ScheduleData;
  const warnings: string[] = [];

  for (const day of DAYS) {
    schedule[day] = {} as Record<ShiftKey, ShiftSlot>;

    for (const shift of Object.keys(SHIFTS) as ShiftKey[]) {
      const available: EmployeeForScheduling[] = [];
      const preferNot: EmployeeForScheduling[] = [];

      for (const emp of employees) {
        const val: AvailabilityOption = emp.constraints?.[day]?.[shift] ?? "available";
        if (val === "available") available.push(emp);
        else if (val === "prefer_not") preferNot.push(emp);
      }

      const byCount = (a: EmployeeForScheduling, b: EmployeeForScheduling) =>
        shiftCounts[a.id] - shiftCounts[b.id];
      available.sort(byCount);
      preferNot.sort(byCount);

      const pool = [...available, ...preferNot];
      const assigned: EmployeeForScheduling[] = [];

      // Fill slots, balanced by shift count
      for (const emp of pool) {
        if (assigned.length >= minPerShift) break;
        assigned.push(emp);
        shiftCounts[emp.id]++;
      }

      const understaffed = assigned.length < minPerShift;

      if (assigned.length === 0) {
        warnings.push(`${day} ${SHIFTS[shift].label}: אין עובדים זמינים`);
      } else if (understaffed) {
        warnings.push(`${day} ${SHIFTS[shift].label}: רק ${assigned.length}/${minPerShift} עובדים שובצו`);
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
