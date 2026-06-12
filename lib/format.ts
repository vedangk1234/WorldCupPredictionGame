// Time formatting helpers. Everything in the app is displayed in IST
// (Asia/Kolkata); times are stored/compared in UTC. Never localize per-browser.

const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

// Full date + time, e.g. "Fri, 12 Jun, 09:30 pm IST".
export function fmtIST(iso: string): string {
  return `${dateTimeFmt.format(new Date(iso))} IST`;
}

// Time only, e.g. "09:25 pm IST" — for the predictions-close line.
export function fmtISTTime(iso: string): string {
  return `${timeFmt.format(new Date(iso))} IST`;
}
