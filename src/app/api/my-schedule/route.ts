import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextWeekStart } from "@/lib/utils";

// Read-only: the PUBLISHED schedule for the signed-in user's org + next week.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
  if (!session.user.organizationId) return NextResponse.json({ published: false });

  const weekStart = getNextWeekStart();
  const sched = await prisma.generatedSchedule.findUnique({
    where: {
      organizationId_weekStart: { organizationId: session.user.organizationId, weekStart },
    },
  });

  if (!sched || sched.status !== "PUBLISHED")
    return NextResponse.json({ published: false });

  return NextResponse.json({
    published: true,
    weekStart: weekStart.toISOString(),
    schedule: sched.schedule,
    userId: session.user.id,
  });
}
