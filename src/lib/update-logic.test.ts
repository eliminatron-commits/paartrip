import { describe, expect, it } from 'vitest';
import { AUTO_CHECK_INTERVAL_MS, shouldAutoCheck } from './update-logic.ts';

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
