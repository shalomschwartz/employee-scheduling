/* eslint-disable @typescript-eslint/no-explicit-any */
import { runScheduler, type EmployeeForScheduling } from "../src/lib/scheduler";
import { DAYS, toMins, type ShiftConfig } from "../src/lib/utils";

let failures = 0;
const check = (cond: any, msg: string) => { if (!cond) { failures++; console.log("  FAIL:", msg); } };

function interval(dayIdx: number, cfg: any) {
  const start = dayIdx * 1440 + toMins(cfg.start);
  let dur = toMins(cfg.end) - toMins(cfg.start);
  if (dur <= 0) dur += 1440;
  return { start, end: start + dur };
}

const shifts: ShiftConfig[] = [
  { id: "MORNING", label: "בוקר", start: "07:00", end: "15:00", minWorkers: 2 },
  { id: "EVENING", label: "ערב", start: "15:00", end: "23:00", minWorkers: 2, role: "ברמן" },
  { id: "NIGHT", label: "לילה", start: "23:00", end: "07:00", minWorkers: 1 },
];

const emp = (id: string, o: any = {}): EmployeeForScheduling => ({
  id, name: id, email: id + "@x.com", isShiftLead: !!o.lead,
  constraints: o.constraints ?? null, roles: o.roles ?? [], contractShifts: o.contract ?? null,
});

function allConstraints(value: string): any {
  const c: any = {};
  for (const d of DAYS) { c[d] = {}; for (const s of shifts) c[d][s.id] = value; }
  return c;
}

const employees: EmployeeForScheduling[] = [
  emp("alice", { roles: ["ברמן"], lead: true }),
  emp("bob", { roles: ["ברמן"], contract: 4 }),
  emp("carol", { roles: [], contract: 5 }),
  emp("dave", { roles: ["ברמן"] }),
  emp("erin", { roles: [] }),
  emp("frank", { roles: [], constraints: { sunday: { NIGHT: "unavailable", MORNING: "prefer_not" } } as any }),
];

function validate(emps: EmployeeForScheduling[], opts: any, label: string) {
  const { schedule } = runScheduler(emps, {}, shifts, 7, opts);
  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    const day = DAYS[dayIdx];
    for (const cfg of shifts) {
      const ids = schedule[day][cfg.id]?.employeeIds ?? null;
      check(ids !== null, `[${label}] slot exists ${day} ${cfg.id}`);
      if (!ids) continue;
      check(new Set(ids).size === ids.length, `[${label}] no dup ${day}/${cfg.id}: ${ids}`);
      check(ids.length <= (cfg.minWorkers ?? 2), `[${label}] not overstaffed ${day}/${cfg.id}`);
      for (const id of ids) {
        const e = emps.find(x => x.id === id)!;
        check((e.constraints as any)?.[day]?.[cfg.id] !== "unavailable", `[${label}] unavailable assigned ${id} ${day}/${cfg.id}`);
      }
    }
  }
  for (const e of emps) {
    const ivs: any[] = [];
    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++)
      for (const cfg of shifts)
        if (schedule[DAYS[dayIdx]][cfg.id].employeeIds.includes(e.id)) ivs.push(interval(dayIdx, cfg));
    for (let i = 0; i < ivs.length; i++) for (let j = i + 1; j < ivs.length; j++) {
      const a = ivs[i], b = ivs[j];
      const overlap = a.start < b.end && b.start < a.end;
      const gap = a.start >= b.end ? a.start - b.end : b.start - a.end;
      check(!overlap, `[${label}] overlap for ${e.id}`);
      check(overlap || gap >= 7 * 60, `[${label}] rest<7h for ${e.id} gap=${gap}`);
    }
  }
  return schedule;
}

console.log("running 50 randomized validations...");
for (let i = 0; i < 50; i++) validate(employees, {}, "base");

const sched = validate(employees, {}, "base");
let total = 0, understaffed = 0, offRole = 0;
for (const day of DAYS) for (const cfg of shifts) {
  total++;
  const ids = sched[day][cfg.id].employeeIds;
  if (ids.length < (cfg.minWorkers ?? 2)) understaffed++;
  if (cfg.role) for (const id of ids) { const e = employees.find(x => x.id === id)!; if (!e.roles.includes(cfg.role)) offRole++; }
}
console.log(`coverage: ${total - understaffed}/${total} slots fully staffed; off-role assignments: ${offRole}`);

const pins = { [DAYS[0]]: { MORNING: ["erin"] } } as any;
const r2 = runScheduler(employees, pins, shifts, 7, {});
check(r2.schedule[DAYS[0]].MORNING.employeeIds.includes("erin"), "[pins] pinned erin kept");

const onlyAlice = [emp("alice", { roles: ["ברמן"], lead: true }), ...employees.slice(1).map(e => ({ ...e, constraints: allConstraints("unavailable") }))];
validate(onlyAlice, { maxConsecutiveDays: 3 }, "consec");
validate(employees, { requireShiftLead: true }, "lead");
validate([], {}, "empty");
validate([emp("solo")], {}, "solo");

console.log(failures === 0 ? "\nALL CHECKS PASSED ✓" : `\n${failures} CHECKS FAILED ✗`);
process.exit(failures === 0 ? 0 : 1);
