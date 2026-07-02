import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextWeekStart } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER")
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
  if (!session.user.organizationId)
    return NextResponse.json({ error: "אין ארגון" }, { status: 400 });

  const body = await req.json().catch(() => ({} as { weekStart?: string }));
  const weekStart = body.weekStart ? new Date(body.weekStart) : getNextWeekStart();
  if (isNaN(weekStart.getTime()))
    return NextResponse.json({ error: "תאריך לא תקין" }, { status: 400 });

  // updateMany so a missing row returns 0 (no throw) instead of crashing
  const result = await prisma.generatedSchedule.updateMany({
    where: { organizationId: session.user.organizationId, weekStart },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  if (result.count === 0)
    return NextResponse.json({ error: "אין סידור לפרסום" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
