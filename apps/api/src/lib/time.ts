// Dates in the center's own time zone: record names, EMR timestamps and working hours.

function parts(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23", weekday: "short", timeZoneName: "longOffset"
  });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  const offset = (p.timeZoneName ?? "GMT").replace("GMT", "") || "+00:00";
  return { y: p.year!, mo: p.month!, d: p.day!, h: p.hour!, mi: p.minute!, s: p.second!, weekday: p.weekday!, offset };
}

/** `{fileNumber}_{YYYY-MM-DD}_{HH-mm}` in local time. */
export function baseRecordName(fileNumber: string, start: Date, timeZone: string): string {
  const p = parts(start, timeZone);
  return `${fileNumber}_${p.y}-${p.mo}-${p.d}_${p.h}-${p.mi}`;
}

/** ISO 8601 with the center's offset, e.g. 2026-10-21T08:18:00+03:00. */
export function isoLocal(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.y}-${p.mo}-${p.d}T${p.h}:${p.mi}:${p.s}${p.offset}`;
}

export type WorkingHours = { days: number[]; start: string; end: string };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isWithinWorkingHours(date: Date, wh: WorkingHours, timeZone: string): boolean {
  const p = parts(date, timeZone);
  if (!wh.days.includes(WEEKDAYS.indexOf(p.weekday))) return false;
  const now = `${p.h}:${p.mi}`;
  return now >= wh.start && now < wh.end;
}
