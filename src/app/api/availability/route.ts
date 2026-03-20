import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const AvailabilitySchema = z.object({
  weekStart: z.string().datetime(),
  data: z.record(
    z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
    z.record(
      z.enum(["MORNING", "AFTERNOON", "EVENING"]),
      z.enum(["available", "prefer_not", "unavailable"])
    )
  ),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("weekStart");

  const where = weekStart
    ? { userId: session.user.id, weekStart: new Date(weekStart) }
    : { userId: session.user.id };

  const constraints = await prisma.weeklyConstraints.findMany({
    where,
    orderBy: { weekStart: "desc" },
    take: weekStart ? 1 : 8,
  });

  return NextResponse.json(weekStart ? constraints[0] ?? null : constraints);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = AvailabilitySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });
  }

  const { weekStart, data } = parsed.data;

  const constraint = await prisma.weeklyConstraints.upsert({
    where: {
      userId_weekStart: {
        userId: session.user.id,
        weekStart: new Date(weekStart),
      },
    },
    create: {
      userId: session.user.id,
      weekStart: new Date(weekStart),
      data,
    },
    update: {
      data,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json(constraint);
}
