"use client";

import { useEffect, useState } from "react";
import { format, addDays } from "date-fns";
import { AvailabilityGrid, defaultConstraintData, type ConstraintData } from "@/components/availability/AvailabilityGrid";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, getNextWeekStart } from "@/lib/utils";

interface Employee {
  id: string;
  name: string | null;
  email: string;
  isShiftLead: boolean;
  constraints: { data: ConstraintData; updatedAt: string }[];
}

export default function ConstraintsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<ConstraintData>(defaultConstraintData());
  const [saving, setSaving] = useState(false);

  const weekStart = getNextWeekStart();
  const weekLabel = `${format(weekStart, "d/M")} – ${format(addDays(weekStart, 6), "d/M/yyyy")}`;

  useEffect(() => {
    fetch(`/api/admin/constraints?weekStart=${weekStart.toISOString()}`)
      .then((r) => r.json())
      .then((data) => { setEmployees(data); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit(emp: Employee) {
    setEditingId(emp.id);
    setEditData(emp.constraints[0]?.data ?? defaultConstraintData());
  }

  async function saveConstraints(emp: Employee) {
    setSaving(true);
    const res = await fetch("/api/admin/constraints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: emp.id, weekStart: weekStart.toISOString(), data: editData }),
    });
    if (res.ok) {
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === emp.id
            ? { ...e, constraints: [{ data: editData, updatedAt: new Date().toISOString() }] }
            : e
        )
      );
    }
    setSaving(false);
    setEditingId(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">זמינות עובדים</h1>
        <p className="text-sm text-gray-500">שבוע {weekLabel}</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : employees.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-gray-400">לא נמצאו עובדים.</CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {employees.map((emp) => {
            const hasConstraints = emp.constraints.length > 0;
            const isEditing = editingId === emp.id;

            return (
              <Card key={emp.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">{emp.name ?? emp.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={hasConstraints ? "success" : "warning"}>
                        {hasConstraints ? "הוגש" : "ממתין"}
                      </Badge>
                      <button
                        onClick={() => isEditing ? setEditingId(null) : startEdit(emp)}
                        className={cn(
                          "text-xs px-2.5 py-1 rounded-md border font-medium transition-colors",
                          isEditing
                            ? "border-gray-300 text-gray-500 hover:bg-gray-50"
                            : "border-brand-300 text-brand-600 hover:bg-brand-50"
                        )}
                      >
                        {isEditing ? "ביטול" : "עריכה"}
                      </button>
                    </div>
                  </div>
                </CardHeader>

                {isEditing ? (
                  <>
                    <CardContent className="pt-2">
                      <AvailabilityGrid value={editData} onChange={setEditData} disabled={saving} />
                    </CardContent>
                    <CardFooter className="flex justify-end">
                      <Button onClick={() => saveConstraints(emp)} loading={saving} size="md">
                        שמור
                      </Button>
                    </CardFooter>
                  </>
                ) : hasConstraints ? (
                  <CardContent>
                    <p className="text-xs text-gray-400">
                      עודכן: {format(new Date(emp.constraints[0].updatedAt), "d/M 'בשעה' HH:mm")}
                    </p>
                  </CardContent>
                ) : (
                  <CardContent>
                    <p className="text-sm text-gray-400">טרם הוגש. לחץ עריכה להגדרה ידנית.</p>
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
