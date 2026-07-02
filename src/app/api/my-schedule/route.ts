import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWeekStart, getNextWeekStart } from "@/lib/utils";

// Read-only: the PUBLISHED schedules for the signed-in user's org — current AND next week,
// so an employee opening mid-week always sees this week's shifts.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
  if (!session.user.organizationId)
    return NextResponse.json({ currentWeek: null, nextWeek: null, userId: session.user.id });

  const orgId = session.user.organizationId;
  const cur = getCurrentWeekStart();
  const next = getNextWeekStart();

  const [curRow, nextRow, org] = await Promise.all([
    prisma.generatedSchedule.findUnique({
      where: { organizationId_weekStart: { organizationId: orgId, weekStart: cur } },
    }),
    prisma.generatedSchedule.findUnique({
      where: { organizationId_weekStart: { organizationId: orgId, weekStart: next } },
    }),
    prisma.organization.findUnique({ where: { id: orgId } }),
  ]);

  const pack = (row: { status: string; schedule: unknown; publishedAt: Date | null } | null, ws: Date) =>
    row && row.status === "PUBLISHED"
      ? { weekStart: ws.toISOString(), schedule: row.schedule, publishedAt: row.publishedAt }
      : null;

  const settings = (org?.settings ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    currentWeek: pack(curRow, cur),
    nextWeek: pack(nextRow, next),
    userId: session.user.id,
    managerPhone: typeof settings.managerPhone === "string" ? settings.managerPhone : null,
  });
}
