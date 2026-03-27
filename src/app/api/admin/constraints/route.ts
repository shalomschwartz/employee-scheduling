import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const Schema = z.object({
  userId: z.string(),
  weekStart: z.string().datetime(),
  data: z.record(z.string(), z.record(z.string(), z.enum(["available", "prefer_not", "unavailable"]))),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER")
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
  if (!session.user.organizationId)
    return NextResponse.json({ error: "אין ארגון" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("weekStart");

  const [employees, org] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: session.user.organizationId, role: "EMPLOYEE" },
      include: weekStart
        ? { constraints: { where: { weekStart: new Date(weekStart) }, take: 1 } }
        : { constraints: { orderBy: { weekStart: "desc" }, take: 1 } },
      orderBy: { name: "asc" },
    }),
    prisma.organization.findUnique({ where: { id: session.user.organizationId } }),
  ]);

  const empSettings = ((org?.settings as Record<string, unknown>)?.employeeSettings ?? {}) as Record<string, { roles?: string[]; contractShifts?: number | null }>;

  const result = employees.map(e => ({
    ...e,
    roles: empSettings[e.id]?.roles ?? [],
    contractShifts: empSettings[e.id]?.contractShifts ?? null,
    minRestHours: empSettings[e.id]?.minRestHours ?? null,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER")
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "נתונים לא תקינים" }, { status: 400 });

  const { userId, weekStart, data } = parsed.data;

  // Verify the employee belongs to manager's org
  const employee = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });
  if (employee?.organizationId !== session.user.organizationId)
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const constraint = await prisma.weeklyConstraints.upsert({
    where: { userId_weekStart: { userId, weekStart: new Date(weekStart) } },
    create: { userId, weekStart: new Date(weekStart), data },
    update: { data, updatedAt: new Date() },
  });

  return NextResponse.json(constraint);
}
