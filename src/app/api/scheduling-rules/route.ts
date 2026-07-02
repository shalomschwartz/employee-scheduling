import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user.organizationId)
    return NextResponse.json({ maxConsecutiveDays: 0, requireShiftLead: false });

  const org = await prisma.organization.findUnique({ where: { id: session.user.organizationId } });
  const s = (org?.settings ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    maxConsecutiveDays: typeof s.maxConsecutiveDays === "number" ? s.maxConsecutiveDays : 0,
    requireShiftLead: s.requireShiftLead === true,
    managerPhone: typeof s.managerPhone === "string" ? s.managerPhone : "",
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER" || !session.user.organizationId)
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });

  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (body.maxConsecutiveDays !== undefined) {
    const v = body.maxConsecutiveDays;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 7)
      return NextResponse.json({ error: "ערך לא תקין" }, { status: 400 });
    update.maxConsecutiveDays = v;
  }
  if (body.requireShiftLead !== undefined) update.requireShiftLead = !!body.requireShiftLead;
  if (body.managerPhone !== undefined) {
    if (typeof body.managerPhone !== "string" || body.managerPhone.length > 20)
      return NextResponse.json({ error: "טלפון לא תקין" }, { status: 400 });
    update.managerPhone = body.managerPhone.trim();
  }

  const org = await prisma.organization.findUnique({ where: { id: session.user.organizationId } });
  const current = (org?.settings ?? {}) as Record<string, unknown>;
  await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: { settings: { ...current, ...update } as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ ok: true });
}
