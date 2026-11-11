import { describe, expect, it } from 'vitest';
import { AUTO_CHECK_INTERVAL_MS, shouldAutoCheck, updateIsWaiting } from './update-logic.ts';

describe('updateIsWaiting', () => {
  const worker = {};

  it('eine neue Version wartet, wenn neben dem aktiven Worker ein fertiger wartet', () => {
    expect(updateIsWaiting({ waiting: worker, active: worker })).toBe(true);
  });

  it('die Erstinstallation ist kein Update: Es gibt noch keinen aktiven Worker', () => {
    expect(updateIsWaiting({ waiting: worker, active: null })).toBe(false);
  });

  it('ohne wartenden Worker gibt es nichts zu übernehmen', () => {
    expect(updateIsWaiting({ waiting: null, active: worker })).toBe(false);
    expect(updateIsWaiting({ waiting: null, active: null })).toBe(false);
  });
});

describe('shouldAutoCheck', () => {
  it('sucht beim ersten Mal sofort', () => {
    expect(shouldAutoCheck(1_000, null)).toBe(true);
  });

  it('sucht höchstens einmal pro Minute', () => {
    const last = 500_000;
    expect(shouldAutoCheck(last + 1, last)).toBe(false);
    expect(shouldAutoCheck(last + AUTO_CHECK_INTERVAL_MS - 1, last)).toBe(false);
    expect(shouldAutoCheck(last + AUTO_CHECK_INTERVAL_MS, last)).toBe(true);
  });

  it('die Sperre beträgt eine Minute', () => {
    expect(AUTO_CHECK_INTERVAL_MS).toBe(60_000);
  });
});
