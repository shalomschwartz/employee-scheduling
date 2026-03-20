import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DAYS, DAY_LABELS_HE, SHIFTS, type Day, type ShiftKey } from "@/lib/utils";
import { format, addDays } from "date-fns";
import { redirect } from "next/navigation";
import PrintTrigger from "./PrintTrigger";

type SlotData = {
  employeeNames?: string[];
  employeeIds?: string[];
  pinnedIds?: string[];
  understaffed?: boolean;
};

const SHIFT_COLORS: Record<ShiftKey, { bg: string; border: string; header: string; dot: string; pill: string }> = {
  MORNING: { bg: "#fffbeb", border: "#fde68a", header: "#92400e", dot: "#f59e0b", pill: "#fef3c7" },
  AFTERNOON: { bg: "#fff7ed", border: "#fed7aa", header: "#9a3412", dot: "#f97316", pill: "#ffedd5" },
  EVENING: { bg: "#eef2ff", border: "#c7d2fe", header: "#3730a3", dot: "#6366f1", pill: "#e0e7ff" },
};

export default async function PrintPage({
  searchParams,
}: {
  searchParams: { weekStart?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "MANAGER") redirect("/login");
  if (!session.user.organizationId) redirect("/dashboard");

  const weekStart = searchParams.weekStart ? new Date(searchParams.weekStart) : null;
  if (!weekStart || isNaN(weekStart.getTime())) redirect("/dashboard");

  const [scheduleRecord, org] = await Promise.all([
    prisma.generatedSchedule.findUnique({
      where: {
        organizationId_weekStart: {
          organizationId: session.user.organizationId,
          weekStart,
        },
      },
    }),
    prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { name: true },
    }),
  ]);

  if (!scheduleRecord) redirect("/dashboard");

  const scheduleData = scheduleRecord.schedule as Record<string, Record<ShiftKey, SlotData>>;
  const weekEnd = addDays(weekStart, 6);
  const weekLabel = `${format(weekStart, "d/M/yyyy")} – ${format(weekEnd, "d/M/yyyy")}`;
  const orgName = org?.name ?? "ShiftSync";
  const shiftKeys: ShiftKey[] = ["MORNING", "AFTERNOON", "EVENING"];

  return (
    <>
      <style>{`
        @page { size: A4 landscape; margin: 10mm 12mm; }
        @media print {
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div
        dir="rtl"
        style={{
          backgroundColor: "white",
          padding: "24px",
          fontFamily: "Heebo, Arial, sans-serif",
          minHeight: "100vh",
        }}
      >
        <PrintTrigger />

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "24px", borderBottom: "2px solid #e5e7eb", paddingBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "4px" }}>
            <span style={{ fontSize: "28px", fontWeight: "800", color: "#111827" }}>{orgName}</span>
          </div>
          <p style={{ fontSize: "15px", color: "#6b7280", margin: 0 }}>
            סידור עבודה שבועי &nbsp;•&nbsp; {weekLabel}
          </p>
        </div>

        {/* Calendar table */}
        <table
          style={{
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: "0",
            borderRadius: "12px",
            overflow: "hidden",
            border: "1px solid #e5e7eb",
            tableLayout: "fixed",
          }}
        >
          {/* Day headers */}
          <thead>
            <tr>
              <th
                style={{
                  width: "90px",
                  padding: "10px 8px",
                  backgroundColor: "#f9fafb",
                  borderBottom: "2px solid #e5e7eb",
                  borderLeft: "1px solid #e5e7eb",
                }}
              />
              {DAYS.map((day) => {
                const date = addDays(weekStart, DAYS.indexOf(day));
                return (
                  <th
                    key={day}
                    style={{
                      padding: "10px 6px",
                      textAlign: "center",
                      backgroundColor: "#f9fafb",
                      borderBottom: "2px solid #e5e7eb",
                      borderLeft: "1px solid #e5e7eb",
                    }}
                  >
                    <div style={{ fontSize: "15px", fontWeight: "700", color: "#111827" }}>
                      {DAY_LABELS_HE[day as Day]}
                    </div>
                    <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>
                      {format(date, "d/M")}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Shift rows */}
          <tbody>
            {shiftKeys.map((shift, si) => {
              const c = SHIFT_COLORS[shift];
              const isLast = si === shiftKeys.length - 1;
              return (
                <tr key={shift}>
                  {/* Shift label */}
                  <td
                    style={{
                      padding: "12px 10px",
                      backgroundColor: c.bg,
                      borderBottom: isLast ? "none" : "1px solid #e5e7eb",
                      borderLeft: "1px solid #e5e7eb",
                      verticalAlign: "middle",
                      minHeight: "80px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                      <span
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "50%",
                          backgroundColor: c.dot,
                          flexShrink: 0,
                          display: "inline-block",
                        }}
                      />
                      <span style={{ fontSize: "14px", fontWeight: "700", color: c.header }}>
                        {SHIFTS[shift].label}
                      </span>
                    </div>
                    <div style={{ fontSize: "10px", color: "#9ca3af", paddingRight: "16px" }}>
                      {SHIFTS[shift].start}–{SHIFTS[shift].end}
                    </div>
                  </td>

                  {/* Day cells */}
                  {DAYS.map((day) => {
                    const slot = scheduleData[day]?.[shift];
                    const names = slot?.employeeNames ?? [];
                    return (
                      <td
                        key={day}
                        style={{
                          padding: "10px 6px",
                          verticalAlign: "top",
                          backgroundColor: c.bg,
                          borderBottom: isLast ? "none" : "1px solid " + c.border,
                          borderLeft: "1px solid " + c.border,
                          minHeight: "80px",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {names.length === 0 ? (
                            <span style={{ fontSize: "12px", color: "#d1d5db" }}>—</span>
                          ) : (
                            names.map((name, i) => (
                              <div
                                key={i}
                                style={{
                                  fontSize: "13px",
                                  fontWeight: "600",
                                  color: c.header,
                                  backgroundColor: "white",
                                  border: "1px solid " + c.border,
                                  borderRadius: "6px",
                                  padding: "3px 8px",
                                  textAlign: "center",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {name.split(" ")[0]}
                              </div>
                            ))
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Footer */}
        <div
          style={{
            marginTop: "16px",
            textAlign: "center",
            fontSize: "10px",
            color: "#d1d5db",
          }}
        >
          הופק ע"י ShiftSync
        </div>
      </div>
    </>
  );
}
