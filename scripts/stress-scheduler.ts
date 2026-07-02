/* eslint-disable @typescript-eslint/no-explicit-any */
// Dense randomized hard-constraint stress: 800 org shapes with prefer_not, leads,
// contracts, overnight shifts and maxConsecutiveDays — validates every schedule.
import { runScheduler, type EmployeeForScheduling } from "../src/lib/scheduler";
import { DAYS, toMins, type ShiftConfig } from "../src/lib/utils";

// mulberry32 — deterministic runs
function rng(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHIFTS: ShiftConfig[] = [
  { id: "MORNING", label: "בוקר", start: "07:00", end: "15:00", minWorkers: 2 },
  { id: "EVENING", label: "ערב", start: "15:00", end: "23:00", minWorkers: 2, role: "אחמ\"ש" },
  { id: "NIGHT", label: "לילה", start: "23:00", end: "07:00", minWorkers: 1 },
];
const MIN_REST_H = 8;

function interval(dayIdx: number, cfg: ShiftConfig) {
  const start = dayIdx * 1440 + toMins(cfg.start);
  let dur = toMins(cfg.end) - toMins(cfg.start);
  if (dur <= 0) dur += 1440;
  return { start, end: start + dur };
}

let badRuns = 0, totalViolations = 0;
const N = 800;

for (let run = 0; run < N; run++) {
  const rand = rng(run + 1);
  const realRandom = Math.random;
  Math.random = rand; // make the scheduler's shuffles deterministic per run

  const E = 6 + (run % 8);
  const employees: EmployeeForScheduling[] = [];
  for (let e = 0; e < E; e++) {
    const constraints: any = {};
    for (const d of DAYS) {
      constraints[d] = {};
      for (const s of SHIFTS) {
        const r = rand();
        constraints[d][s.id] = r < 0.7 ? "available" : r < 0.85 ? "prefer_not" : "unavailable";
      }
    }
    employees.push({
      id: `e${e}`, name: `emp${e}`, email: `e${e}@x`, isShiftLead: e % 4 === 0,
      constraints, roles: e % 3 === 0 ? ["אחמ\"ש"] : [],
      contractShifts: e % 2 === 0 ? 3 + (e % 3) : null,
    });
  }

  const { schedule } = runScheduler(employees, {}, SHIFTS, MIN_REST_H, {
    maxConsecutiveDays: run % 3 === 0 ? 5 : undefined,
    requireShiftLead: run % 4 === 0,
  });
  Math.random = realRandom;

  const violations: string[] = [];
  // per-slot: duplicates, capacity, unavailable
  for (let di = 0; di < DAYS.length; di++) {
    const day = DAYS[di];
    for (const cfg of SHIFTS) {
      const ids = schedule[day][cfg.id].employeeIds;
      if (new Set(ids).size !== ids.length) violations.push(`dup ${day}/${cfg.id}`);
      if (ids.length > (cfg.minWorkers ?? 2)) violations.push(`overfull ${day}/${cfg.id}`);
      for (const id of ids) {
        const emp = employees.find(x => x.id === id)!;
        if ((emp.constraints as any)?.[day]?.[cfg.id] === "unavailable")
          violations.push(`unavailable ${id} ${day}/${cfg.id}`);
        if (!schedule[day][cfg.id]) violations.push(`missing slot`);
      }
    }
  }
  // per-employee: overlap + min rest on the absolute weekly timeline
  for (const emp of employees) {
    const ivs: { start: number; end: number }[] = [];
    for (let di = 0; di < DAYS.length; di++)
      for (const cfg of SHIFTS)
        if (schedule[DAYS[di]][cfg.id].employeeIds.includes(emp.id)) ivs.push(interval(di, cfg));
    for (let i = 0; i < ivs.length; i++)
      for (let j = i + 1; j < ivs.length; j++) {
        const a = ivs[i], b = ivs[j];
        const overlap = a.start < b.end && b.start < a.end;
        const gap = a.start >= b.end ? a.start - b.end : b.start - a.end;
        if (overlap) violations.push(`overlap ${emp.id}`);
        else if (gap < MIN_REST_H * 60) violations.push(`rest<${MIN_REST_H}h ${emp.id} gap=${gap}m`);
      }
  }

  if (violations.length > 0) {
    badRuns++;
    totalViolations += violations.length;
    if (badRuns <= 3) console.log(`run ${run}: ${violations.slice(0, 4).join(" | ")}`);
  }
}

console.log(`\n${badRuns}/${N} runs with hard-constraint violations (${totalViolations} total)`);
process.exit(badRuns === 0 ? 0 : 1);
