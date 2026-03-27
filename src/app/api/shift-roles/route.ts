import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user.organizationId)
    return NextResponse.json({ roles: [] });

  const org = await prisma.organization.findUnique({ where: { id: session.user.organizationId } });
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const roles: string[] = Array.isArray(settings.shiftRoles) ? (settings.shiftRoles as string[]) : [];
  return NextResponse.json({ roles });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER" || !session.user.organizationId)
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });

  const { roles } = await req.json();
  if (!Array.isArray(roles)) return NextResponse.json({ error: "roles must be an array" }, { status: 400 });

  const org = await prisma.organization.findUnique({ where: { id: session.user.organizationId } });
  const current = (org?.settings ?? {}) as Record<string, unknown>;
  await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: { settings: { ...current, shiftRoles: roles } },
  });

  return NextResponse.json({ roles });
}
