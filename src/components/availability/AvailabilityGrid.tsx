"use client";

import { cn } from "@/lib/utils";
import { DAYS, DAY_LABELS_HE, DEFAULT_SHIFTS, type Day, type AvailabilityOption, type ShiftConfig } from "@/lib/utils";

export type ConstraintData = Record<Day, Record<string, AvailabilityOption>>;

const OPTION_STYLES: Record<AvailabilityOption, { bg: string; label: string; shortLabel: string; icon: string }> = {
  available: { bg: "bg-green-100 border-green-400 text-green-800", label: "זמין", shortLabel: "זמין", icon: "✓" },
  prefer_not: { bg: "bg-amber-100 border-amber-400 text-amber-800", label: "מעדיף לא", shortLabel: "מעדיף", icon: "~" },
  unavailable: { bg: "bg-red-100 border-red-400 text-red-800", label: "לא זמין", shortLabel: "חסום", icon: "✗" },
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

const DAY_LABELS_SHORT: Record<Day, string> = {
  sunday: "א׳", monday: "ב׳", tuesday: "ג׳", wednesday: "ד׳",
  thursday: "ה׳", friday: "ו׳", saturday: "ש׳",
};

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
    <div className="w-full -mx-4 px-4">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-right text-xs font-medium text-gray-400 pb-2 ps-1 w-16 sm:w-24">משמרת</th>
            {DAYS.map(day => (
              <th key={day} className="text-center pb-2 px-0.5">
                <div className="text-xs font-semibold text-gray-700">
                  <span className="sm:hidden">{DAY_LABELS_SHORT[day]}</span>
                  <span className="hidden sm:inline">{DAY_LABELS_HE[day]}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shifts.map((shiftCfg, si) => (
            <tr key={shiftCfg.id} className="border-t border-gray-100">
              <td className="py-1 ps-1 pe-1 sm:py-2 sm:ps-2 sm:pe-2 align-middle">
                <div className="flex items-center gap-1 mb-0.5">
                  <span className={cn("w-2 h-2 rounded-full flex-shrink-0", SHIFT_DOT_DEFAULTS[si % SHIFT_DOT_DEFAULTS.length])} />
                  <span className="text-xs font-semibold text-gray-700 truncate">{shiftCfg.label}</span>
                </div>
                <div className="hidden sm:block text-[10px] text-gray-400 mb-1 ps-3" dir="ltr">{shiftCfg.start}–{shiftCfg.end}</div>
                <div className="hidden sm:flex gap-0.5 ps-3">
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
                  <td key={day} className="py-0.5 px-0.5 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggle(day, shiftCfg.id)}
                      disabled={disabled}
                      aria-label={`${DAY_LABELS_HE[day]} ${shiftCfg.label}: ${styles.label}`}
                      className={cn(
                        "w-full h-12 sm:h-14 rounded-lg sm:rounded-xl border-2 transition-all cursor-pointer",
                        "active:scale-95 hover:brightness-95 touch-manipulation select-none",
                        "flex flex-col items-center justify-center gap-0.5",
                        styles.bg,
                        disabled && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <span className="text-base sm:text-xl font-bold leading-none">{styles.icon}</span>
                      <span className="text-[9px] sm:text-[10px] font-semibold leading-none opacity-80">{styles.shortLabel}</span>
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
