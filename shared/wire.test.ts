import { describe, expect, it } from 'vitest';
import { CODE_LENGTH, formatCode, LIMITS, normalizeCode } from './limits.ts';
import { dayKey } from './time.ts';
import { actionSchema, createHouseSchema, pushSubscribeSchema, syncSchema } from './wire.ts';

const meta = { id: 'b6f1c2d4-0000-4000-8000-000000000001', at: '2026-11-11T10:00:00.000Z' };

describe('Kopplungscode', () => {
  it('Eingaben werden vereinheitlicht: Großbuchstaben, ohne Leerzeichen und Bindestriche', () => {
    expect(normalizeCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(normalizeCode('ab cd 23 45')).toBe('ABCD2345');
  });

  it('die Anzeigeform trennt in zwei Vierergruppen', () => {
    expect(formatCode('ABCD2345')).toBe('ABCD-2345');
    expect(normalizeCode(formatCode('ABCD2345'))).toHaveLength(CODE_LENGTH);
  });
});

describe('Aktionen', () => {
  it('eine gültige Aktion kommt unverändert durch, Text wird gestutzt', () => {
    expect(actionSchema.parse({ ...meta, type: 'coupon.deposit', text: '  A walk  ' })).toEqual({ ...meta, type: 'coupon.deposit', text: 'A walk' });
    expect(actionSchema.safeParse({ ...meta, type: 'milestone.seen', milestone: 5 }).success).toBe(true);
    expect(actionSchema.safeParse({ ...meta, type: 'knowme.submit', taskId: 'q1', own: { kind: 'choice', option: 2 }, guess: { kind: 'text', text: 'Tea' } }).success).toBe(true);
  });

  it('unbekannte Arten, fremde Felder und überlange Texte werden abgelehnt', () => {
    const bad = [
      { ...meta, type: 'house.burn' },
      { ...meta, type: 'coupon.deposit', text: 'ok', admin: true },
      { ...meta, type: 'coupon.deposit', text: 'x'.repeat(LIMITS.couponTextLength + 1) },
      { ...meta, type: 'coupon.deposit', text: '   ' },
      { ...meta, type: 'coupon.deposit' },
      { ...meta, id: 'short', type: 'coupon.deposit', text: 'ok' },
      { type: 'coupon.deposit', text: 'ok' },
      { ...meta, type: 'build.choose', turn: 0, pieceId: 'chair' },
      { ...meta, type: 'knowme.submit', taskId: 'q1', own: { kind: 'choice', option: -1 }, guess: { kind: 'choice', option: 0 } },
    ];
    for (const action of bad) expect(actionSchema.safeParse(action).success, JSON.stringify(action)).toBe(false);
  });

  it('ein Abgleich nimmt höchstens die vereinbarte Zahl an Aktionen', () => {
    const many = (count: number) => ({ actions: Array.from({ length: count }, (_, i) => ({ ...meta, id: `${meta.id}-${i}`, type: 'coupon.deposit', text: 'ok' })) });
    expect(syncSchema.safeParse(many(LIMITS.actionsPerSync)).success).toBe(true);
    expect(syncSchema.safeParse(many(LIMITS.actionsPerSync + 1)).success).toBe(false);
  });
});

describe('Anfragen', () => {
  it('Namen werden gestutzt und dürfen weder leer noch zu lang sein', () => {
    expect(createHouseSchema.parse({ name: '  Ada ' })).toEqual({ name: 'Ada' });
    expect(createHouseSchema.safeParse({ name: ' ' }).success).toBe(false);
    expect(createHouseSchema.safeParse({ name: 'x'.repeat(LIMITS.nameLength + 1) }).success).toBe(false);
  });

  it('eine Push-Anmeldung braucht Adresse und beide Schlüssel in der richtigen Länge', () => {
    const keys = { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) };
    expect(pushSubscribeSchema.safeParse({ endpoint: 'https://web.push.apple.com/abc', keys }).success).toBe(true);
    expect(pushSubscribeSchema.safeParse({ endpoint: 'nope', keys }).success).toBe(false);
    expect(pushSubscribeSchema.safeParse({ endpoint: 'https://web.push.apple.com/abc', keys: { ...keys, auth: 'short' } }).success).toBe(false);
    expect(pushSubscribeSchema.safeParse({ endpoint: 'https://web.push.apple.com/abc', keys: { ...keys, p256dh: 'has+plus/'.repeat(10) } }).success).toBe(false);
  });
});

describe('Kalendertag', () => {
  it('rechnet in Europe/Berlin, auch über Mitternacht und die Zeitumstellung', () => {
    expect(dayKey('2026-11-11T10:00:00.000Z')).toBe('2026-11-11');
    expect(dayKey('2026-11-11T22:59:59.000Z')).toBe('2026-11-11');
    expect(dayKey('2026-11-11T23:00:00.000Z')).toBe('2026-11-12'); // Winterzeit: UTC+1
    expect(dayKey('2026-07-01T21:59:59.000Z')).toBe('2026-07-01');
    expect(dayKey('2026-07-01T22:00:00.000Z')).toBe('2026-07-02'); // Sommerzeit: UTC+2
  });

  it('eine andere Zeitzone ergibt einen anderen Tag', () => {
    expect(dayKey('2026-11-11T23:30:00.000Z', 'UTC')).toBe('2026-11-11');
    expect(dayKey('2026-11-11T23:30:00.000Z', 'Asia/Ho_Chi_Minh')).toBe('2026-11-12');
  });
});
