import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  if (!secret || secret !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, blocked } = await req.json();
  if (!orgId || typeof blocked !== "boolean")
    return NextResponse.json({ error: "orgId and blocked required" }, { status: 400 });

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

  const current = (org.settings ?? {}) as Record<string, unknown>;
  await prisma.organization.update({
    where: { id: orgId },
    data: { settings: { ...current, blocked } },
  });

  return NextResponse.json({ ok: true, orgId, blocked });
}
