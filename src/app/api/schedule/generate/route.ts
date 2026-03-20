import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextWeekStart, SHIFTS } from "@/lib/utils";
import { runScheduler, type EmployeeForScheduling } from "@/lib/scheduler";
import type { ShiftType } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER")
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
  if (!session.user.organizationId)
    return NextResponse.json({ error: "אין ארגון" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const minPerShift = typeof body.minPerShift === "number" ? Math.max(1, body.minPerShift) : 2;

  const weekStart = getNextWeekStart();

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

  const { schedule: rawSchedule, warnings } = runScheduler(employeeData, minPerShift);

  // Enrich each slot with display names for the grid
  const schedule: Record<string, Record<string, object>> = {};
  for (const [day, dayData] of Object.entries(rawSchedule)) {
    schedule[day] = {};
    for (const [shift, slot] of Object.entries(dayData)) {
      schedule[day][shift] = {
        employeeIds: slot.employeeIds,
        employeeNames: slot.employeeIds.map((id) => nameMap[id] ?? id),
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

  // Recreate shifts
  await prisma.shift.deleteMany({ where: { scheduleId: saved.id } });

  const shiftRows = [];
  for (const [day, dayData] of Object.entries(rawSchedule)) {
    for (const [shiftType, slot] of Object.entries(dayData)) {
      for (const empId of slot.employeeIds) {
        shiftRows.push({
          employeeId: empId,
          scheduleId: saved.id,
          day,
          shiftType: shiftType as ShiftType,
          startTime: SHIFTS[shiftType as keyof typeof SHIFTS].start,
          endTime: SHIFTS[shiftType as keyof typeof SHIFTS].end,
        });
      }
    }
  }

  if (shiftRows.length > 0) {
    await prisma.shift.createMany({ data: shiftRows });
  }

  return NextResponse.json({ scheduleId: saved.id, schedule: saved, warnings });
}
