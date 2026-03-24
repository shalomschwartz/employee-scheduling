import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user.organizationId)
    return NextResponse.json({ deadline: null });

  const org = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
  });
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  return NextResponse.json({ deadline: settings.submissionDeadline ?? null });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER" || !session.user.organizationId)
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });

  const { deadline } = await req.json();
  if (!deadline || isNaN(new Date(deadline).getTime()))
    return NextResponse.json({ error: "תאריך לא תקין" }, { status: 400 });

  const org = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
  });
  const current = (org?.settings ?? {}) as Record<string, unknown>;
  await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: { settings: { ...current, submissionDeadline: deadline } },
  });

  return NextResponse.json({ deadline });
}
