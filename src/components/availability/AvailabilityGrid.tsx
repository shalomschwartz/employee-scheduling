"use client";

import { cn } from "@/lib/utils";
import { DAYS, SHIFTS, type Day, type ShiftKey, type AvailabilityOption } from "@/lib/utils";

export type ConstraintData = Record<Day, Record<ShiftKey, AvailabilityOption>>;

const OPTION_STYLES: Record<AvailabilityOption, { bg: string; label: string; icon: string }> = {
  available: {
    bg: "bg-green-100 border-green-400 text-green-800",
    label: "Available",
    icon: "✓",
  },
  prefer_not: {
    bg: "bg-amber-100 border-amber-400 text-amber-800",
    label: "Prefer not",
    icon: "~",
  },
  unavailable: {
    bg: "bg-red-100 border-red-400 text-red-800",
    label: "Unavailable",
    icon: "✗",
  },
};

const OPTION_CYCLE: AvailabilityOption[] = ["available", "prefer_not", "unavailable"];

function nextOption(current: AvailabilityOption): AvailabilityOption {
  const idx = OPTION_CYCLE.indexOf(current);
  return OPTION_CYCLE[(idx + 1) % OPTION_CYCLE.length];
}

interface AvailabilityGridProps {
  value: ConstraintData;
  onChange: (data: ConstraintData) => void;
  disabled?: boolean;
}

export function AvailabilityGrid({ value, onChange, disabled }: AvailabilityGridProps) {
  function handleToggle(day: Day, shift: ShiftKey) {
    if (disabled) return;
    const current = value[day][shift];
    onChange({
      ...value,
      [day]: {
        ...value[day],
        [shift]: nextOption(current),
      },
    });
  }

  function handleSetAll(shift: ShiftKey, option: AvailabilityOption) {
    const updated = { ...value };
    for (const day of DAYS) {
      updated[day] = { ...updated[day], [shift]: option };
    }
    onChange(updated);
  }

  return (
    <div className="w-full overflow-x-auto -mx-4 px-4">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        {(Object.entries(OPTION_STYLES) as [AvailabilityOption, typeof OPTION_STYLES[AvailabilityOption]][]).map(
          ([key, { bg, label, icon }]) => (
            <span key={key} className={cn("flex items-center gap-1 px-2 py-1 rounded border font-medium", bg)}>
              <span>{icon}</span> {label}
            </span>
          )
        )}
        <span className="flex items-center text-gray-400 ml-1">Tap to cycle</span>
      </div>

      <table className="w-full min-w-[340px] border-collapse">
        <thead>
          <tr>
            <th className="text-left text-xs font-medium text-gray-400 pb-2 pr-2 w-24">Day</th>
            {(Object.entries(SHIFTS) as [ShiftKey, typeof SHIFTS[ShiftKey]][]).map(([key, { label, start, end }]) => (
              <th key={key} className="text-center pb-2 px-1">
                <div className="text-xs font-semibold text-gray-700">{label}</div>
                <div className="text-[10px] text-gray-400">{start}–{end}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day) => (
            <tr key={day} className="border-t border-gray-100">
              <td className="py-1.5 pr-2 text-sm font-medium text-gray-700 capitalize w-24">{day}</td>
              {(Object.keys(SHIFTS) as ShiftKey[]).map((shift) => {
                const option = value[day][shift];
                const styles = OPTION_STYLES[option];
                return (
                  <td key={shift} className="py-1.5 px-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggle(day, shift)}
                      disabled={disabled}
                      aria-label={`${day} ${shift}: ${option}`}
                      className={cn(
                        "w-full min-w-[72px] h-10 rounded-lg border-2 text-xs font-semibold transition-all",
                        "active:scale-95 touch-manipulation select-none",
                        styles.bg,
                        disabled && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <span className="block text-base leading-none">{styles.icon}</span>
                      <span className="block text-[9px] leading-tight mt-0.5 opacity-75">{styles.label}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {/* Quick-set row */}
        <tfoot>
          <tr className="border-t border-gray-200">
            <td className="pt-2 text-[10px] text-gray-400">Set all</td>
            {(Object.keys(SHIFTS) as ShiftKey[]).map((shift) => (
              <td key={shift} className="pt-2 px-1 text-center">
                <div className="flex justify-center gap-0.5">
                  {OPTION_CYCLE.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleSetAll(shift, opt)}
                      className={cn(
                        "w-5 h-5 rounded text-[9px] font-bold border transition-all",
                        "active:scale-95 touch-manipulation",
                        OPTION_STYLES[opt].bg,
                        disabled && "opacity-50 cursor-not-allowed"
                      )}
                      title={`Set all ${shift} to ${opt}`}
                    >
                      {OPTION_STYLES[opt].icon}
                    </button>
                  ))}
                </div>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Returns a blank constraint grid with all slots set to 'available' */
export function defaultConstraintData(): ConstraintData {
  return Object.fromEntries(
    DAYS.map((day) => [
      day,
      Object.fromEntries(
        (Object.keys(SHIFTS) as ShiftKey[]).map((shift) => [shift, "available"])
      ),
    ])
  ) as ConstraintData;
}
