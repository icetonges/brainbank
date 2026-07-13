// All dates in the app display in the app's home timezone (US Eastern —
// New York), regardless of where the Node server process actually runs
// (e.g. UTC on Vercel). Passing `timeZone` explicitly means the rendered
// date/time is stable whether a page is server- or client-rendered.
export const APP_TIME_ZONE = "America/New_York";

export function formatDate(date: Date | string, locale?: string): string {
  return new Date(date).toLocaleDateString(locale, { timeZone: APP_TIME_ZONE });
}

export function formatDateTime(date: Date | string, locale?: string): string {
  return new Date(date).toLocaleString(locale, { timeZone: APP_TIME_ZONE });
}
