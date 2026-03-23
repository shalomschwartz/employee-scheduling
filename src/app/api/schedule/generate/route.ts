import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextWeekStart, DEFAULT_SHIFTS, type ShiftConfig, type SchedulingRule } from "@/lib/utils";
import { runScheduler, type EmployeeForScheduling } from "@/lib/scheduler";
import type { ShiftType } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER")
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
  if (!session.user.organizationId)
    return NextResponse.json({ error: "אין ארגון" }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  // Use weekStart from client to ensure it matches the saved constraints
  const weekStart = body.weekStart ? new Date(body.weekStart) : getNextWeekStart();

  const employees = await prisma.user.findMany({
    where: { organizationId: session.user.organizationId, role: "EMPLOYEE" },
    include: { constraints: { where: { weekStart }, take: 1 } },
  });

  const employeeData: EmployeeForScheduling[] = employees.map((emp) => ({
    id: emp.id,
    name: emp.name,
    email: emp.email,
    isShiftLead: emp.isShiftLead,
    constraints: (emp.constraints[0]?.data as EmployeeForScheduling["constraints"]) ?? null,
  }));

  const nameMap = Object.fromEntries(employees.map((e) => [e.id, e.name ?? e.email]));

  // Preserve any manual pins from the existing schedule
  const existing = await prisma.generatedSchedule.findUnique({
    where: { organizationId_weekStart: { organizationId: session.user.organizationId, weekStart } },
  });
  const pinnedSlots: Record<string, Record<string, string[]>> = {};
  if (existing?.schedule) {
    for (const [day, dayData] of Object.entries(existing.schedule as Record<string, Record<string, { pinnedIds?: string[] }>>)) {
      for (const [shift, slot] of Object.entries(dayData)) {
        if (slot.pinnedIds?.length) {
          pinnedSlots[day] ??= {};
          pinnedSlots[day][shift] = slot.pinnedIds;
        }
      }
    }
  }

  // Load org-specific shift config
  const org = await prisma.organization.findUnique({ where: { id: session.user.organizationId } });
  const orgSettings = (org?.settings ?? {}) as Record<string, unknown>;
  const shifts: ShiftConfig[] = Array.isArray(orgSettings.shifts) ? (orgSettings.shifts as ShiftConfig[]) : DEFAULT_SHIFTS;
  const rules: SchedulingRule[] = Array.isArray(orgSettings.rules) ? (orgSettings.rules as SchedulingRule[]) : [];

  const { schedule: rawSchedule, warnings } = runScheduler(employeeData, pinnedSlots, shifts, rules);

  // Enrich each slot with display names for the grid
  const schedule: Record<string, Record<string, object>> = {};
  for (const [day, dayData] of Object.entries(rawSchedule)) {
    schedule[day] = {};
    for (const [shift, slot] of Object.entries(dayData)) {
      schedule[day][shift] = {
        employeeIds: slot.employeeIds,
        employeeNames: slot.employeeIds.map((id) => nameMap[id] ?? id),
        pinnedIds: pinnedSlots[day]?.[shift] ?? [],
        understaffed: slot.understaffed,
      };
    }
  }

  const saved = await prisma.generatedSchedule.upsert({
    where: {
      organizationId_weekStart: { organizationId: session.user.organizationId, weekStart },
    },
    create: { organizationId: session.user.organizationId, weekStart, schedule, status: "DRAFT" },
    update: { schedule, status: "DRAFT", updatedAt: new Date() },
  });

  // Recreate Shift rows (best-effort tracking — skip custom shift IDs not in the DB enum)
  try {
    const VALID_SHIFT_TYPES = new Set<string>(["MORNING", "AFTERNOON", "EVENING"]);
    await prisma.shift.deleteMany({ where: { scheduleId: saved.id } });
    const shiftRows = [];
    for (const [day, dayData] of Object.entries(rawSchedule)) {
      for (const [shiftType, slot] of Object.entries(dayData)) {
        if (!VALID_SHIFT_TYPES.has(shiftType)) continue;
        for (const empId of slot.employeeIds) {
          const shiftCfg = shifts.find(s => s.id === shiftType);
          shiftRows.push({
            employeeId: empId,
            scheduleId: saved.id,
            day,
            shiftType: shiftType as ShiftType,
            startTime: shiftCfg?.start ?? "00:00",
            endTime: shiftCfg?.end ?? "00:00",
          });
        }
      }
    }
    if (shiftRows.length > 0) await prisma.shift.createMany({ data: shiftRows });
  } catch {
    // Non-critical — schedule JSON is already saved above
  }

  return NextResponse.json({ scheduleId: saved.id, schedule: saved, warnings });
}
