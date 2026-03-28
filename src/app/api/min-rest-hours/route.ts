import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user.organizationId)
    return NextResponse.json({ minRestHours: 7 });

  const org = await prisma.organization.findUnique({ where: { id: session.user.organizationId } });
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const minRestHours = typeof settings.minRestHours === "number" ? settings.minRestHours : 7;
  return NextResponse.json({ minRestHours });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER" || !session.user.organizationId)
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });

  const { minRestHours } = await req.json();
  if (typeof minRestHours !== "number" || minRestHours < 0 || minRestHours > 24)
    return NextResponse.json({ error: "ערך לא תקין" }, { status: 400 });

  const org = await prisma.organization.findUnique({ where: { id: session.user.organizationId } });
  const current = (org?.settings ?? {}) as Record<string, unknown>;
  await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: { settings: { ...current, minRestHours } },
  });

  return NextResponse.json({ minRestHours });
}
