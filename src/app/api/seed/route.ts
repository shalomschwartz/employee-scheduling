import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getNextWeekStart, DAYS, type Day, type ShiftKey, type AvailabilityOption } from "@/lib/utils";

const DEMO_PASSWORD = "demo1234";
const DEMO_CODE = "DEMO01";
const DEMO_PHONES: Record<string, string> = {
  "alice@demo.com": "050-1111111",
  "bob@demo.com": "050-2222222",
  "carol@demo.com": "050-3333333",
};

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
    // Backfill the org login code + employee phones, then re-save constraints
    await prisma.organization.update({
      where: { id: existing.id },
      data: { settings: { ...(existing.settings as Record<string, unknown>), code: DEMO_CODE } as Prisma.InputJsonValue },
    });
    for (const emp of existing.users) {
      if (!emp.phone && DEMO_PHONES[emp.email]) {
        await prisma.user.update({ where: { id: emp.id }, data: { phone: DEMO_PHONES[emp.email] } });
      }
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
    return NextResponse.json({ message: "זמינות עודכנה לשבוע הנוכחי.", credentials: getCredentials(), orgCode: DEMO_CODE });
  }

  const hashed = await bcrypt.hash(DEMO_PASSWORD, 12);
  const org = await prisma.organization.create({ data: { name: "Demo Company", settings: { code: DEMO_CODE } } });

  await prisma.user.create({
    data: { name: "מנהל", email: "manager@demo.com", password: hashed, role: "MANAGER", organizationId: org.id },
  });

  const alice = await prisma.user.create({
    data: { name: "אליס כהן", email: "alice@demo.com", phone: DEMO_PHONES["alice@demo.com"], password: hashed, role: "EMPLOYEE", organizationId: org.id },
  });
  const bob = await prisma.user.create({
    data: { name: "בוב לוי", email: "bob@demo.com", phone: DEMO_PHONES["bob@demo.com"], password: hashed, role: "EMPLOYEE", organizationId: org.id },
  });
  const carol = await prisma.user.create({
    data: { name: "קרול מזרחי", email: "carol@demo.com", phone: DEMO_PHONES["carol@demo.com"], password: hashed, role: "EMPLOYEE", organizationId: org.id },
  });

  await prisma.weeklyConstraints.createMany({
    data: [
      { userId: alice.id, weekStart, data: ALICE_CONSTRAINTS },
      { userId: bob.id, weekStart, data: BOB_CONSTRAINTS },
      { userId: carol.id, weekStart, data: CAROL_CONSTRAINTS },
    ],
  });

  return NextResponse.json({ message: "הדמו הוגדר בהצלחה!", credentials: getCredentials(), orgCode: DEMO_CODE });
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
