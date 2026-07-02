/* eslint-disable @typescript-eslint/no-explicit-any */
// Empirical quality audit for the scheduler. Run:
//   cd "C:\Users\shalo\Desktop\shift sync" && npx --yes tsx scripts/audit-quality.ts
import { runScheduler, type EmployeeForScheduling, type ScheduleData, type SchedulerOptions } from "../src/lib/scheduler";
import { DAYS, toMins, type ShiftConfig } from "../src/lib/utils";

// ── deterministic RNG (mulberry32); scheduler uses Math.random, so we patch it per run ──
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const origRandom = Math.random;

function interval(dayIdx: number, cfg: ShiftConfig) {
  const start = dayIdx * 1440 + toMins(cfg.start);
  let dur = toMins(cfg.end) - toMins(cfg.start);
  if (dur <= 0) dur += 1440;
  return { start, end: start + dur };
}

// ── soft-cost replica (weights copied from scheduler.ts) ──
const W_UNDER = 1000, W_ROLE = 200, W_PREFER = 40, W_LEAD = 60, W_CONSEC = 50, W_OVER = 30, W_UNDERC = 25, W_FAIR = 8;

function longestRun(days: number[]): number {
  if (days.length === 0) return 0;
  let best = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1] + 1) { run++; if (run > best) best = run; } else run = 1;
  }
  return best;
}

function costOf(schedule: ScheduleData, emps: EmployeeForScheduling[], shifts: ShiftConfig[], options: SchedulerOptions = {}): number {
  const maxConsec = options.maxConsecutiveDays && options.maxConsecutiveDays > 0 ? options.maxConsecutiveDays : Infinity;
  const wantLead = !!options.requireShiftLead && emps.some(e => e.isShiftLead);
  const byId = new Map(emps.map(e => [e.id, e]));
  const counts = new Map<string, number>(emps.map(e => [e.id, 0]));
  const daysWorked = new Map<string, Set<number>>(emps.map(e => [e.id, new Set()]));
  let c = 0;
  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    const day = DAYS[dayIdx];
    for (const cfg of shifts) {
      const ids = (schedule as any)[day][cfg.id].employeeIds as string[];
      const mw = cfg.minWorkers ?? 2;
      c += W_UNDER * Math.max(0, mw - ids.length);
      let hasLead = false;
      for (const id of ids) {
        const e = byId.get(id)!;
        const av = (e.constraints as any)?.[day]?.[cfg.id] ?? "available";
        if (av === "prefer_not") c += W_PREFER;
        const role = cfg.role?.trim() || undefined;
        if (role && !e.roles.includes(role)) c += W_ROLE;
        if (e.isShiftLead) hasLead = true;
        counts.set(id, counts.get(id)! + 1);
        daysWorked.get(id)!.add(dayIdx);
      }
      if (wantLead && ids.length > 0 && !hasLead) c += W_LEAD;
    }
  }
  const nonContract: number[] = [];
  for (const e of emps) {
    const cnt = counts.get(e.id)!;
    if (e.contractShifts != null && e.contractShifts > 0) {
      if (cnt < e.contractShifts) c += W_UNDERC * (e.contractShifts - cnt);
      else if (cnt > e.contractShifts) c += W_OVER * (cnt - e.contractShifts);
    } else nonContract.push(cnt);
    if (maxConsec !== Infinity) {
      const run = longestRun([...daysWorked.get(e.id)!].sort((a, b) => a - b));
      if (run > maxConsec) c += W_CONSEC * (run - maxConsec);
    }
  }
  if (nonContract.length > 1) {
    const mean = nonContract.reduce((a, b) => a + b, 0) / nonContract.length;
    c += W_FAIR * nonContract.reduce((a, x) => a + Math.abs(x - mean), 0);
  }
  return c;
}

// ── hard-constraint validation ──
function hardViolations(schedule: ScheduleData, emps: EmployeeForScheduling[], shifts: ShiftConfig[], minRestHours: number): string[] {
  const v: string[] = [];
  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    const day = DAYS[dayIdx];
    for (const cfg of shifts) {
      const ids = (schedule as any)[day][cfg.id].employeeIds as string[];
      if (new Set(ids).size !== ids.length) v.push(`dup in ${day}/${cfg.id}`);
      for (const id of ids) {
        const e = emps.find(x => x.id === id)!;
        if ((e.constraints as any)?.[day]?.[cfg.id] === "unavailable") v.push(`unavailable assigned: ${id} ${day}/${cfg.id}`);
      }
    }
  }
  for (const e of emps) {
    const ivs: { start: number; end: number }[] = [];
    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++)
      for (const cfg of shifts)
        if ((schedule as any)[DAYS[dayIdx]][cfg.id].employeeIds.includes(e.id)) ivs.push(interval(dayIdx, cfg));
    for (let i = 0; i < ivs.length; i++)
      for (let j = i + 1; j < ivs.length; j++) {
        const a = ivs[i], b = ivs[j];
        const overlap = a.start < b.end && b.start < a.end;
        const gap = a.start >= b.end ? a.start - b.end : b.start - a.end;
        if (overlap) v.push(`overlap for ${e.id}`);
        else if (gap < minRestHours * 60) v.push(`rest<${minRestHours}h for ${e.id} (gap ${gap}m)`);
      }
  }
  return v;
}

// ── per-run metrics ──
interface RunMetrics {
  coveragePct: number; fullSlotsPct: number; preferNot: number; offRole: number;
  contractDev: number; underContract: number; fairStd: number; violations: number; ms: number; cost: number;
}

function measureRun(emps: EmployeeForScheduling[], shifts: ShiftConfig[], minRestHours: number, options: SchedulerOptions, seed: number): RunMetrics {
  Math.random = mulberry32(seed);
  const t0 = performance.now();
  const { schedule } = runScheduler(emps, {}, shifts, minRestHours, options);
  const ms = performance.now() - t0;
  Math.random = origRandom;

  let required = 0, filled = 0, fullSlots = 0, totalSlots = 0, preferNot = 0, offRole = 0;
  const counts = new Map<string, number>(emps.map(e => [e.id, 0]));
  for (const day of DAYS) {
    for (const cfg of shifts) {
      totalSlots++;
      const mw = cfg.minWorkers ?? 2;
      const ids = (schedule as any)[day][cfg.id].employeeIds as string[];
      required += mw;
      filled += Math.min(ids.length, mw);
      if (ids.length >= mw) fullSlots++;
      const role = cfg.role?.trim() || undefined;
      for (const id of ids) {
        const e = emps.find(x => x.id === id)!;
        counts.set(id, counts.get(id)! + 1);
        if (((e.constraints as any)?.[day]?.[cfg.id] ?? "available") === "prefer_not") preferNot++;
        if (role && !e.roles.includes(role)) offRole++;
      }
    }
  }
  const contracted = emps.filter(e => e.contractShifts != null && e.contractShifts > 0);
  const contractDev = contracted.length
    ? contracted.reduce((a, e) => a + Math.abs(counts.get(e.id)! - e.contractShifts!), 0) / contracted.length : 0;
  const underContract = contracted.reduce((a, e) => a + Math.max(0, e.contractShifts! - counts.get(e.id)!), 0);
  const nc = emps.filter(e => e.contractShifts == null || e.contractShifts === 0).map(e => counts.get(e.id)!);
  let fairStd = 0;
  if (nc.length > 1) {
    const mean = nc.reduce((a, b) => a + b, 0) / nc.length;
    fairStd = Math.sqrt(nc.reduce((a, x) => a + (x - mean) ** 2, 0) / nc.length);
  }
  const violations = hardViolations(schedule, emps, shifts, minRestHours);
  if (violations.length) console.log("  HARD VIOLATIONS:", violations.slice(0, 5));
  return {
    coveragePct: (100 * filled) / required, fullSlotsPct: (100 * fullSlots) / totalSlots,
    preferNot, offRole, contractDev, underContract, fairStd,
    violations: violations.length, ms, cost: costOf(schedule, emps, shifts, options),
  };
}

const stats = (xs: number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length);
  return { mean, sd, min: Math.min(...xs), max: Math.max(...xs) };
};
const fmt = (s: { mean: number; sd: number; min: number; max: number }, d = 1) =>
  `mean ${s.mean.toFixed(d)} sd ${s.sd.toFixed(d)} [${s.min.toFixed(d)}..${s.max.toFixed(d)}]`;

let totalViolations = 0;
function runScenario(name: string, emps: EmployeeForScheduling[], shifts: ShiftConfig[], minRestHours: number, options: SchedulerOptions, runs = 10) {
  const required = DAYS.length * shifts.reduce((a, s) => a + (s.minWorkers ?? 2), 0);
  console.log(`\n=== ${name} — ${emps.length} employees, ${shifts.length} shifts/day, demand ${required} assignments, ${runs} runs ===`);
  const rs: RunMetrics[] = [];
  for (let i = 0; i < runs; i++) rs.push(measureRun(emps, shifts, minRestHours, options, 1000 + i * 7919));
  totalViolations += rs.reduce((a, r) => a + r.violations, 0);
  console.log(`coverage %    : ${fmt(stats(rs.map(r => r.coveragePct)))}`);
  console.log(`full slots %  : ${fmt(stats(rs.map(r => r.fullSlotsPct)))}`);
  console.log(`prefer_not    : ${fmt(stats(rs.map(r => r.preferNot)))}`);
  console.log(`off-role      : ${fmt(stats(rs.map(r => r.offRole)))}`);
  console.log(`contract |dev|: ${fmt(stats(rs.map(r => r.contractDev)), 2)} (under-contract total: ${fmt(stats(rs.map(r => r.underContract)))})`);
  console.log(`fairness std  : ${fmt(stats(rs.map(r => r.fairStd)), 2)}`);
  console.log(`soft cost     : ${fmt(stats(rs.map(r => r.cost)), 0)}`);
  console.log(`runtime ms    : ${fmt(stats(rs.map(r => r.ms)))}`);
  console.log(`hard violations: ${rs.reduce((a, r) => a + r.violations, 0)} (must be 0)`);
  return rs;
}

// ── constraint builders ──
function buildConstraints(shifts: ShiftConfig[], rng: () => number, pUnavail: number, pPrefer: number): any {
  const c: any = {};
  for (const d of DAYS) {
    c[d] = {};
    for (const s of shifts) {
      const r = rng();
      c[d][s.id] = r < pUnavail ? "unavailable" : r < pUnavail + pPrefer ? "prefer_not" : "available";
    }
  }
  return c;
}
const emp = (id: string, o: any = {}): EmployeeForScheduling => ({
  id, name: id, email: id + "@x.com", isShiftLead: !!o.lead,
  constraints: o.constraints ?? null, roles: o.roles ?? [], contractShifts: o.contract ?? null,
});

// ── (a) small cafe: 5 employees, 3 shifts x 7 days, mw 2, ~20% unavailable, two roles ──
{
  const shifts: ShiftConfig[] = [
    { id: "MORNING", label: "morning", start: "07:00", end: "15:00", minWorkers: 2 },
    { id: "AFTERNOON", label: "afternoon", start: "15:00", end: "23:00", minWorkers: 2, role: "waiter" },
    { id: "EVENING", label: "night", start: "23:00", end: "07:00", minWorkers: 2, role: "bar" },
  ];
  const rng = mulberry32(42);
  const roleSets = [["waiter"], ["waiter", "bar"], ["bar"], ["waiter"], []];
  const emps = roleSets.map((roles, i) => emp(`cafe${i}`, { roles, constraints: buildConstraints(shifts, rng, 0.2, 0) }));
  runScenario("(a) small cafe", emps, shifts, 7, {});

  // Capacity upper bound (ignores cross-day rest, so true optimum <= bound):
  // per employee per day, A (15-23) conflicts with both M and E; M+E (gap 8h) is allowed.
  let bound = 0, forcedOffRole = 0;
  for (const d of DAYS) {
    let empCap = 0;
    const availCount: Record<string, number> = { MORNING: 0, AFTERNOON: 0, EVENING: 0 };
    const roleAvail: Record<string, number> = { AFTERNOON: 0, EVENING: 0 };
    for (const e of emps) {
      const av = (s: string) => (e.constraints as any)[d][s] !== "unavailable";
      empCap += Math.max((av("MORNING") ? 1 : 0) + (av("EVENING") ? 1 : 0), av("AFTERNOON") ? 1 : 0);
      for (const s of shifts) if (av(s.id)) {
        availCount[s.id]++;
        if (s.role && e.roles.includes(s.role)) roleAvail[s.id]++;
      }
    }
    const slotCap = Math.min(2, availCount.MORNING) + Math.min(2, availCount.AFTERNOON) + Math.min(2, availCount.EVENING);
    bound += Math.min(empCap, slotCap);
    for (const s of shifts) if (s.role) forcedOffRole += Math.max(0, (s.minWorkers ?? 2) - roleAvail[s.id]);
  }
  console.log(`capacity upper bound: ${bound}/42 = ${(100 * bound / 42).toFixed(1)}% (optimistic); forced off-role lower bound: ${forcedOffRole}`);

  // Exact max coverage via DP. Per employee per day the feasible actions are
  // none / M / A / E / M+E (M 07-15 & E 23-07 have an 8h gap; A conflicts with both).
  // Only cross-day interaction: E on day d blocks M on day d+1 (0h gap).
  {
    let dp = new Map<number, number>([[0, 0]]); // key: bitmask of emps who worked E yesterday
    for (const d of DAYS) {
      const av = emps.map(e => ({
        M: (e.constraints as any)[d].MORNING !== "unavailable",
        A: (e.constraints as any)[d].AFTERNOON !== "unavailable",
        E: (e.constraints as any)[d].EVENING !== "unavailable",
      }));
      const next = new Map<number, number>();
      for (const [blocked, base] of dp) {
        const rec = (i: number, m: number, a: number, en: number, eMask: number) => {
          if (i === emps.length) {
            const filled = base + Math.min(m, 2) + Math.min(a, 2) + Math.min(en, 2);
            if (filled > (next.get(eMask) ?? -1)) next.set(eMask, filled);
            return;
          }
          const canM = av[i].M && !(blocked & (1 << i)) && m < 2;
          rec(i + 1, m, a, en, eMask); // none
          if (canM) rec(i + 1, m + 1, a, en, eMask);
          if (av[i].A && a < 2) rec(i + 1, m, a + 1, en, eMask);
          if (av[i].E && en < 2) {
            rec(i + 1, m, a, en + 1, eMask | (1 << i));
            if (canM) rec(i + 1, m + 1, a, en + 1, eMask | (1 << i));
          }
        };
        rec(0, 0, 0, 0, 0);
      }
      dp = next;
    }
    const exactMax = Math.max(...dp.values());
    console.log(`EXACT max coverage (DP): ${exactMax}/42 = ${(100 * exactMax / 42).toFixed(1)}%`);
  }

  // Best-of-50 restarts: how much does keeping the best of many runs gain?
  const many: RunMetrics[] = [];
  for (let i = 0; i < 50; i++) many.push(measureRun(emps, shifts, 7, {}, 20000 + i));
  totalViolations += many.reduce((a, r) => a + r.violations, 0);
  const bestCov = Math.max(...many.map(r => r.coveragePct));
  const bestCost = Math.min(...many.map(r => r.cost));
  console.log(`best of 50 restarts: coverage ${bestCov.toFixed(1)}% (mean ${stats(many.map(r => r.coveragePct)).mean.toFixed(1)}%), cost ${bestCost} (mean ${stats(many.map(r => r.cost)).mean.toFixed(0)})`);
}

// ── (b) mid restaurant: 12 employees, contracts on half, roles on shifts, prefer_not 15%, unavailable 15% ──
{
  const shifts: ShiftConfig[] = [
    { id: "MORNING", label: "morning", start: "07:00", end: "15:00", minWorkers: 3 },
    { id: "AFTERNOON", label: "afternoon", start: "15:00", end: "23:00", minWorkers: 3, role: "waiter" },
    { id: "EVENING", label: "night", start: "23:00", end: "07:00", minWorkers: 2, role: "bar" },
  ];
  const rng = mulberry32(7);
  const emps: EmployeeForScheduling[] = [];
  for (let i = 0; i < 12; i++) {
    const roles: string[] = [];
    if (i < 7) roles.push("waiter");
    if (i >= 5 && i < 9) roles.push("bar");
    emps.push(emp(`rest${i}`, {
      roles,
      contract: i % 2 === 0 ? 3 + (i % 3) : null, // 6 contracted: 3..5 shifts
      constraints: buildConstraints(shifts, rng, 0.15, 0.15),
    }));
  }
  runScenario("(b) mid restaurant", emps, shifts, 7, {});
}

// ── (c) tight squeeze: perfect cover exists (rotation), demand 28 vs availability 35 ──
{
  const shifts: ShiftConfig[] = [
    { id: "MORNING", label: "morning", start: "08:00", end: "14:00", minWorkers: 2 },
    { id: "EVENING", label: "evening", start: "16:00", end: "22:00", minWorkers: 2 },
  ];
  // 5 employees; each day: 3 available for morning only, 2 for evening only.
  // Perfect cover (2+2 per day) exists by construction.
  const emps: EmployeeForScheduling[] = [];
  for (let i = 0; i < 5; i++) {
    const c: any = {};
    for (let d = 0; d < DAYS.length; d++) {
      const pos = (i - d + 10) % 5; // rotation: pos 0..2 -> morning, 3..4 -> evening
      c[DAYS[d]] = pos < 3
        ? { MORNING: "available", EVENING: "unavailable" }
        : { MORNING: "unavailable", EVENING: "available" };
    }
    emps.push(emp(`tight${i}`, { constraints: c }));
  }
  const rs = runScenario("(c) tight squeeze (full coverage exists)", emps, shifts, 7, {});
  const perfect = rs.filter(r => r.coveragePct === 100).length;
  console.log(`found the existing full cover in ${perfect}/${rs.length} runs`);
}

// ── (d) stress: 30 employees, 4 shifts x 7 days ──
{
  const shifts: ShiftConfig[] = [
    { id: "S1", label: "open", start: "07:00", end: "12:00", minWorkers: 4 },
    { id: "S2", label: "noon", start: "12:00", end: "17:00", minWorkers: 4, role: "waiter" },
    { id: "S3", label: "eve", start: "17:00", end: "22:00", minWorkers: 4 },
    { id: "S4", label: "late", start: "22:00", end: "03:00", minWorkers: 2, role: "bar" },
  ];
  const rng = mulberry32(99);
  const emps: EmployeeForScheduling[] = [];
  for (let i = 0; i < 30; i++) {
    const roles: string[] = [];
    if (i < 15) roles.push("waiter");
    if (i >= 12 && i < 20) roles.push("bar");
    emps.push(emp(`big${i}`, {
      roles,
      contract: i % 3 === 0 ? 4 + (i % 2) : null,
      lead: i % 10 === 0,
      constraints: buildConstraints(shifts, rng, 0.1, 0.1),
    }));
  }
  runScenario("(d) stress 30 emp x 4 shifts", emps, shifts, 7, {});
}

// ── (e) tiny instance vs brute-force optimum ──
// 4 employees, effectively 1 day (all unavailable days 1-6), 2 shifts mw 2.
// M has role "bar"; p0 (bar) prefers not M; p1 (bar); p2 contract 1; p3 plain.
{
  const shifts: ShiftConfig[] = [
    { id: "M", label: "m", start: "08:00", end: "14:00", minWorkers: 2, role: "bar" },
    { id: "E", label: "e", start: "16:00", end: "22:00", minWorkers: 2 },
  ];
  const mkC = (day0: any): any => {
    const c: any = {};
    for (let d = 0; d < DAYS.length; d++)
      c[DAYS[d]] = d === 0 ? day0 : { M: "unavailable", E: "unavailable" };
    return c;
  };
  const emps: EmployeeForScheduling[] = [
    emp("p0", { roles: ["bar"], constraints: mkC({ M: "prefer_not", E: "available" }) }),
    emp("p1", { roles: ["bar"], constraints: mkC({ M: "available", E: "available" }) }),
    emp("p2", { contract: 1, constraints: mkC({ M: "available", E: "available" }) }),
    emp("p3", { constraints: mkC({ M: "available", E: "available" }) }),
  ];
  // brute force: subsets (size<=2) for M, disjoint subsets for E (2h gap < 7h rest)
  const idx = [0, 1, 2, 3];
  const subsets: number[][] = [[]];
  for (const i of idx) for (const s of [...subsets]) if (s.length < 2) subsets.push([...s, i]);
  let optCost = Infinity;
  let optSchedule: ScheduleData | null = null;
  const mkSchedule = (m: number[], e: number[]): ScheduleData => {
    const sch: any = {};
    for (const d of DAYS) sch[d] = { M: { employeeIds: [], understaffed: true }, E: { employeeIds: [], understaffed: true } };
    sch[DAYS[0]].M.employeeIds = m.map(i => `p${i}`);
    sch[DAYS[0]].E.employeeIds = e.map(i => `p${i}`);
    return sch;
  };
  for (const m of subsets)
    for (const e of subsets) {
      if (m.some(x => e.includes(x))) continue; // rest violation
      const c = costOf(mkSchedule(m, e), emps, shifts, {});
      if (c < optCost) { optCost = c; optSchedule = mkSchedule(m, e); }
    }
  console.log(`\n=== (e) tiny brute-force: optimum cost ${optCost} ===`);
  const gaps: number[] = [];
  for (let i = 0; i < 10; i++) {
    const r = measureRun(emps, shifts, 7, {}, 5000 + i);
    totalViolations += r.violations;
    gaps.push(r.cost - optCost);
  }
  console.log(`scheduler cost - optimum: ${fmt(stats(gaps), 0)} (0 = optimal)`);
  console.log(`optimal day-0 assignment: M=${(optSchedule as any)[DAYS[0]].M.employeeIds} E=${(optSchedule as any)[DAYS[0]].E.employeeIds}`);
}

console.log(`\nTOTAL HARD VIOLATIONS ACROSS ALL RUNS: ${totalViolations}`);
if (totalViolations > 0) { console.log("FAIL: hard constraints violated"); process.exit(1); }
console.log("done.");
