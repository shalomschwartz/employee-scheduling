import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextWeekStart } from "@/lib/utils";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER")
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
  if (!session.user.organizationId)
    return NextResponse.json({ error: "אין ארגון" }, { status: 400 });

  const weekStart = getNextWeekStart();

  const schedule = await prisma.generatedSchedule.update({
    where: {
      organizationId_weekStart: { organizationId: session.user.organizationId, weekStart },
    },
    data: { status: "PUBLISHED" },
  });

  return NextResponse.json(schedule);
}
