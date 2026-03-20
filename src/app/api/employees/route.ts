import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER" || !session.user.organizationId)
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });

  const employees = await prisma.user.findMany({
    where: { organizationId: session.user.organizationId, role: "EMPLOYEE" },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(employees);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER" || !session.user.organizationId)
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "שם נדרש" }, { status: 400 });

  const trimmed = name.trim();

  // Check for duplicate name within org
  const existing = await prisma.user.findFirst({
    where: { name: trimmed, organizationId: session.user.organizationId },
  });
  if (existing) return NextResponse.json({ error: "עובד עם שם זה כבר קיים" }, { status: 409 });

  // Generate a unique internal email — never shown to the employee
  const slug = trimmed.replace(/\s+/g, ".").toLowerCase();
  const email = `${slug}.${Date.now()}@internal.shiftsync`;

  const employee = await prisma.user.create({
    data: {
      name: trimmed,
      email,
      password: "",
      role: "EMPLOYEE",
      organizationId: session.user.organizationId,
    },
    select: { id: true, name: true },
  });

  return NextResponse.json(employee, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER" || !session.user.organizationId)
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "נדרש מזהה" }, { status: 400 });

  // Verify the employee belongs to this org
  const emp = await prisma.user.findFirst({
    where: { id, organizationId: session.user.organizationId, role: "EMPLOYEE" },
  });
  if (!emp) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
