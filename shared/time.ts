// Zeitrechnung der Spielregeln. Gerechnet wird immer mit der Serverzeit, nie mit der Gerätezeit.
import { DAY_TIMEZONE, type DayKey, type IsoTime } from './model.ts';

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Kalendertag eines Zeitpunkts in der Zeitzone der Tagesregel, z. B. "2026-11-11". */
export function dayKey(time: IsoTime, timeZone: string = DAY_TIMEZONE): DayKey {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(new Date(time));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Der Kalendertag nach diesem. Tage vergleichen sich als Text: "2026-11-11" < "2026-11-12". */
export function nextDay(day: DayKey): DayKey {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
