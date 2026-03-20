import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getNextWeekStart } from "@/lib/utils";
import { format, addDays } from "date-fns";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER") redirect("/my-schedule");

  const weekStart = getNextWeekStart();

  const employees = session.user.organizationId
    ? await prisma.user.findMany({
        where: { organizationId: session.user.organizationId, role: "EMPLOYEE" },
        include: { constraints: { where: { weekStart }, take: 1 } },
        orderBy: { name: "asc" },
      })
    : [];

  const submitted = employees.filter((e) => e.constraints.length > 0);
  const pending = employees.filter((e) => e.constraints.length === 0);

  const existingSchedule = session.user.organizationId
    ? await prisma.generatedSchedule.findUnique({
        where: {
          organizationId_weekStart: {
            organizationId: session.user.organizationId,
            weekStart,
          },
        },
      })
    : null;

  const weekLabel = `${format(weekStart, "d/M")} – ${format(addDays(weekStart, 6), "d/M/yyyy")}`;

  const statusLabel =
    existingSchedule?.status === "PUBLISHED"
      ? "פורסם"
      : existingSchedule?.status === "DRAFT"
      ? "טיוטה"
      : "אין";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">לוח בקרה</h1>
          <p className="text-sm text-gray-500">שבוע {weekLabel}</p>
        </div>
        {existingSchedule && (
          <Link href="/schedule" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
            צפה בלוח
            <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "סה\"כ עובדים", value: employees.length, color: "text-gray-900" },
          { label: "הגישו זמינות", value: submitted.length, color: "text-green-600" },
          { label: "ממתינים", value: pending.length, color: "text-amber-600" },
          { label: "סטטוס לוח", value: statusLabel, color: existingSchedule?.status === "PUBLISHED" ? "text-green-600" : "text-gray-500" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="py-4">
              <p className="text-xs text-gray-500">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Generate CTA */}
      {!existingSchedule && (
        <Card>
          <CardContent className="py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-gray-900">מוכן לצור את לוח המשמרות?</p>
              <p className="text-sm text-gray-500 mt-0.5">
                {pending.length > 0
                  ? `${pending.length} עובד${pending.length > 1 ? "ים" : ""} טרם הגיש${pending.length > 1 ? "ו" : ""}.`
                  : "כל העובדים הגישו את הזמינות שלהם."}
              </p>
            </div>
            <Link
              href="/schedule"
              className="flex-shrink-0 inline-flex items-center justify-center h-10 px-5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              צור לוח משמרות
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Employee list */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900 text-sm">הגשות זמינות</h2>
        </CardHeader>
        <CardContent className="p-0">
          {employees.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-400">
              לא נמצאו עובדים.{" "}
              <Link href="/onboarding" className="text-brand-600 hover:underline">הזמן את הצוות</Link>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {employees.map((emp) => (
                <li key={emp.id} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{emp.name ?? emp.email}</p>
                    {emp.isShiftLead && <span className="text-xs text-brand-600">ראש משמרת</span>}
                  </div>
                  <Badge variant={emp.constraints.length > 0 ? "success" : "warning"}>
                    {emp.constraints.length > 0 ? "הוגש" : "ממתין"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
