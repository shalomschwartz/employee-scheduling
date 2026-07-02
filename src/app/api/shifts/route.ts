import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { Session } from "next-auth";
import { DEFAULT_SHIFTS, type ShiftConfig } from "@/lib/utils";

async function getOrgId(session: Session | null) {
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

  // Backfill minWorkers. Preserve saved order — do NOT sort; manager may have a custom ordering.
  const shifts = rawShifts.map(s => ({ ...s, minWorkers: s.minWorkers ?? legacyMin }));

  return NextResponse.json({ shifts, orgCode: typeof settings.code === "string" ? settings.code : null });
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

  // Shape validation — a bad shift config silently poisons the whole schedule:
  // duplicate ids drop assignments from the grid; start===end becomes a 24h shift.
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  const seenIds = new Set<string>();
  for (const s of shifts) {
    if (!s || typeof s.id !== "string" || !s.id.trim() || typeof s.label !== "string")
      return NextResponse.json({ error: "משמרת ללא מזהה או שם" }, { status: 400 });
    if (seenIds.has(s.id))
      return NextResponse.json({ error: "מזהי משמרות כפולים" }, { status: 400 });
    seenIds.add(s.id);
    if (!HHMM.test(s.start ?? "") || !HHMM.test(s.end ?? ""))
      return NextResponse.json({ error: `שעות לא תקינות במשמרת "${s.label}"` }, { status: 400 });
    if (s.start === s.end)
      return NextResponse.json({ error: `שעת התחלה וסיום זהות במשמרת "${s.label}"` }, { status: 400 });
    if (s.minWorkers != null && (typeof s.minWorkers !== "number" || !Number.isInteger(s.minWorkers) || s.minWorkers < 0 || s.minWorkers > 50))
      return NextResponse.json({ error: `מספר עובדים לא תקין במשמרת "${s.label}"` }, { status: 400 });
  }

  // Read + merge + write in one transaction so concurrent settings writes don't clobber each other.
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const org = await tx.organization.findUnique({ where: { id: orgId } });
    const current = (org?.settings ?? {}) as Record<string, unknown>;
    await tx.organization.update({
      where: { id: orgId },
      data: { settings: { ...current, shifts } as unknown as Prisma.InputJsonValue },
    });
  });

  return NextResponse.json({ shifts });
}
