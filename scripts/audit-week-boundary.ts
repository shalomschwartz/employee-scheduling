/* eslint-disable @typescript-eslint/no-explicit-any */
// Audit: cross-week rest — Saturday overnight shift vs next week's Sunday morning.
import { runScheduler, type EmployeeForScheduling } from "../src/lib/scheduler";
import { DAYS, type ShiftConfig } from "../src/lib/utils";

const shifts: ShiftConfig[] = [
  { id: "MORNING", label: "בוקר", start: "07:00", end: "15:00", minWorkers: 1 },
  { id: "NIGHT", label: "לילה", start: "23:00", end: "07:00", minWorkers: 1 },
];

// One employee, only available for Saturday NIGHT and Sunday MORNING.
const constraints: any = {};
for (const d of DAYS) {
  constraints[d] = { MORNING: "unavailable", NIGHT: "unavailable" };
}
constraints.saturday.NIGHT = "available";
constraints.sunday.MORNING = "available";

const emp: EmployeeForScheduling = {
  id: "x", name: "x", email: "x@x.com", isShiftLead: false,
  constraints, roles: [], contractShifts: null,
};

// Week 1 generation
const w1 = runScheduler([emp], {}, shifts, 7, {});
const satNight = (w1.schedule as any).saturday.NIGHT.employeeIds.includes("x");

// Week 2 generation (independent run — this is exactly what /api/schedule/generate does)
const w2 = runScheduler([emp], {}, shifts, 7, {});
const sunMorning = (w2.schedule as any).sunday.MORNING.employeeIds.includes("x");

console.log(`week1: x works Saturday NIGHT 23:00-07:00 -> ${satNight}`);
console.log(`week2: x works Sunday MORNING 07:00-15:00 -> ${sunMorning}`);
if (satNight && sunMorning) {
  console.log("CROSS-WEEK: Sat night ends Sunday 07:00; next week's Sunday morning starts 07:00 -> rest gap = 0 minutes (minRest=7h). Never checked: runScheduler has no knowledge of the previous week's schedule.");
}
console.log(`week1 warnings: ${w1.warnings.length}, week2 warnings: ${w2.warnings.length}`);
