import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SHIFTS, type ShiftConfig } from "@/lib/utils";

async function getOrgId(session: Awaited<ReturnType<typeof getServerSession>>) {
  if (!session?.user.organizationId) return null;
  return session.user.organizationId;
}

export interface ShiftsConfig {
  shifts: ShiftConfig[];
  minPerShift: number;
}

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });

  const orgId = await getOrgId(session);
  if (!orgId) return NextResponse.json({ shifts: DEFAULT_SHIFTS, minPerShift: 2 });

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const rawShifts = Array.isArray(settings.shifts) ? (settings.shifts as ShiftConfig[]) : DEFAULT_SHIFTS;
  const legacyMin = typeof settings.minPerShift === "number" ? settings.minPerShift : 2;

  const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  // Backfill minWorkers for shifts saved before per-shift counts were introduced
  const shifts = [...rawShifts]
    .map(s => ({ ...s, minWorkers: s.minWorkers ?? legacyMin }))
    .sort((a, b) => toMins(a.start) - toMins(b.start));

  return NextResponse.json({ shifts });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER")
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });

  const orgId = await getOrgId(session);
  if (!orgId) return NextResponse.json({ error: "אין ארגון" }, { status: 400 });

  const body = await req.json();
  const shifts: ShiftConfig[] = Array.isArray(body.shifts) ? body.shifts : body;

  if (!Array.isArray(shifts) || shifts.length === 0)
    return NextResponse.json({ error: "נדרשת לפחות משמרת אחת" }, { status: 400 });

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  const current = (org?.settings ?? {}) as Record<string, unknown>;

  await prisma.organization.update({
    where: { id: orgId },
    data: { settings: { ...current, shifts } },
  });

  return NextResponse.json({ shifts });
}
