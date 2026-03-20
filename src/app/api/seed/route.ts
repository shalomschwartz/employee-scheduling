import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getNextWeekStart, DAYS, type Day, type ShiftKey, type AvailabilityOption } from "@/lib/utils";

const DEMO_PASSWORD = "demo1234";

type ConstraintData = Record<Day, Record<ShiftKey, AvailabilityOption>>;

function makeConstraints(
  overrides: Partial<Record<Day, Partial<Record<ShiftKey, AvailabilityOption>>>>
): ConstraintData {
  const result = {} as ConstraintData;
  for (const day of DAYS) {
    result[day] = {
      MORNING: "available",
      AFTERNOON: "available",
      EVENING: "available",
      ...(overrides[day] ?? {}),
    };
  }
  return result;
}

export async function POST() {
  const existing = await prisma.organization.findFirst({ where: { name: "Demo Company" } });
  if (existing) {
    return NextResponse.json({ message: "הדמו כבר הוגדר.", credentials: getCredentials() });
  }

  const hashed = await bcrypt.hash(DEMO_PASSWORD, 12);
  const weekStart = getNextWeekStart();

  const org = await prisma.organization.create({ data: { name: "Demo Company" } });

  await prisma.user.create({
    data: { name: "מנהל", email: "manager@demo.com", password: hashed, role: "MANAGER", organizationId: org.id },
  });

  // Alice — Shift Lead, available weekdays, limited weekends
  const alice = await prisma.user.create({
    data: {
      name: "אליס כהן",
      email: "alice@demo.com",
      password: hashed,
      role: "EMPLOYEE",
      isShiftLead: true,
      organizationId: org.id,
    },
  });

  // Bob — unavailable some mornings
  const bob = await prisma.user.create({
    data: { name: "בוב לוי", email: "bob@demo.com", password: hashed, role: "EMPLOYEE", organizationId: org.id },
  });

  // Carol — no evenings, no weekends
  const carol = await prisma.user.create({
    data: { name: "קרול מזרחי", email: "carol@demo.com", password: hashed, role: "EMPLOYEE", organizationId: org.id },
  });

  await prisma.weeklyConstraints.createMany({
    data: [
      {
        userId: alice.id,
        weekStart,
        data: makeConstraints({
          saturday: { MORNING: "available", AFTERNOON: "prefer_not", EVENING: "unavailable" },
          sunday: { MORNING: "unavailable", AFTERNOON: "prefer_not", EVENING: "unavailable" },
        }),
      },
      {
        userId: bob.id,
        weekStart,
        data: makeConstraints({
          tuesday: { MORNING: "unavailable", AFTERNOON: "available", EVENING: "available" },
          thursday: { MORNING: "unavailable", AFTERNOON: "available", EVENING: "prefer_not" },
          saturday: { MORNING: "prefer_not", AFTERNOON: "prefer_not", EVENING: "unavailable" },
          sunday: { MORNING: "prefer_not", AFTERNOON: "prefer_not", EVENING: "unavailable" },
        }),
      },
      {
        userId: carol.id,
        weekStart,
        data: makeConstraints({
          monday: { MORNING: "available", AFTERNOON: "available", EVENING: "prefer_not" },
          tuesday: { MORNING: "available", AFTERNOON: "available", EVENING: "prefer_not" },
          wednesday: { MORNING: "available", AFTERNOON: "available", EVENING: "prefer_not" },
          thursday: { MORNING: "available", AFTERNOON: "available", EVENING: "prefer_not" },
          friday: { MORNING: "available", AFTERNOON: "prefer_not", EVENING: "unavailable" },
          saturday: { MORNING: "prefer_not", AFTERNOON: "unavailable", EVENING: "unavailable" },
          sunday: { MORNING: "unavailable", AFTERNOON: "unavailable", EVENING: "unavailable" },
        }),
      },
    ],
  });

  return NextResponse.json({ message: "הדמו הוגדר בהצלחה!", credentials: getCredentials() });
}

function getCredentials() {
  return {
    manager: { email: "manager@demo.com", password: DEMO_PASSWORD },
    employees: [
      { name: "אליס כהן (ראש משמרת)", email: "alice@demo.com", password: DEMO_PASSWORD },
      { name: "בוב לוי", email: "bob@demo.com", password: DEMO_PASSWORD },
      { name: "קרול מזרחי", email: "carol@demo.com", password: DEMO_PASSWORD },
    ],
  };
}
