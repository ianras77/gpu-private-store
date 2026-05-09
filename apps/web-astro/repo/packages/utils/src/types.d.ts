declare module "tz-lookup" {
  export default function tzLookup(lat: number, lon: number): string;
}

declare module "luxon" {
  export type DateTimeOptions = { zone?: string };

  export class DateTime {
    static fromISO(text: string, options?: DateTimeOptions): DateTime;
    static fromJSDate(date: Date, options?: DateTimeOptions): DateTime;
    isValid: boolean;
    toUTC(): DateTime;
    setZone(zone: string): DateTime;
    toJSDate(): Date;
    toISO(): string | null;
  }
}
