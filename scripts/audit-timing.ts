/* eslint-disable @typescript-eslint/no-explicit-any */
// Audit: measure runScheduler wall time at realistic and worst-case org sizes.
import { runScheduler, type EmployeeForScheduling } from "../src/lib/scheduler";
import { DAYS, type ShiftConfig } from "../src/lib/utils";

function mkShifts(n: number, minWorkers: number): ShiftConfig[] {
  // n non-overlapping-ish shifts across the day
  const defs = [
    { id: "S1", start: "06:00", end: "11:00" },
    { id: "S2", start: "11:00", end: "16:00" },
    { id: "S3", start: "16:00", end: "21:00" },
    { id: "S4", start: "21:00", end: "02:00" },
    { id: "S5", start: "02:00", end: "06:00" },
  ];
  return defs.slice(0, n).map(d => ({ ...d, label: d.id, minWorkers }));
}

function mkEmployees(n: number, shifts: ShiftConfig[], seedPreferNot: number, contractEvery: number): EmployeeForScheduling[] {
  const out: EmployeeForScheduling[] = [];
  let rngState = 12345;
  const rng = () => (rngState = (rngState * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let i = 0; i < n; i++) {
    const constraints: any = {};
    for (const d of DAYS) {
      constraints[d] = {};
      for (const s of shifts) {
        const r = rng();
        constraints[d][s.id] = r < 0.1 ? "unavailable" : r < 0.1 + seedPreferNot ? "prefer_not" : "available";
      }
    }
    out.push({
      id: `e${i}`, name: `e${i}`, email: `e${i}@x.com`,
      isShiftLead: i % 5 === 0,
      constraints,
      roles: i % 3 === 0 ? ["ברמן"] : [],
      contractShifts: contractEvery > 0 && i % contractEvery === 0 ? 4 + (i % 3) : null,
    });
  }
  return out;
}

function bench(label: string, emps: EmployeeForScheduling[], shifts: ShiftConfig[], opts: any, runs = 3) {
  const times: number[] = [];
  let lastWarn = 0;
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now();
    const res = runScheduler(emps, {}, shifts, 7, opts);
    times.push(performance.now() - t0);
    lastWarn = res.warnings.length;
  }
  const ms = times.map(t => Math.round(t));
  console.log(`${label}: runs=${JSON.stringify(ms)}ms  (median ${ms.sort((a, b) => a - b)[Math.floor(ms.length / 2)]}ms, warnings=${lastWarn})`);
}

// typical small cafe: 8 employees, 3 shifts x 2 workers
{
  const shifts = mkShifts(3, 2);
  bench("typical  8 emp / 3 shifts / mw2", mkEmployees(8, shifts, 0.2, 3), shifts, {});
}
// mid: 15 employees, 4 shifts x 3
{
  const shifts = mkShifts(4, 3);
  bench("mid     15 emp / 4 shifts / mw3", mkEmployees(15, shifts, 0.2, 3), shifts, { maxConsecutiveDays: 5, requireShiftLead: true });
}
// max stated: 30 employees, 5 shifts x 4 (35 slots)
{
  const shifts = mkShifts(5, 4);
  bench("max     30 emp / 5 shifts / mw4", mkEmployees(30, shifts, 0.2, 3), shifts, { maxConsecutiveDays: 5, requireShiftLead: true });
}
// stress: 30 employees, 5 shifts x 6 (understaffed pressure keeps hill-climb busy)
{
  const shifts = mkShifts(5, 6);
  bench("stress  30 emp / 5 shifts / mw6", mkEmployees(30, shifts, 0.3, 2), shifts, { maxConsecutiveDays: 4, requireShiftLead: true });
}
