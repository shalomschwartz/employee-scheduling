import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

const SlotSchema = z.object({
  employeeIds: z.array(z.string()),
  employeeNames: z.array(z.string()),
  pinnedIds: z.array(z.string()).optional(),
  understaffed: z.boolean().optional(),
});
const PatchSchema = z.object({
  weekStart: z.string(),
  schedule: z.record(z.string(), z.record(z.string(), SlotSchema)),
});

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

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER")
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
  if (!session.user.organizationId)
    return NextResponse.json({ error: "אין ארגון" }, { status: 400 });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });
  const weekStart = new Date(parsed.data.weekStart);
  if (isNaN(weekStart.getTime())) return NextResponse.json({ error: "תאריך לא תקין" }, { status: 400 });

  const updated = await prisma.generatedSchedule.update({
    where: { organizationId_weekStart: { organizationId: session.user.organizationId, weekStart } },
    data: { schedule: parsed.data.schedule as Prisma.InputJsonValue, updatedAt: new Date() },
  });

  return NextResponse.json(updated);
}
