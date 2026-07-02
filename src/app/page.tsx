import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextWeekStart } from "@/lib/utils";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  if (session.user.role === "MANAGER") {
    redirect("/dashboard");
  }

  // Employee smart landing: availability already submitted -> their most likely
  // task is checking shifts, not re-opening the grid.
  const submitted = await prisma.weeklyConstraints.findUnique({
    where: { userId_weekStart: { userId: session.user.id, weekStart: getNextWeekStart() } },
    select: { id: true },
  });
  redirect(submitted ? "/my-schedule" : "/availability");
}
