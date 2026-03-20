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

const ALICE_CONSTRAINTS = makeConstraints({
  saturday: { MORNING: "available", AFTERNOON: "prefer_not", EVENING: "unavailable" },
  sunday: { MORNING: "unavailable", AFTERNOON: "prefer_not", EVENING: "unavailable" },
});

const BOB_CONSTRAINTS = makeConstraints({
  tuesday: { MORNING: "unavailable", AFTERNOON: "available", EVENING: "available" },
  thursday: { MORNING: "unavailable", AFTERNOON: "available", EVENING: "prefer_not" },
  saturday: { MORNING: "prefer_not", AFTERNOON: "prefer_not", EVENING: "unavailable" },
  sunday: { MORNING: "prefer_not", AFTERNOON: "prefer_not", EVENING: "unavailable" },
});

const CAROL_CONSTRAINTS = makeConstraints({
  monday: { MORNING: "available", AFTERNOON: "available", EVENING: "prefer_not" },
  tuesday: { MORNING: "available", AFTERNOON: "available", EVENING: "prefer_not" },
  wednesday: { MORNING: "available", AFTERNOON: "available", EVENING: "prefer_not" },
  thursday: { MORNING: "available", AFTERNOON: "available", EVENING: "prefer_not" },
  friday: { MORNING: "available", AFTERNOON: "prefer_not", EVENING: "unavailable" },
  saturday: { MORNING: "prefer_not", AFTERNOON: "unavailable", EVENING: "unavailable" },
  sunday: { MORNING: "unavailable", AFTERNOON: "unavailable", EVENING: "unavailable" },
});

export async function POST() {
  const weekStart = getNextWeekStart();

  const existing = await prisma.organization.findFirst({
    where: { name: "Demo Company" },
    include: { users: { where: { role: "EMPLOYEE" } } },
  });

  if (existing) {
    // Org already exists — just re-save constraints for the current week
    for (const emp of existing.users) {
      let data: ConstraintData;
      if (emp.email === "alice@demo.com") data = ALICE_CONSTRAINTS;
      else if (emp.email === "bob@demo.com") data = BOB_CONSTRAINTS;
      else data = CAROL_CONSTRAINTS;

      await prisma.weeklyConstraints.upsert({
        where: { userId_weekStart: { userId: emp.id, weekStart } },
        create: { userId: emp.id, weekStart, data },
        update: { data },
      });
    }
    return NextResponse.json({ message: "זמינות עודכנה לשבוע הנוכחי.", credentials: getCredentials() });
  }

  const hashed = await bcrypt.hash(DEMO_PASSWORD, 12);
  const org = await prisma.organization.create({ data: { name: "Demo Company" } });

  await prisma.user.create({
    data: { name: "מנהל", email: "manager@demo.com", password: hashed, role: "MANAGER", organizationId: org.id },
  });

  const alice = await prisma.user.create({
    data: { name: "אליס כהן", email: "alice@demo.com", password: hashed, role: "EMPLOYEE", organizationId: org.id },
  });
  const bob = await prisma.user.create({
    data: { name: "בוב לוי", email: "bob@demo.com", password: hashed, role: "EMPLOYEE", organizationId: org.id },
  });
  const carol = await prisma.user.create({
    data: { name: "קרול מזרחי", email: "carol@demo.com", password: hashed, role: "EMPLOYEE", organizationId: org.id },
  });

  await prisma.weeklyConstraints.createMany({
    data: [
      { userId: alice.id, weekStart, data: ALICE_CONSTRAINTS },
      { userId: bob.id, weekStart, data: BOB_CONSTRAINTS },
      { userId: carol.id, weekStart, data: CAROL_CONSTRAINTS },
    ],
  });

  return NextResponse.json({ message: "הדמו הוגדר בהצלחה!", credentials: getCredentials() });
}

function getCredentials() {
  return {
    manager: { email: "manager@demo.com", password: DEMO_PASSWORD },
    employees: [
      { name: "אליס כהן", email: "alice@demo.com", password: DEMO_PASSWORD },
      { name: "בוב לוי", email: "bob@demo.com", password: DEMO_PASSWORD },
      { name: "קרול מזרחי", email: "carol@demo.com", password: DEMO_PASSWORD },
    ],
  };
}
