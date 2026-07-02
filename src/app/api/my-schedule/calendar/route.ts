import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentWeekStart, getNextWeekStart, toMins, DAYS, DEFAULT_SHIFTS, type ShiftConfig } from "@/lib/utils";

type Slot = { employeeIds: string[] };
type Schedule = Record<string, Record<string, Slot>>;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Floating local time (no TZID): interpreted in the device's timezone — correct for
// Israeli teams and avoids shipping a VTIMEZONE block.
function icsDate(weekStart: Date, dayIdx: number, time: string, extraDays = 0): string {
  const d = new Date(Date.UTC(
    weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + dayIdx + extraDays
  ));
  const [h, m] = time.split(":").map(Number);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(h)}${pad(m)}00`;
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

// Downloads the signed-in employee's published shifts (current + next week) as an .ics file.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user.organizationId)
    return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });

  const orgId = session.user.organizationId;
  const uid = session.user.id;
  const weeks = [getCurrentWeekStart(), getNextWeekStart()];

  const [rows, org] = await Promise.all([
    Promise.all(weeks.map(ws =>
      prisma.generatedSchedule.findUnique({
        where: { organizationId_weekStart: { organizationId: orgId, weekStart: ws } },
      })
    )),
    prisma.organization.findUnique({ where: { id: orgId } }),
  ]);

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const shifts: ShiftConfig[] = Array.isArray(settings.shifts) ? (settings.shifts as ShiftConfig[]) : DEFAULT_SHIFTS;
  const orgName = org?.name ?? "ShiftSync";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ShiftSync//Schedule//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  weeks.forEach((ws, wi) => {
    const row = rows[wi];
    if (!row || row.status !== "PUBLISHED") return;
    const schedule = row.schedule as unknown as Schedule;
    DAYS.forEach((day, dayIdx) => {
      for (const cfg of shifts) {
        if (!schedule[day]?.[cfg.id]?.employeeIds?.includes(uid)) continue;
        const overnight = toMins(cfg.end) <= toMins(cfg.start);
        lines.push(
          "BEGIN:VEVENT",
          `UID:${row.id}-${day}-${cfg.id}@shiftsync`,
          `DTSTART:${icsDate(ws, dayIdx, cfg.start)}`,
          `DTEND:${icsDate(ws, dayIdx, cfg.end, overnight ? 1 : 0)}`,
          `SUMMARY:${esc(`משמרת ${cfg.label} — ${orgName}`)}`,
          `DESCRIPTION:${esc("הופק ב-ShiftSync")}`,
          "END:VEVENT",
        );
      }
    });
  });

  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="shiftsync-shifts.ics"',
    },
  });
}
