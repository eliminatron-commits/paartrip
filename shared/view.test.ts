import { describe, expect, it } from 'vitest';
import generated from '../generated/content-rules.json';
import type { RulesContent } from './content-schema.ts';
import type { HouseState, KnowMeSubmission, Slot } from './model.ts';
import { createHouse, joinHouse, type RuleContext } from './rules.ts';
import { deriveView, type ViewContext } from './view.ts';

const content = generated as unknown as RulesContent;
const rules: RuleContext = { content, now: '2026-11-11T10:00:00.000Z' };
const ctx: ViewContext = { content, now: rules.now, pairingCode: 'ABCD2345' };
const chapter = content.chapters[0]!;

function paired(): HouseState {
  return joinHouse(createHouse('house-1', 'Ada', rules), 'Bao', rules)!;
}

/** Was tatsächlich an ein Gerät ginge. */
const wire = (state: HouseState, you: Slot) => JSON.stringify(deriveView(state, you, ctx));

const submission = (tag: string): KnowMeSubmission => ({
  own: { kind: 'text', text: `own-${tag}` },
  guess: { kind: 'text', text: `guess-${tag}` },
});

function withKnowMe(submissions: Partial<Record<Slot, KnowMeSubmission>>, hearts: Slot[] = []): HouseState {
  return {
    ...paired(),
    task: { taskId: 'q1', availableOn: '2026-11-11', completedAt: null, progress: { type: 'knowme', submissions, hearts } },
  };
}

describe('Kopplungscode', () => {
  it('steht nur in der Sicht von a und nur, solange b fehlt', () => {
    const alone = createHouse('house-1', 'Ada', rules);
    expect(deriveView(alone, 'a', ctx).pairingCode).toBe('ABCD2345');
    expect(wire(paired(), 'a')).not.toContain('ABCD2345');
    expect(wire(paired(), 'b')).not.toContain('ABCD2345');
  });
});

describe('Kennst-du-mich', () => {
  it('vor beidseitiger Abgabe geht die Antwort des anderen nicht an das Gerät', () => {
    const state = withKnowMe({ a: submission('A') });
    const forB = deriveView(state, 'b', ctx);
    expect(forB.task?.progress).toEqual({ type: 'knowme', mine: null, theirsSubmitted: true, theirs: null, hearts: [] });
    expect(wire(state, 'b')).not.toContain('own-A');
    expect(wire(state, 'b')).not.toContain('guess-A');
    // Wer abgegeben hat, sieht die eigene Abgabe.
    expect(deriveView(state, 'a', ctx).task?.progress).toEqual({ type: 'knowme', mine: submission('A'), theirsSubmitted: false, theirs: null, hearts: [] });
  });

  it('gilt in beide Richtungen', () => {
    const state = withKnowMe({ b: submission('B') });
    expect(wire(state, 'a')).not.toContain('own-B');
    expect(wire(state, 'a')).not.toContain('guess-B');
    expect(wire(state, 'b')).toContain('own-B');
  });

  it('nach beidseitiger Abgabe sehen beide beide Antworten und die Herzen', () => {
    const state = withKnowMe({ a: submission('A'), b: submission('B') }, ['b']);
    expect(deriveView(state, 'a', ctx).task?.progress).toEqual({ type: 'knowme', mine: submission('A'), theirsSubmitted: true, theirs: submission('B'), hearts: ['b'] });
    expect(deriveView(state, 'b', ctx).task?.progress).toEqual({ type: 'knowme', mine: submission('B'), theirsSubmitted: true, theirs: submission('A'), hearts: ['b'] });
  });

  it('Herzen stehen erst mit dem Aufdecken in der Sicht', () => {
    // Ein Herz verriete, ob der Tipp stimmt – also auch etwas über die Antwort des anderen.
    const state = withKnowMe({ a: submission('A') }, ['a']);
    expect(deriveView(state, 'a', ctx).task?.progress).toMatchObject({ hearts: [] });
    expect(deriveView(state, 'b', ctx).task?.progress).toMatchObject({ hearts: [] });
  });
});

describe('Gutscheine', () => {
  const secret = (state: HouseState, from: Slot, couponState: 'veiled' | 'unlocked' | 'redeemed'): HouseState => ({
    ...state,
    coupons: [
      ...state.coupons,
      { kind: 'secret', id: 's1', from, to: from === 'a' ? 'b' : 'a', milestone: 5, state: couponState, redeemRequestedAt: null, redeemedAt: null, text: 'geheimer-Text-1' },
    ],
  });

  it('der Text eines verhüllten geheimen Gutscheins geht nur an den, der ihn hinterlegt hat', () => {
    const state = secret(paired(), 'b', 'veiled');
    expect(wire(state, 'a')).not.toContain('geheimer-Text-1');
    expect(deriveView(state, 'a', ctx).coupons.find((c) => c.id === 's1')).toMatchObject({ kind: 'secret', state: 'veiled', text: null, from: 'b', to: 'a', milestone: 5 });
    expect(deriveView(state, 'b', ctx).coupons.find((c) => c.id === 's1')?.text).toBe('geheimer-Text-1');
  });

  it('freigeschaltet und eingelöst sehen beide den Text', () => {
    for (const couponState of ['unlocked', 'redeemed'] as const) {
      const state = secret(paired(), 'b', couponState);
      expect(deriveView(state, 'a', ctx).coupons.find((c) => c.id === 's1')?.text).toBe('geheimer-Text-1');
      expect(deriveView(state, 'b', ctx).coupons.find((c) => c.id === 's1')?.text).toBe('geheimer-Text-1');
    }
  });

  it('feste Gutscheine: verhüllt sieht nur der Schenkende den Text aus den Inhalten', () => {
    const fixed = chapter.coupons[0]!;
    const state = paired();
    expect(deriveView(state, fixed.from, ctx).coupons.find((c) => c.id === fixed.id)?.text).toBe(fixed.text);
    expect(deriveView(state, fixed.to, ctx).coupons.find((c) => c.id === fixed.id)?.text).toBeNull();
  });
});

describe('Aufbau der Sicht', () => {
  it('enthält nur die vorgesehenen Felder – ein neues Feld im Stand gelangt nicht von selbst hinein', () => {
    const state = { ...paired(), internalNote: 'nur-fuer-den-server' } as HouseState;
    expect(wire(state, 'a')).not.toContain('nur-fuer-den-server');
    expect(Object.keys(deriveView(state, 'a', ctx)).sort()).toEqual(
      ['buildTurns', 'chapter', 'coupons', 'done', 'houseId', 'milestones', 'nextTaskOn', 'pairingCode', 'placements', 'players', 'task', 'today', 'you'].sort(),
    );
  });

  it('der heutige Tag kommt aus der Serverzeit in Europe/Berlin', () => {
    // 23:30 UTC ist in Berlin schon der nächste Tag.
    expect(deriveView(paired(), 'a', { ...ctx, now: '2026-11-11T23:30:00.000Z' }).today).toBe('2026-11-12');
  });
});
