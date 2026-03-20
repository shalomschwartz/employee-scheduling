import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentWeekStart, getNextWeekStart, SHIFTS } from "@/lib/utils";
import { format, addDays } from "date-fns";
import type { ShiftType } from "@prisma/client";

export default async function MySchedulePage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const thisWeek = getCurrentWeekStart();
  const nextWeek = getNextWeekStart();

  const shifts = await prisma.shift.findMany({
    where: {
      employeeId: session.user.id,
      schedule: {
        status: "PUBLISHED",
        weekStart: { in: [thisWeek, nextWeek] },
      },
    },
    include: {
      schedule: { select: { weekStart: true, status: true } },
    },
    orderBy: [{ schedule: { weekStart: "asc" } }, { day: "asc" }, { shiftType: "asc" }],
  });

  const thisWeekShifts = shifts.filter(
    (s) => s.schedule.weekStart.toISOString() === thisWeek.toISOString()
  );
  const nextWeekShifts = shifts.filter(
    (s) => s.schedule.weekStart.toISOString() === nextWeek.toISOString()
  );

  function ShiftCard({ shift }: { shift: (typeof shifts)[0] }) {
    const typeInfo = SHIFTS[shift.shiftType as ShiftType];
    const badgeVariant =
      shift.shiftType === "MORNING"
        ? "info"
        : shift.shiftType === "AFTERNOON"
        ? "warning"
        : "default";

    return (
      <div className="flex items-center justify-between py-3 px-4 rounded-lg border border-gray-100 bg-gray-50">
        <div>
          <p className="text-sm font-semibold capitalize text-gray-900">{shift.day}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {shift.startTime} – {shift.endTime}
          </p>
        </div>
        <Badge variant={badgeVariant}>{typeInfo?.label ?? shift.shiftType}</Badge>
      </div>
    );
  }

  function WeekSection({
    label,
    weekStart,
    weekShifts,
  }: {
    label: string;
    weekStart: Date;
    weekShifts: typeof shifts;
  }) {
    const weekLabel = `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d, yyyy")}`;
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">{label}</h2>
              <p className="text-xs text-gray-500">{weekLabel}</p>
            </div>
            <Badge variant={weekShifts.length > 0 ? "success" : "default"}>
              {weekShifts.length} shift{weekShifts.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {weekShifts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              No shifts published yet.
            </p>
          ) : (
            weekShifts.map((s) => <ShiftCard key={s.id} shift={s} />)
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-900">My Schedule</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Hi {session.user.name?.split(" ")[0] ?? "there"}!
          {session.user.isShiftLead && (
            <span className="ml-2 text-brand-600 font-medium">Shift Lead</span>
          )}
        </p>
      </div>

      <WeekSection label="This week" weekStart={thisWeek} weekShifts={thisWeekShifts} />
      <WeekSection label="Next week" weekStart={nextWeek} weekShifts={nextWeekShifts} />
    </div>
  );
}
