import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { startOfWeek, addWeeks } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Returns the Monday of the current week (UTC midnight). */
export function getCurrentWeekStart(): Date {
  const now = new Date();
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

/** Returns the Monday of the next week (UTC midnight). */
export function getNextWeekStart(): Date {
  return addWeeks(getCurrentWeekStart(), 1);
}

export const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
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

export const AVAILABILITY_OPTIONS = ["available", "prefer_not", "unavailable"] as const;
export type AvailabilityOption = (typeof AVAILABILITY_OPTIONS)[number];
