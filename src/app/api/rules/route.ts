import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { SchedulingRule } from "@/lib/utils";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
  const orgId = session.user.organizationId;
  if (!orgId) return NextResponse.json({ rules: [] });
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const rules: SchedulingRule[] = Array.isArray(settings.rules) ? (settings.rules as SchedulingRule[]) : [];
  return NextResponse.json({ rules });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER")
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
  const orgId = session.user.organizationId;
  if (!orgId) return NextResponse.json({ error: "אין ארגון" }, { status: 400 });
  const { rules } = await req.json();
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  const current = (org?.settings ?? {}) as Record<string, unknown>;
  await prisma.organization.update({ where: { id: orgId }, data: { settings: { ...current, rules } } });
  return NextResponse.json({ rules });
}
