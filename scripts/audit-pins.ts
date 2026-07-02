/* eslint-disable @typescript-eslint/no-explicit-any */
// Audit: pinned slots that violate hard constraints (rest / overlap / duplicates)
import { runScheduler, type EmployeeForScheduling } from "../src/lib/scheduler";
import { DAYS, toMins, type ShiftConfig } from "../src/lib/utils";

const emp = (id: string, o: any = {}): EmployeeForScheduling => ({
  id, name: id, email: id + "@x.com", isShiftLead: !!o.lead,
  constraints: o.constraints ?? null, roles: o.roles ?? [], contractShifts: o.contract ?? null,
});

function interval(dayIdx: number, cfg: ShiftConfig) {
  const start = dayIdx * 1440 + toMins(cfg.start);
  let dur = toMins(cfg.end) - toMins(cfg.start);
  if (dur <= 0) dur += 1440;
  return { start, end: start + dur };
}

function checkHard(schedule: any, emps: EmployeeForScheduling[], shifts: ShiftConfig[], minRest: number, label: string) {
  let violations = 0;
  for (const e of emps) {
    const ivs: { start: number; end: number; where: string }[] = [];
    for (let d = 0; d < DAYS.length; d++)
      for (const cfg of shifts) {
        const ids: string[] = schedule[DAYS[d]]?.[cfg.id]?.employeeIds ?? [];
        for (const id of ids) if (id === e.id) ivs.push({ ...interval(d, cfg), where: `${DAYS[d]}/${cfg.id}` });
      }
    for (let i = 0; i < ivs.length; i++) for (let j = i + 1; j < ivs.length; j++) {
      const a = ivs[i], b = ivs[j];
      const overlap = a.start < b.end && b.start < a.end;
      const gap = a.start >= b.end ? a.start - b.end : b.start - a.end;
      if (overlap) { violations++; console.log(`  [${label}] OVERLAP for ${e.id}: ${a.where} + ${b.where}`); }
      else if (gap < minRest * 60) { violations++; console.log(`  [${label}] REST ${gap}min < ${minRest}h for ${e.id}: ${a.where} + ${b.where}`); }
    }
  }
  return violations;
}

const shifts: ShiftConfig[] = [
  { id: "MORNING", label: "בוקר", start: "07:00", end: "15:00", minWorkers: 2 },
  { id: "AFTERNOON", label: "צהריים", start: "15:00", end: "23:00", minWorkers: 2 },
  { id: "NIGHT", label: "לילה", start: "23:00", end: "07:00", minWorkers: 1 },
];

const employees = [emp("alice"), emp("bob"), emp("carol"), emp("dave"), emp("erin")];

// Case A: manager pinned alice into back-to-back shifts (UI allows via "ignore warning"),
// then hit regenerate. minRest=7h, gap=0.
{
  const pins = { sunday: { MORNING: ["alice"], AFTERNOON: ["alice"] } };
  const { schedule, warnings } = runScheduler(employees, pins as any, shifts, 7, {});
  const v = checkHard(schedule, employees, shifts, 7, "A back-to-back pins");
  console.log(`Case A: hard violations in output = ${v}; scheduler warnings mentioning alice/rest: ${warnings.filter(w => w.includes("alice")).length}`);
  console.log(`Case A: all warnings: ${JSON.stringify(warnings)}`);
}

// Case B: same employee pinned twice in the SAME slot (possible via direct PUT /api/schedule —
// zod allows any string[]; UI blocks it, API doesn't dedupe).
{
  const pins = { sunday: { MORNING: ["alice", "alice"] } };
  const { schedule } = runScheduler(employees, pins as any, shifts, 7, {});
  const ids = (schedule as any).sunday.MORNING.employeeIds;
  console.log(`Case B: duplicate pin -> sunday MORNING employeeIds = ${JSON.stringify(ids)} (dup preserved: ${new Set(ids).size !== ids.length})`);
}

// Case C: pinned while unavailable — is the pin kept and does anything warn?
{
  const constraints: any = {};
  for (const d of DAYS) { constraints[d] = {}; for (const s of shifts) constraints[d][s.id] = d === "sunday" && s.id === "MORNING" ? "unavailable" : "available"; }
  const emps = [emp("alice", { constraints }), emp("bob"), emp("carol")];
  const pins = { sunday: { MORNING: ["alice"] } };
  const { schedule, warnings } = runScheduler(emps, pins as any, shifts, 7, {});
  const kept = (schedule as any).sunday.MORNING.employeeIds.includes("alice");
  console.log(`Case C: unavailable+pinned kept=${kept}; warnings about it: ${warnings.filter(w => w.includes("alice")).length}`);
}

// Case D: pins in overlapping custom shifts (two different shifts, same hours)
{
  const shifts2: ShiftConfig[] = [
    { id: "BAR", label: "בר", start: "18:00", end: "23:00", minWorkers: 1 },
    { id: "FLOOR", label: "רצפה", start: "18:00", end: "23:00", minWorkers: 1 },
  ];
  const pins = { monday: { BAR: ["bob"], FLOOR: ["bob"] } };
  const { schedule } = runScheduler(employees, pins as any, shifts2, 7, {});
  const v = checkHard(schedule, employees, shifts2, 7, "D overlapping pins");
  console.log(`Case D: hard violations in output = ${v}`);
}
