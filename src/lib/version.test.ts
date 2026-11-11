import { describe, expect, it } from 'vitest';
import { formatBuildTime, formatVersionLine, versionLine } from './version.ts';

describe('Versionszeile', () => {
  it('zeigt die Build-Zeit in der Zeitzone des Geräts', () => {
    const iso = '2026-11-11T15:42:10.000Z';
    expect(formatBuildTime(iso, 'Europe/Berlin')).toBe('2026-11-11 16:42');
    expect(formatBuildTime(iso, 'Asia/Ho_Chi_Minh')).toBe('2026-11-11 22:42');
  });

  it('rechnet über die Datumsgrenze', () => {
    expect(formatBuildTime('2026-12-31T20:05:00.000Z', 'Asia/Ho_Chi_Minh')).toBe('2027-01-01 03:05');
  });

  it('hat die Form "Version · Build-Zeit · Commit"', () => {
    expect(formatVersionLine('1.2.3', '2026-07-01T10:00:00.000Z', 'abc1234', 'Europe/Berlin')).toBe(
      'Version 1.2.3 · 2026-07-01 12:00 · abc1234',
    );
  });

  it('ist im Build mit den eingesetzten Werten gefüllt', () => {
    expect(versionLine).toMatch(/^Version \d+\.\d+\.\d+ · \d{4}-\d{2}-\d{2} \d{2}:\d{2} · \w+$/);
  });
});
