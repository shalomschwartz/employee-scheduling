"use client";

import { cn } from "@/lib/utils";
import { DAYS, DAY_LABELS_HE, DEFAULT_SHIFTS, type Day, type AvailabilityOption, type ShiftConfig } from "@/lib/utils";

export type ConstraintData = Record<Day, Record<string, AvailabilityOption>>;

const OPTION_STYLES: Record<AvailabilityOption, { bg: string; label: string; icon: string }> = {
  available: { bg: "bg-green-100 border-green-400 text-green-800", label: "זמין", icon: "✓" },
  prefer_not: { bg: "bg-amber-100 border-amber-400 text-amber-800", label: "מעדיף לא", icon: "~" },
  unavailable: { bg: "bg-red-100 border-red-400 text-red-800", label: "לא זמין", icon: "✗" },
};

const SHIFT_DOT_DEFAULTS = ["bg-yellow-400", "bg-orange-400", "bg-indigo-400", "bg-blue-400", "bg-pink-400"];

const OPTION_CYCLE: AvailabilityOption[] = ["available", "prefer_not", "unavailable"];

function nextOption(current: AvailabilityOption): AvailabilityOption {
  return OPTION_CYCLE[(OPTION_CYCLE.indexOf(current) + 1) % OPTION_CYCLE.length];
}

interface AvailabilityGridProps {
  value: ConstraintData;
  onChange: (data: ConstraintData) => void;
  disabled?: boolean;
  shifts?: ShiftConfig[];
}

export function AvailabilityGrid({ value, onChange, disabled, shifts = DEFAULT_SHIFTS }: AvailabilityGridProps) {
  function handleToggle(day: Day, shift: string) {
    if (disabled) return;
    const cur = value[day]?.[shift] ?? "available";
    onChange({ ...value, [day]: { ...value[day], [shift]: nextOption(cur as AvailabilityOption) } });
  }

  function handleSetAll(shift: string, option: AvailabilityOption) {
    const updated = { ...value };
    for (const day of DAYS) updated[day] = { ...updated[day], [shift]: option };
    onChange(updated);
  }

  return (
    <div className="w-full overflow-x-auto -mx-4 px-4">
      <table className="w-full min-w-[480px] border-collapse">
        <thead>
          <tr>
            <th className="text-right text-xs font-medium text-gray-400 pb-2 ps-2 w-24">משמרת</th>
            {DAYS.map(day => (
              <th key={day} className="text-center pb-2 px-0.5 min-w-[48px]">
                <div className="text-xs font-semibold text-gray-700">{DAY_LABELS_HE[day]}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shifts.map((shiftCfg, si) => (
            <tr key={shiftCfg.id} className="border-t border-gray-100">
              <td className="py-2 ps-2 pe-2 align-middle">
                <div className="flex items-center gap-1 mb-0.5">
                  <span className={cn("w-2 h-2 rounded-full flex-shrink-0", SHIFT_DOT_DEFAULTS[si % SHIFT_DOT_DEFAULTS.length])} />
                  <span className="text-xs font-semibold text-gray-700 truncate">{shiftCfg.label}</span>
                </div>
                <div className="text-[10px] text-gray-400 mb-1 ps-3" dir="ltr">{shiftCfg.start}–{shiftCfg.end}</div>
                <div className="flex gap-0.5 ps-3">
                  {OPTION_CYCLE.map(opt => (
                    <button
                      key={opt}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleSetAll(shiftCfg.id, opt)}
                      className={cn(
                        "w-5 h-5 rounded text-[9px] font-bold border transition-all active:scale-95 touch-manipulation",
                        OPTION_STYLES[opt].bg,
                        disabled && "opacity-50 cursor-not-allowed"
                      )}
                      title={`הגדר כל ${shiftCfg.label} ל${OPTION_STYLES[opt].label}`}
                    >
                      {OPTION_STYLES[opt].icon}
                    </button>
                  ))}
                </div>
              </td>

              {DAYS.map(day => {
                const option = (value[day]?.[shiftCfg.id] ?? "available") as AvailabilityOption;
                const styles = OPTION_STYLES[option];
                return (
                  <td key={day} className="py-1 px-0.5 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggle(day, shiftCfg.id)}
                      disabled={disabled}
                      aria-label={`${DAY_LABELS_HE[day]} ${shiftCfg.label}: ${styles.label}`}
                      className={cn(
                        "w-full h-14 rounded-xl border-2 text-xl font-bold transition-all",
                        "active:scale-95 touch-manipulation select-none",
                        styles.bg,
                        disabled && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {styles.icon}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Returns a blank constraint grid with all slots set to 'available' */
export function defaultConstraintData(shifts: ShiftConfig[] = DEFAULT_SHIFTS): ConstraintData {
  return Object.fromEntries(
    DAYS.map(day => [day, Object.fromEntries(shifts.map(s => [s.id, "available"]))])
  ) as ConstraintData;
}
