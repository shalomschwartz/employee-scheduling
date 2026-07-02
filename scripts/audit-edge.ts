/* eslint-disable @typescript-eslint/no-explicit-any */
// Audit: shifts-config edge cases + regeneration determinism/fairness.
import { runScheduler, type EmployeeForScheduling } from "../src/lib/scheduler";
import { DAYS, type ShiftConfig } from "../src/lib/utils";

const emp = (id: string, o: any = {}): EmployeeForScheduling => ({
  id, name: id, email: id + "@x.com", isShiftLead: !!o.lead,
  constraints: o.constraints ?? null, roles: o.roles ?? [], contractShifts: o.contract ?? null,
});

// 1) Duplicate shift ids (PUT /api/shifts does zero validation of ids)
{
  const shifts: ShiftConfig[] = [
    { id: "MORNING", label: "בוקר", start: "07:00", end: "15:00", minWorkers: 1 },
    { id: "MORNING", label: "בוקר-כפול", start: "15:00", end: "23:00", minWorkers: 1 },
  ];
  const emps = [emp("a"), emp("b"), emp("c"), emp("d")];
  const { schedule, warnings } = runScheduler(emps, {}, shifts, 7, {});
  const sundayKeys = Object.keys((schedule as any).sunday);
  const totalOut = DAYS.reduce((n, d) => n + Object.values((schedule as any)[d]).reduce((m: number, s: any) => m + s.employeeIds.length, 0), 0);
  console.log(`1) duplicate ids: 2 shifts configured, output slots per day = ${sundayKeys.length} (${JSON.stringify(sundayKeys)}); total output assignments for week = ${totalOut} (internally 2 slots/day were staffed = 14 expected); warnings=${warnings.length}`);
}

// 2) Zero-length shift (start === end) — silently becomes 24h
{
  const shifts: ShiftConfig[] = [
    { id: "Z", label: "אפס", start: "09:00", end: "09:00", minWorkers: 1 },
    { id: "EVE", label: "ערב", start: "18:00", end: "22:00", minWorkers: 1 },
  ];
  const emps = [emp("a")];
  const { schedule } = runScheduler(emps, {}, shifts, 7, {});
  const perDay = DAYS.map(d => Object.values((schedule as any)[d]).filter((s: any) => s.employeeIds.includes("a")).length);
  console.log(`2) zero-length shift: solo employee per-day slot counts = ${JSON.stringify(perDay)} — Z treated as 24h so it blocks EVE the same day AND the next morning`);
}

// 3) minWorkers: 0 — spurious "no employees available" warning?
{
  const shifts: ShiftConfig[] = [
    { id: "OPT", label: "אופציונלי", start: "07:00", end: "12:00", minWorkers: 0 },
  ];
  const { schedule, warnings } = runScheduler([emp("a")], {}, shifts, 7, {});
  console.log(`3) minWorkers 0: assigned=${(schedule as any).sunday.OPT.employeeIds.length}, understaffed=${(schedule as any).sunday.OPT.understaffed}, warnings=${JSON.stringify(warnings.slice(0, 2))} (total ${warnings.length})`);
}

// 4) Garbage time string — NaN intervals
{
  const shifts: ShiftConfig[] = [
    { id: "BAD", label: "רע", start: "", end: "15:00", minWorkers: 1 },
    { id: "OK1", label: "בוקר", start: "07:00", end: "12:00", minWorkers: 1 },
    { id: "OK2", label: "ערב", start: "17:00", end: "22:00", minWorkers: 1 },
  ];
  const emps = [emp("a")];
  const { schedule } = runScheduler(emps, {}, shifts, 7, {});
  const total = DAYS.reduce((n, d) => n + Object.values((schedule as any)[d]).filter((s: any) => s.employeeIds.includes("a")).length, 0);
  console.log(`4) NaN time ("" start): solo employee got ${total} total assignments across 21 slots (NaN interval poisons restOk for every pair)`);
}

// 5) Determinism / regeneration churn / fairness over 100 runs
{
  const shifts: ShiftConfig[] = [
    { id: "MORNING", label: "בוקר", start: "07:00", end: "15:00", minWorkers: 2 },
    { id: "AFTERNOON", label: "צהריים", start: "15:00", end: "23:00", minWorkers: 2 },
    { id: "NIGHT", label: "לילה", start: "23:00", end: "07:00", minWorkers: 1 },
  ];
  const emps = [emp("a"), emp("b"), emp("c"), emp("d"), emp("e"), emp("f"), emp("g"), emp("h")];
  const nightCounts: Record<string, number> = {};
  const totalCounts: Record<string, number> = {};
  let prevKey = "";
  let identicalToPrev = 0;
  const RUNS = 100;
  for (let r = 0; r < RUNS; r++) {
    const { schedule } = runScheduler(emps, {}, shifts, 7, {});
    const key = JSON.stringify(schedule);
    if (r > 0 && key === prevKey) identicalToPrev++;
    prevKey = key;
    for (const d of DAYS) {
      for (const id of (schedule as any)[d].NIGHT.employeeIds) nightCounts[id] = (nightCounts[id] ?? 0) + 1;
      for (const sk of Object.keys((schedule as any)[d])) for (const id of (schedule as any)[d][sk].employeeIds) totalCounts[id] = (totalCounts[id] ?? 0) + 1;
    }
  }
  console.log(`5) regeneration: identical consecutive schedules ${identicalToPrev}/${RUNS - 1}`);
  console.log(`   night shifts per employee over ${RUNS} runs: ${JSON.stringify(nightCounts)}`);
  console.log(`   total shifts per employee over ${RUNS} runs: ${JSON.stringify(totalCounts)}`);
}
