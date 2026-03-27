import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { startOfWeek, addWeeks } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Returns the Sunday of the current week (UTC midnight). */
export function getCurrentWeekStart(): Date {
  const now = new Date();
  const sunday = startOfWeek(now, { weekStartsOn: 0 });
  sunday.setUTCHours(0, 0, 0, 0);
  return sunday;
}

/** Returns the Sunday of the next week (UTC midnight). */
export function getNextWeekStart(): Date {
  return addWeeks(getCurrentWeekStart(), 1);
}

export const DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type Day = (typeof DAYS)[number];

export const DAY_LABELS_HE: Record<Day, string> = {
  monday: "שני",
  tuesday: "שלישי",
  wednesday: "רביעי",
  thursday: "חמישי",
  friday: "שישי",
  saturday: "שבת",
  sunday: "ראשון",
};

export const SHIFTS = {
  MORNING: { label: "בוקר", start: "07:00", end: "15:00" },
  AFTERNOON: { label: "צהריים", start: "15:00", end: "23:00" },
  EVENING: { label: "ערב", start: "23:00", end: "07:00" },
} as const;

export type ShiftKey = keyof typeof SHIFTS;

export interface ShiftConfig {
  id: string;
  label: string;
  start: string;
  end: string;
  minWorkers: number;
  role?: string; // e.g. "מלצר", "ברמן" — only employees with this role are auto-assigned
}

export const DEFAULT_SHIFTS: ShiftConfig[] = [
  { id: "MORNING",   label: "בוקר",    start: "07:00", end: "15:00", minWorkers: 2 },
  { id: "AFTERNOON", label: "צהריים",  start: "15:00", end: "23:00", minWorkers: 2 },
  { id: "EVENING",   label: "ערב",     start: "23:00", end: "07:00", minWorkers: 2 },
];

export const AVAILABILITY_OPTIONS = ["available", "prefer_not", "unavailable"] as const;
export type AvailabilityOption = (typeof AVAILABILITY_OPTIONS)[number];
