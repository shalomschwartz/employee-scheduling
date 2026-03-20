"use client";

import { useEffect, useState } from "react";
import { format, addDays } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getNextWeekStart, SHIFTS, DAYS, DAY_LABELS_HE, cn, type Day } from "@/lib/utils";

type ShiftKey = "MORNING" | "AFTERNOON" | "EVENING";

interface ShiftSlot {
  employeeIds: string[];
  employeeNames: string[];
}

type ScheduleData = Record<string, Record<ShiftKey, ShiftSlot>>;

interface GeneratedSchedule {
  id: string;
  status: "DRAFT" | "PUBLISHED";
  schedule: ScheduleData;
  updatedAt: string;
}

export default function SchedulePage() {
  const [existing, setExisting] = useState<GeneratedSchedule | null>(null);
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const weekStart = getNextWeekStart();
  const weekLabel = `${format(weekStart, "d/M")} – ${format(addDays(weekStart, 6), "d/M/yyyy")}`;

  useEffect(() => {
    fetch(`/api/schedule?weekStart=${weekStart.toISOString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.id) {
          setExisting(data);
          setScheduleData(data.schedule as ScheduleData);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    setGenerating(true);
    setWarnings([]);
    const res = await fetch("/api/schedule/generate", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setExisting(data.schedule);
      setScheduleData(data.schedule.schedule as ScheduleData);
      setWarnings(data.warnings ?? []);
    }
    setGenerating(false);
  }

  async function publish() {
    setPublishing(true);
    const res = await fetch("/api/schedule/publish", { method: "POST" });
    if (res.ok) {
      setExisting((prev) => (prev ? { ...prev, status: "PUBLISHED" } : prev));
    }
    setPublishing(false);
  }

  const shiftKeys: ShiftKey[] = ["MORNING", "AFTERNOON", "EVENING"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">לוח משמרות</h1>
          <p className="text-sm text-gray-500">שבוע {weekLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {existing && (
            <Badge variant={existing.status === "PUBLISHED" ? "success" : "warning"}>
              {existing.status === "PUBLISHED" ? "פורסם" : "טיוטה"}
            </Badge>
          )}
          <Button onClick={generate} loading={generating} variant="outline" size="md">
            {scheduleData ? "צור מחדש" : "צור סידור"}
          </Button>
          {scheduleData && existing?.status !== "PUBLISHED" && (
            <Button onClick={publish} loading={publishing} size="md">
              פרסם
            </Button>
          )}
        </div>
      </div>

      {warnings.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="py-3">
            <p className="text-xs font-semibold text-yellow-800 mb-1">אזהרות:</p>
            <ul className="space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i} className="text-xs text-yellow-700">
                  • {w}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : !scheduleData ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-sm text-gray-400 mb-4">טרם נוצר סידור עבודה לשבוע זה.</p>
            <Button onClick={generate} loading={generating} size="md">
              צור סידור אוטומטי
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-right py-2 ps-4 pe-3 text-xs font-semibold text-gray-500 w-24">
                  משמרת
                </th>
                {DAYS.map((day) => (
                  <th
                    key={day}
                    className="py-2 px-2 text-center text-xs font-semibold text-gray-700"
                  >
                    {DAY_LABELS_HE[day as Day]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shiftKeys.map((shift, idx) => (
                <tr
                  key={shift}
                  className={cn(
                    "border-b border-gray-100 last:border-0",
                    idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                  )}
                >
                  <td className="py-3 ps-4 pe-3 align-top">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full flex-shrink-0",
                          shift === "MORNING"
                            ? "bg-yellow-400"
                            : shift === "AFTERNOON"
                            ? "bg-orange-400"
                            : "bg-indigo-400"
                        )}
                      />
                      <span className="text-xs font-medium text-gray-600">
                        {SHIFTS[shift].label}
                      </span>
                    </span>
                  </td>
                  {DAYS.map((day) => {
                    const slot = scheduleData[day]?.[shift];
                    const names = slot?.employeeNames ?? [];
                    return (
                      <td key={day} className="py-2 px-1.5 align-top text-center">
                        {names.length === 0 ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            {names.map((name, i) => (
                              <span
                                key={i}
                                className="text-xs px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-700"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {existing && (
        <p className="text-xs text-gray-400">
          עודכן: {format(new Date(existing.updatedAt), "d/M 'בשעה' HH:mm")}
        </p>
      )}
    </div>
  );
}
