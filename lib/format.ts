// Time formatting helpers. Deadlines, locking and scoring all run on UTC
// instants and are identical for everyone — these functions ONLY change how a
// time is displayed. Admin pages stay in IST (Asia/Kolkata); user-facing pages
// pass the logged-in user's own IANA zone (profiles.timezone) via fmtTime/
// fmtTimeOnly. The fmtIST/fmtISTTime wrappers keep IST for the admin area and
// any caller that hasn't been threaded a per-user zone.

// Formatters are keyed by timeZone and cached so a per-user zone is only
// constructed once per request lifetime.
const dateTimeByZone = new Map<string, Intl.DateTimeFormat>();
const timeByZone = new Map<string, Intl.DateTimeFormat>();

function dateTimeFmt(timeZone: string): Intl.DateTimeFormat {
  let fmt = dateTimeByZone.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-IN", {
      timeZone,
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    dateTimeByZone.set(timeZone, fmt);
  }
  return fmt;
}

function timeFmt(timeZone: string): Intl.DateTimeFormat {
  let fmt = timeByZone.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-IN", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    timeByZone.set(timeZone, fmt);
  }
  return fmt;
}

// Full date + time in the given zone, e.g. "Fri, 12 Jun, 09:30 pm". No zone
// label is appended — just the local time for that zone.
export function fmtTime(iso: string, timeZone: string = "Asia/Kolkata"): string {
  return dateTimeFmt(timeZone).format(new Date(iso));
}

// Time only in the given zone, e.g. "09:25 pm" — for the predictions-close line.
export function fmtTimeOnly(iso: string, timeZone: string = "Asia/Kolkata"): string {
  return timeFmt(timeZone).format(new Date(iso));
}

// IST wrappers (used by the admin area, which always displays IST regardless of
// the admin's own timezone).
export function fmtIST(iso: string): string {
  return `${fmtTime(iso, "Asia/Kolkata")} IST`;
}

export function fmtISTTime(iso: string): string {
  return `${fmtTimeOnly(iso, "Asia/Kolkata")} IST`;
}
