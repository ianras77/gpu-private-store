import { DateTime } from "luxon";

export const toUtcDate = (
  birthDate: string,
  birthTime: string | undefined,
  timeUnknown: boolean | undefined,
  timezone: string
): Date => {
  const timeValue = timeUnknown || !birthTime ? "12:00" : birthTime;
  const local = DateTime.fromISO(`${birthDate}T${timeValue}`, { zone: timezone });
  if (!local.isValid) {
    throw new Error(`Invalid date/time or timezone: ${birthDate} ${timeValue} (${timezone})`);
  }
  const utc = local.toUTC();
  if (!utc.isValid) {
    throw new Error(`Failed to convert to UTC for timezone: ${timezone}`);
  }
  return utc.toJSDate();
};

export const toJulianDay = (date: Date): number => {
  return date.getTime() / 86400000 + 2440587.5;
};

export const toIsoLocal = (date: Date, timezone: string): string => {
  const local = DateTime.fromJSDate(date, { zone: "utc" }).setZone(timezone);
  if (!local.isValid) return date.toISOString();
  return local.toISO() ?? date.toISOString();
};
