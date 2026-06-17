import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

const Schema = z.object({
  orgName: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Already in an org
  if (session.user.organizationId) {
    return NextResponse.json({ error: "Already in an organization" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  // Create the org and promote the user atomically so we never end up
  // with an orphan org or a manager pointing at a non-existent org.
  const org = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.organization.create({ data: { name: parsed.data.orgName } });
    await tx.user.update({
      where: { id: session.user.id },
      data: { organizationId: created.id, role: "MANAGER" },
    });
    return created;
  });

  return NextResponse.json({ organizationId: org.id });
}
