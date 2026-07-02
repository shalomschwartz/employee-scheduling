import { DAYS, DEFAULT_SHIFTS, DAY_LABELS_HE, toMins, type Day, type ShiftKey, type AvailabilityOption, type ShiftConfig } from "@/lib/utils";

export interface EmployeeForScheduling {
  id: string;
  name: string | null;
  email: string;
  isShiftLead: boolean;
  constraints: Record<Day, Record<ShiftKey, AvailabilityOption>> | null;
  roles: string[];               // which shift roles this employee can work
  contractShifts: number | null; // target shifts/week (null = no contract)
}

export interface ShiftSlot {
  employeeIds: string[];
  understaffed: boolean;
}

export type ScheduleData = Record<Day, Record<ShiftKey, ShiftSlot>>;

export interface Interval { start: number; end: number }

export interface SchedulerOptions {
  maxConsecutiveDays?: number; // 0 / undefined = no limit (soft cap)
  requireShiftLead?: boolean;  // prefer >=1 shift lead per staffed shift
  /** Rest context from the PREVIOUS week: absolute weekly-minute intervals shifted
   *  negative (last Saturday night ends just above 0). Checked by canPlace so
   *  Motzei-Shabbat -> Sunday-morning rest violations are caught across weeks. */
  prevIntervals?: Record<string, Interval[]>;
  /** Negative day indices worked at the tail of the previous week (-1 = last Saturday),
   *  so consecutive-day runs are counted across the boundary. */
  prevWorkedDayIdxs?: Record<string, number[]>;
  /** Independent randomized restarts; the best-scoring schedule wins. */
  restarts?: number;
}

// Soft-cost weights — strictly ordered so coverage dominates everything, then role
// qualification, then lead/consecutive/preferences, then contract & fairness.
const W_UNDER = 1000; // each missing worker in a slot
const W_ROLE = 200;   // each off-role assignment
const W_LEAD = 150;   // each staffed shift with no shift-lead (when required)
const W_CONSEC = 120; // each worked day beyond the manager-set consecutive cap
const W_PREFER = 40;  // k-th "prefer not" for the same employee costs 40*k (escalates)
const W_UNDERC = 60;  // each shift under an employee's contract target (promised income)
const W_OVER = 30;    // each shift over an employee's contract target
const W_FAIR = 8;     // load imbalance among employees with no contract

// Absolute [start, end) in minutes within the week (day 0 = Sunday). Overnight
// shifts (end <= start, e.g. 23:00–07:00) wrap into the next day so rest is
// checked correctly across day boundaries.
function shiftInterval(dayIdx: number, cfg: ShiftConfig): Interval {
  const start = dayIdx * 1440 + toMins(cfg.start);
  let dur = toMins(cfg.end) - toMins(cfg.start);
  if (dur <= 0) dur += 1440;
  return { start, end: start + dur };
}

// Two shifts can coexist for one employee only if they don't overlap and are at
// least minRestMins apart on the absolute weekly timeline.
function restOk(a: Interval, b: Interval, minRestMins: number): boolean {
  if (a.start < b.end && b.start < a.end) return false; // overlap
  const gap = a.start >= b.end ? a.start - b.end : b.start - a.end;
  return gap >= minRestMins;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Longest run of consecutive day indices in a sorted, de-duplicated list.
function longestRun(days: number[]): number {
  if (days.length === 0) return 0;
  let best = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1] + 1) { run++; if (run > best) best = run; }
    else run = 1;
  }
  return best;
}

interface Slot {
  day: Day;
  dayIdx: number;
  cfg: ShiftConfig;
  shift: ShiftKey;
  role?: string;
  minWorkers: number;
  interval: Interval;
  ids: string[];
  pinned: Set<string>;
}

export function runScheduler(
  employees: EmployeeForScheduling[],
  pinnedSlots: Record<string, Record<string, string[]>> = {},
  shifts: ShiftConfig[] = DEFAULT_SHIFTS,
  minRestHours: number = 8,
  options: SchedulerOptions = {}
): { schedule: ScheduleData; warnings: string[] } {
  const minRestMins = minRestHours * 60;
  const maxConsec = options.maxConsecutiveDays && options.maxConsecutiveDays > 0 ? options.maxConsecutiveDays : Infinity;
  const empById = new Map(employees.map(e => [e.id, e]));
  const anyLeadExists = employees.some(e => e.isShiftLead);
  const wantLead = !!options.requireShiftLead && anyLeadExists;
  const prevIntervals = options.prevIntervals ?? {};
  const prevDays = options.prevWorkedDayIdxs ?? {};
  const RESTARTS = Math.max(1, options.restarts ?? 4);
  const EVAL_CAP = 100_000; // per restart; measured never binding in realistic orgs

  const empName = (id: string) => { const e = empById.get(id); return e ? (e.name ?? e.email) : id; };

  function buildSlots(): Slot[] {
    const out: Slot[] = [];
    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      const day = DAYS[dayIdx];
      for (const cfg of shifts) {
        const shift = cfg.id as ShiftKey;
        // Dedupe pins and drop ids for employees no longer in the org
        const pinnedIds = Array.from(new Set((pinnedSlots[day]?.[shift] ?? []).filter(id => empById.has(id))));
        out.push({
          day, dayIdx, cfg, shift,
          role: cfg.role?.trim() || undefined,
          minWorkers: cfg.minWorkers ?? 2,
          interval: shiftInterval(dayIdx, cfg),
          ids: [...pinnedIds],
          pinned: new Set(pinnedIds),
        });
      }
    }
    return out;
  }

  // slots is reassigned per restart; all helpers close over it.
  let slots: Slot[] = buildSlots();

  const avail = (emp: EmployeeForScheduling, slot: Slot): AvailabilityOption =>
    emp.constraints?.[slot.day]?.[slot.shift] ?? "available";
  const countOf = (empId: string): number => slots.reduce((n, s) => n + (s.ids.includes(empId) ? 1 : 0), 0);
  const workedDayIdxs = (empId: string): number[] =>
    Array.from(new Set(slots.filter(s => s.ids.includes(empId)).map(s => s.dayIdx))).sort((a, b) => a - b);
  // Consecutive-day run including the tail of the previous week (ghost days)
  const longestRunWithGhost = (empId: string): number => {
    const merged = Array.from(new Set([...(prevDays[empId] ?? []), ...workedDayIdxs(empId)])).sort((a, b) => a - b);
    return longestRun(merged);
  };

  // Hard feasibility: not already in slot, not "unavailable", rest/overlap OK vs the
  // employee's other slots this week AND last week's ghost intervals, and never a
  // 7th distinct workday (Israeli weekly-rest law — one assignment-free day minimum).
  function canPlace(empId: string, slot: Slot): boolean {
    if (slot.ids.includes(empId)) return false;
    const emp = empById.get(empId)!;
    if (avail(emp, slot) === "unavailable") return false;
    for (const s of slots) {
      if (s === slot || !s.ids.includes(empId)) continue;
      if (!restOk(slot.interval, s.interval, minRestMins)) return false;
    }
    for (const iv of prevIntervals[empId] ?? []) {
      if (!restOk(slot.interval, iv, minRestMins)) return false;
    }
    const days = workedDayIdxs(empId);
    if (days.indexOf(slot.dayIdx) === -1 && days.length >= 6) return false;
    return true;
  }

  // ── Construction: tiered, most-constrained-slot-first (fail-first) ─────────
  // tier 0: role-qualified AND within contract; tier 1: + over contract; tier 2: + off-role.
  // "unavailable" is never relaxed.
  const AVAIL_ORDER: Record<AvailabilityOption, number> = { available: 0, prefer_not: 1, unavailable: 2 };
  function eligible(slot: Slot, tier: number): EmployeeForScheduling[] {
    const out: EmployeeForScheduling[] = [];
    for (const emp of employees) {
      if (!canPlace(emp.id, slot)) continue;
      const roleOk = !slot.role || emp.roles.includes(slot.role);
      if (tier < 2 && !roleOk) continue;
      const withinContract = emp.contractShifts == null || countOf(emp.id) < emp.contractShifts;
      if (tier < 1 && !withinContract) continue;
      out.push(emp);
    }
    return out;
  }
  function rankBest(cands: EmployeeForScheduling[], slot: Slot): EmployeeForScheduling {
    const slotHasLead = slot.ids.some(id => empById.get(id)?.isShiftLead);
    const key = (e: EmployeeForScheduling): number[] => [
      slot.role && !e.roles.includes(slot.role) ? 1 : 0,                 // role-qualified first
      wantLead && !slotHasLead && e.isShiftLead ? 0 : 1,                 // a needed lead first
      AVAIL_ORDER[avail(e, slot)],                                       // available before prefer_not
      e.contractShifts != null && countOf(e.id) < e.contractShifts ? 0 : 1, // under-contract first
      countOf(e.id),                                                     // fewest shifts first
    ];
    return [...cands].sort((a, b) => {
      const ka = key(a), kb = key(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
      return Math.random() - 0.5;
    })[0];
  }

  /** Tiered fill pass. Returns how many assignments were added. */
  function fill(): number {
    let added = 0;
    for (const tier of [0, 1, 2]) {
      for (;;) {
        let target: Slot | null = null;
        let fewest = Infinity;
        for (const slot of shuffle(slots)) {
          if (slot.ids.length >= slot.minWorkers) continue;
          const n = eligible(slot, tier).length;
          if (n === 0) continue;
          if (n < fewest) { target = slot; fewest = n; if (n === 1) break; }
        }
        if (!target) break;
        target.ids.push(rankBest(eligible(target, tier), target).id);
        added++;
      }
    }
    return added;
  }

  // ── Total soft cost (hard constraints always hold by construction) ─────────
  function cost(): number {
    let c = 0;
    const nonContractCounts: number[] = [];
    const preferCount: Record<string, number> = {};
    for (const s of slots) {
      c += W_UNDER * Math.max(0, s.minWorkers - s.ids.length);
      let hasLead = false;
      for (const id of s.ids) {
        const e = empById.get(id)!;
        if (avail(e, s) === "prefer_not") preferCount[id] = (preferCount[id] ?? 0) + 1;
        if (s.role && !e.roles.includes(s.role)) c += W_ROLE;
        if (e.isShiftLead) hasLead = true;
      }
      if (wantLead && s.ids.length > 0 && !hasLead) c += W_LEAD;
    }
    // Escalating prefer_not: the k-th violation for the SAME employee costs 40*k,
    // so pain is spread instead of dumped on one person.
    for (const id of Object.keys(preferCount)) {
      const k = preferCount[id];
      c += W_PREFER * ((k * (k + 1)) / 2);
    }
    for (const e of employees) {
      const cnt = countOf(e.id);
      if (e.contractShifts != null && e.contractShifts > 0) {
        if (cnt < e.contractShifts) c += W_UNDERC * (e.contractShifts - cnt);
        else if (cnt > e.contractShifts) c += W_OVER * (cnt - e.contractShifts);
      } else {
        nonContractCounts.push(cnt);
      }
      if (maxConsec !== Infinity) {
        const run = longestRunWithGhost(e.id);
        if (run > maxConsec) c += W_CONSEC * (run - maxConsec);
      }
    }
    if (nonContractCounts.length > 1) {
      const mean = nonContractCounts.reduce((a, b) => a + b, 0) / nonContractCounts.length;
      c += W_FAIR * nonContractCounts.reduce((a, x) => a + Math.abs(x - mean), 0);
    }
    return c;
  }

  // ── Local search: hill-climb with relocate + swap moves ────────────────────
  function hillClimb(startBest: number): number {
    let best = startBest;
    let evals = 0;
    for (let pass = 0; pass < 40 && evals < EVAL_CAP; pass++) {
      let improved = false;

      // Relocate one employee into a slot that still has room.
      for (const from of slots) {
        for (const empId of [...from.ids]) {
          if (from.pinned.has(empId)) continue;
          const fi = from.ids.indexOf(empId);
          if (fi === -1) continue; // moved by an earlier accepted move this pass
          for (const to of slots) {
            if (to === from || to.ids.length >= to.minWorkers) continue;
            // Remove BEFORE canPlace so feasibility is judged on the true end state.
            from.ids.splice(fi, 1);
            if (!canPlace(empId, to)) { from.ids.splice(fi, 0, empId); continue; }
            to.ids.push(empId);
            evals++;
            const c = cost();
            // On accept, STOP iterating this employee: the snapshots/index are stale.
            if (c < best) { best = c; improved = true; break; }
            to.ids.pop(); from.ids.splice(fi, 0, empId);
            if (evals >= EVAL_CAP) break;
          }
          if (evals >= EVAL_CAP) break;
        }
        if (evals >= EVAL_CAP) break;
      }

      // Swap two employees between different slots.
      for (let i = 0; i < slots.length && evals < EVAL_CAP; i++) {
        for (let j = i + 1; j < slots.length && evals < EVAL_CAP; j++) {
          const A = slots[i], B = slots[j];
          let swapped = false;
          for (const a of [...A.ids]) {
            if (swapped) break;
            if (A.pinned.has(a)) continue;
            for (const b of [...B.ids]) {
              if (B.pinned.has(b) || a === b) continue;
              const ai = A.ids.indexOf(a), bi = B.ids.indexOf(b);
              if (ai === -1 || bi === -1) continue; // stale snapshot after an accepted move
              A.ids.splice(ai, 1); B.ids.splice(bi, 1);
              if (canPlace(a, B) && canPlace(b, A)) {
                A.ids.push(b); B.ids.push(a);
                evals++;
                const c = cost();
                // On accept, STOP iterating this slot pair — stale indices would
                // otherwise splice the wrong employees (unvalidated assignments).
                if (c < best) { best = c; improved = true; swapped = true; break; }
                A.ids.splice(A.ids.indexOf(b), 1); B.ids.splice(B.ids.indexOf(a), 1);
                A.ids.splice(ai, 0, a); B.ids.splice(bi, 0, b);
              } else {
                A.ids.splice(ai, 0, a); B.ids.splice(bi, 0, b);
              }
              if (evals >= EVAL_CAP) break;
            }
            if (evals >= EVAL_CAP) break;
          }
        }
      }

      if (!improved) break;
    }
    return best;
  }

  // ── Optimize: fill -> climb -> refill (relocations can unlock new fills) ────
  function optimize(): number {
    fill();
    let best = cost();
    for (let round = 0; round < 4; round++) {
      best = hillClimb(best);
      const added = fill();
      if (added === 0) break;
      best = cost();
    }
    return best;
  }

  // ── Best-of-N restarts: clips unlucky construction, stabilizes quality ─────
  let bestCost = Infinity;
  let bestIds: string[][] | null = null;
  for (let r = 0; r < RESTARTS; r++) {
    slots = buildSlots();
    const c = optimize();
    if (c < bestCost) {
      bestCost = c;
      bestIds = slots.map(s => [...s.ids]);
    }
    if (bestCost === 0) break;
  }
  slots = buildSlots();
  if (bestIds) slots.forEach((s, i) => { s.ids = bestIds![i]; });

  // ── Build result + warnings ────────────────────────────────────────────────
  const schedule = {} as ScheduleData;
  const warnings: string[] = [];
  for (const s of slots) {
    (schedule[s.day] ??= {} as Record<ShiftKey, ShiftSlot>)[s.shift] = {
      employeeIds: s.ids,
      understaffed: s.ids.length < s.minWorkers,
    };
  }

  // Pins are authoritative (manager intent) but violations must be SAID, not silent.
  for (const s of slots) {
    for (const id of Array.from(s.pinned)) {
      const emp = empById.get(id);
      if (!emp) continue;
      if (avail(emp, s) === "unavailable")
        warnings.push(`${empName(id)}: שובץ ידנית ל${DAY_LABELS_HE[s.day]} ${s.cfg.label} למרות שסימן/ה "לא זמין"`);
    }
  }
  const pinnedIvs: Record<string, { iv: Interval; label: string }[]> = {};
  for (const s of slots) {
    for (const id of Array.from(s.pinned)) {
      (pinnedIvs[id] ??= []).push({ iv: s.interval, label: `${DAY_LABELS_HE[s.day]} ${s.cfg.label}` });
    }
  }
  for (const id of Object.keys(pinnedIvs)) {
    const list = pinnedIvs[id];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (!restOk(list[i].iv, list[j].iv, minRestMins)) {
          const overlap = list[i].iv.start < list[j].iv.end && list[j].iv.start < list[i].iv.end;
          warnings.push(`${empName(id)}: שיבוץ ידני ${overlap ? "חופף" : `עם פחות מ-${minRestHours} שעות מנוחה`} — ${list[i].label} + ${list[j].label}`);
        }
      }
    }
    for (const g of prevIntervals[id] ?? []) {
      for (const p of list) {
        if (!restOk(p.iv, g, minRestMins))
          warnings.push(`${empName(id)}: שיבוץ ידני ${p.label} עם פחות מ-${minRestHours} שעות מנוחה מהמשמרת האחרונה בשבוע שעבר`);
      }
    }
  }

  // Understaffed slots: say WHY, not just how many are missing.
  function exclusionReasons(slot: Slot): string {
    let unavailable = 0, restBlocked = 0, noRole = 0, dayCapped = 0;
    for (const emp of employees) {
      if (slot.ids.includes(emp.id)) continue;
      if (avail(emp, slot) === "unavailable") { unavailable++; continue; }
      const days = workedDayIdxs(emp.id);
      if (days.indexOf(slot.dayIdx) === -1 && days.length >= 6) { dayCapped++; continue; }
      let rest = false;
      for (const s of slots) {
        if (s === slot || !s.ids.includes(emp.id)) continue;
        if (!restOk(slot.interval, s.interval, minRestMins)) { rest = true; break; }
      }
      if (!rest) for (const iv of prevIntervals[emp.id] ?? []) {
        if (!restOk(slot.interval, iv, minRestMins)) { rest = true; break; }
      }
      if (rest) { restBlocked++; continue; }
      if (slot.role && !emp.roles.includes(slot.role)) { noRole++; continue; }
    }
    const parts: string[] = [];
    if (unavailable) parts.push(`${unavailable} לא זמינים`);
    if (restBlocked) parts.push(`${restBlocked} חסומים במנוחה`);
    if (dayCapped) parts.push(`${dayCapped} מיצו 6 ימי עבודה`);
    if (noRole) parts.push(`${noRole} ללא התפקיד`);
    return parts.length ? ` (${parts.join(", ")})` : "";
  }

  for (const s of slots) {
    if (s.minWorkers <= 0) continue;
    if (s.ids.length === 0) warnings.push(`${DAY_LABELS_HE[s.day]} ${s.cfg.label}: אין עובדים זמינים${exclusionReasons(s)}`);
    else if (s.ids.length < s.minWorkers) warnings.push(`${DAY_LABELS_HE[s.day]} ${s.cfg.label}: רק ${s.ids.length}/${s.minWorkers} עובדים שובצו${exclusionReasons(s)}`);
    if (s.role && s.ids.some(id => !empById.get(id)!.roles.includes(s.role!)))
      warnings.push(`${DAY_LABELS_HE[s.day]} ${s.cfg.label}: שובצו עובדים ללא תפקיד "${s.role}"`);
    if (wantLead && s.ids.length > 0 && !s.ids.some(id => empById.get(id)!.isShiftLead))
      warnings.push(`${DAY_LABELS_HE[s.day]} ${s.cfg.label}: אין ראש משמרת`);
  }
  if (options.requireShiftLead && !anyLeadExists)
    warnings.push(`נדרש ראש משמרת בכל משמרת, אך לא הוגדר אף עובד כראש משמרת`);

  let totalPreferNot = 0;
  for (const s of slots) {
    for (const id of s.ids) {
      const e = empById.get(id)!;
      if (avail(e, s) === "prefer_not") totalPreferNot++;
    }
  }
  if (totalPreferNot > 0) warnings.push(`${totalPreferNot} שיבוצים בניגוד להעדפה ("מעדיף לא")`);

  for (const e of employees) {
    const cnt = countOf(e.id);
    if (e.contractShifts != null && e.contractShifts > 0) {
      if (cnt < e.contractShifts) warnings.push(`${e.name ?? e.email}: ${cnt}/${e.contractShifts} משמרות (פחות מהחוזה)`);
      else if (cnt > e.contractShifts) warnings.push(`${e.name ?? e.email}: ${cnt}/${e.contractShifts} משמרות (מעל החוזה)`);
    }
    if (maxConsec !== Infinity) {
      const run = longestRunWithGhost(e.id);
      if (run > maxConsec) warnings.push(`${e.name ?? e.email}: ${run} ימים רצופים (מעל המקסימום ${maxConsec})`);
    }
  }

  // Structural sanity: contracts can't be satisfied if they exceed total capacity.
  const totalContract = employees.reduce((a, e) => a + (e.contractShifts ?? 0), 0);
  const totalCapacity = slots.reduce((a, s) => a + s.minWorkers, 0);
  if (totalContract > totalCapacity)
    warnings.push(`סך משמרות החוזים (${totalContract}) גדול מסך התקנים בסידור (${totalCapacity}) — לא ניתן לעמוד בכל החוזים`);

  return { schedule, warnings };
}
