import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER")
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
  if (!session.user.organizationId)
    return NextResponse.json({ error: "אין ארגון" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const weekStartParam = searchParams.get("weekStart");

  const where = weekStartParam
    ? { organizationId_weekStart: { organizationId: session.user.organizationId, weekStart: new Date(weekStartParam) } }
    : undefined;

  const schedule = where
    ? await prisma.generatedSchedule.findUnique({ where })
    : await prisma.generatedSchedule.findFirst({
        where: { organizationId: session.user.organizationId },
        orderBy: { weekStart: "desc" },
      });

  if (!schedule) return NextResponse.json(null);
  return NextResponse.json(schedule);
}
