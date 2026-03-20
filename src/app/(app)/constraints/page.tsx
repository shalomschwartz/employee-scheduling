import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getNextWeekStart, DAYS, SHIFTS, type Day, type ShiftKey, type AvailabilityOption } from "@/lib/utils";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";

const OPTION_CELL: Record<AvailabilityOption, string> = {
  available: "bg-green-100 text-green-700",
  prefer_not: "bg-amber-100 text-amber-700",
  unavailable: "bg-red-100 text-red-700",
};
const OPTION_LABEL: Record<AvailabilityOption, string> = {
  available: "✓",
  prefer_not: "~",
  unavailable: "✗",
};

export default async function ConstraintsPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER") redirect("/my-schedule");

  const weekStart = getNextWeekStart();
  const weekLabel = `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d, yyyy")}`;

  const employees = session.user.organizationId
    ? await prisma.user.findMany({
        where: { organizationId: session.user.organizationId, role: "EMPLOYEE" },
        include: {
          constraints: { where: { weekStart }, take: 1 },
        },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Employee Constraints</h1>
        <p className="text-sm text-gray-500">Week of {weekLabel}</p>
      </div>

      {employees.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-gray-400">
            No employees found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {employees.map((emp) => {
            const constraint = emp.constraints[0];
            const data = constraint?.data as Record<Day, Record<ShiftKey, AvailabilityOption>> | undefined;

            return (
              <Card key={emp.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">{emp.name ?? emp.email}</p>
                      {emp.isShiftLead && <span className="text-xs text-brand-600">Shift Lead</span>}
                    </div>
                    <Badge variant={constraint ? "success" : "warning"}>
                      {constraint ? "Submitted" : "Pending"}
                    </Badge>
                  </div>
                </CardHeader>
                {data ? (
                  <CardContent className="overflow-x-auto pt-2">
                    <table className="w-full min-w-[320px] text-xs border-collapse">
                      <thead>
                        <tr>
                          <th className="text-left text-gray-400 font-normal pb-1 pr-2 w-20">Day</th>
                          {(Object.entries(SHIFTS) as [ShiftKey, (typeof SHIFTS)[ShiftKey]][]).map(([key, { label }]) => (
                            <th key={key} className="text-center pb-1 px-1 font-medium text-gray-600">{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {DAYS.map((day) => (
                          <tr key={day} className="border-t border-gray-50">
                            <td className="py-1 pr-2 text-gray-600 capitalize">{day}</td>
                            {(Object.keys(SHIFTS) as ShiftKey[]).map((shift) => {
                              const opt: AvailabilityOption = data[day]?.[shift] ?? "available";
                              return (
                                <td key={shift} className="py-1 px-1 text-center">
                                  <span className={cn("inline-flex items-center justify-center w-7 h-7 rounded font-bold", OPTION_CELL[opt])}>
                                    {OPTION_LABEL[opt]}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                ) : (
                  <CardContent>
                    <p className="text-sm text-gray-400">No submission yet.</p>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
