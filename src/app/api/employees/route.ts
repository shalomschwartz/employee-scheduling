import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type EmpSettings = { roles?: string[]; contractShifts?: number | null };

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER" || !session.user.organizationId)
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });

  const [employees, org] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: session.user.organizationId, role: "EMPLOYEE" },
      select: { id: true, name: true, phone: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.organization.findUnique({ where: { id: session.user.organizationId } }),
  ]);

  const empSettings = ((org?.settings as Record<string, unknown>)?.employeeSettings ?? {}) as Record<string, EmpSettings>;

  const result = employees.map(e => ({
    ...e,
    roles: empSettings[e.id]?.roles ?? [],
    contractShifts: empSettings[e.id]?.contractShifts ?? null,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER" || !session.user.organizationId)
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });

  const { name, phone } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "שם נדרש" }, { status: 400 });
  if (!phone?.trim()) return NextResponse.json({ error: "מספר טלפון נדרש" }, { status: 400 });

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
      phone: phone.trim(),
      email,
      password: "",
      role: "EMPLOYEE",
      organizationId: session.user.organizationId,
    },
    select: { id: true, name: true, phone: true },
  });

  return NextResponse.json({ ...employee, roles: [], contractShifts: null }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER" || !session.user.organizationId)
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });

  const { id, roles, contractShifts } = await req.json();
  if (!id) return NextResponse.json({ error: "נדרש מזהה" }, { status: 400 });
  if (contractShifts !== undefined && contractShifts !== null && (typeof contractShifts !== "number" || !Number.isInteger(contractShifts) || contractShifts < 0))
    return NextResponse.json({ error: "ערך חוזה לא תקין" }, { status: 400 });

  const org = await prisma.organization.findUnique({ where: { id: session.user.organizationId } });
  if (!org) return NextResponse.json({ error: "ארגון לא נמצא" }, { status: 404 });

  const current = (org.settings ?? {}) as Record<string, unknown>;
  const empSettings = (current.employeeSettings ?? {}) as Record<string, EmpSettings>;

  empSettings[id] = {
    ...empSettings[id],
    ...(roles !== undefined ? { roles } : {}),
    ...(contractShifts !== undefined ? { contractShifts } : {}),
  };

  await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: { settings: { ...current, employeeSettings: empSettings } },
  });

  return NextResponse.json({ ok: true });
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
