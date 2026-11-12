import { describe, expect, it } from 'vitest';
import {
  SOUNDS,
  createSoundPlayer,
  type SoundContext,
  type SoundName,
  type SoundOscillator,
} from './sound.ts';

const NAMES = Object.keys(SOUNDS) as SoundName[];

/** Kleiner Fake-Kontext: protokolliert Oszillatoren, Zustand von außen steuerbar. */
class FakeContext implements SoundContext {
  state = 'running';
  currentTime = 5;
  destination = {};
  oscillators: { type: string; frequency: number; started: number[]; stopped: number[] }[] = [];
  resumeCalls = 0;
  closeCalls = 0;
  throwOnCreate = false;

  createOscillator(): SoundOscillator {
    if (this.throwOnCreate) throw new Error('kein Knoten mehr');
    const record = { type: '', frequency: 0, started: [] as number[], stopped: [] as number[] };
    this.oscillators.push(record);
    return {
      set type(value: OscillatorType) {
        record.type = value;
      },
      get type() {
        return record.type as OscillatorType;
      },
      frequency: {
        set value(v: number) {
          record.frequency = v;
        },
        get value() {
          return record.frequency;
        },
      },
      connect: () => undefined,
      start: (when) => void record.started.push(when),
      stop: (when) => void record.stopped.push(when),
    };
  }

  createGain() {
    return {
      gain: { setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined },
      connect: () => undefined,
    };
  }

  resume() {
    this.resumeCalls++;
    return Promise.resolve();
  }

  close() {
    this.closeCalls++;
    this.state = 'closed';
    return Promise.resolve();
  }
}

function setup(enabled = true) {
  const contexts: FakeContext[] = [];
  const flag = { on: enabled };
  const player = createSoundPlayer({
    createContext: () => {
      const ctx = new FakeContext();
      contexts.push(ctx);
      return ctx;
    },
    enabled: () => flag.on,
  });
  return { player, contexts, flag };
}

describe('createSoundPlayer', () => {
  it('bei ausgeschaltetem Ton legt play() keinen Oszillator an', () => {
    const { player, contexts } = setup(false);
    player.unlock();
    for (const name of NAMES) player.play(name);
    expect(contexts[0]?.oscillators).toEqual([]);
  });

  it('der Schalter wird bei jedem play() neu gefragt', () => {
    const { player, contexts, flag } = setup(false);
    player.unlock();
    player.play('place');
    expect(contexts[0]?.oscillators).toHaveLength(0);
    flag.on = true;
    player.play('place');
    expect(contexts[0]?.oscillators).toHaveLength(SOUNDS.place.length);
  });

  it('bei eingeschaltetem Ton wird je Ton der Definition ein Oszillator gestartet und gestoppt', () => {
    for (const name of NAMES) {
      const { player, contexts } = setup();
      player.unlock();
      player.play(name);
      const ctx = contexts[0]!;
      expect(ctx.oscillators).toHaveLength(SOUNDS[name].length);
      SOUNDS[name].forEach((tone, i) => {
        const osc = ctx.oscillators[i]!;
        expect(osc.frequency).toBe(tone.frequency);
        expect(osc.type).toBe(tone.wave);
        expect(osc.started).toEqual([ctx.currentTime + tone.start]);
        expect(osc.stopped).toHaveLength(1);
        expect(osc.stopped[0]!).toBeGreaterThan(ctx.currentTime + tone.start + tone.duration - 1e-9);
      });
    }
  });

  it('ohne unlock() gibt es keinen Kontext, play() tut nichts', () => {
    const { player, contexts } = setup();
    player.play('solve');
    expect(contexts).toHaveLength(0);
  });

  it('ein Kontext, der nicht läuft (suspended / interrupted), spielt nichts; unlock() setzt ihn fort', () => {
    for (const state of ['suspended', 'interrupted']) {
      const { player, contexts } = setup();
      player.unlock();
      const ctx = contexts[0]!;
      ctx.state = state;
      player.play('reveal');
      expect(ctx.oscillators).toHaveLength(0);
      const before = ctx.resumeCalls;
      player.unlock();
      expect(ctx.resumeCalls).toBe(before + 1);
    }
  });

  it('ein frisch gebauter Kontext, der erst nach resume() läuft, spielt den Klang derselben Geste', async () => {
    // So verhält sich iOS: Der neue Kontext ist zunächst "suspended" und läuft erst, wenn resume() fertig ist.
    const contexts: FakeContext[] = [];
    const player = createSoundPlayer({
      createContext: () => {
        const ctx = new FakeContext();
        ctx.state = 'suspended';
        ctx.resume = () =>
          Promise.resolve().then(() => {
            ctx.state = 'running';
          });
        contexts.push(ctx);
        return ctx;
      },
      enabled: () => true,
    });
    player.unlock();
    player.play('place');
    expect(contexts[0]!.oscillators).toHaveLength(0);
    await new Promise((done) => setTimeout(done, 0));
    expect(contexts[0]!.oscillators).toHaveLength(SOUNDS.place.length);
  });

  it('wird der Kontext vor dem Fortsetzen verworfen, bleibt der wartende Klang aus', async () => {
    const contexts: FakeContext[] = [];
    const player = createSoundPlayer({
      createContext: () => {
        const ctx = new FakeContext();
        ctx.state = 'suspended';
        ctx.resume = () =>
          Promise.resolve().then(() => {
            ctx.state = 'running';
          });
        contexts.push(ctx);
        return ctx;
      },
      enabled: () => true,
    });
    player.unlock();
    player.play('place');
    player.suspend();
    await new Promise((done) => setTimeout(done, 0));
    expect(contexts[0]!.oscillators).toHaveLength(0);
  });

  it('ein laufender Kontext wird bei unlock() nicht erneut fortgesetzt', () => {
    const { player, contexts } = setup();
    player.unlock();
    player.unlock();
    expect(contexts[0]!.resumeCalls).toBe(0);
  });

  it('ein abgelehntes resume() wird verschluckt', async () => {
    const { player, contexts } = setup();
    player.unlock();
    const ctx = contexts[0]!;
    ctx.state = 'suspended';
    ctx.resume = () => Promise.reject(new Error('nicht erlaubt'));
    expect(() => player.unlock()).not.toThrow();
    await Promise.resolve();
  });

  it('unlock() baut den Kontext nur einmal', () => {
    const { player, contexts } = setup();
    player.unlock();
    player.unlock();
    player.unlock();
    expect(contexts).toHaveLength(1);
  });

  it('nach suspend() schließt der alte Kontext und die nächste unlock() baut einen neuen', () => {
    const { player, contexts } = setup();
    player.unlock();
    player.suspend();
    expect(contexts[0]!.closeCalls).toBe(1);
    player.play('place');
    expect(contexts[0]!.oscillators).toHaveLength(0);
    player.unlock();
    expect(contexts).toHaveLength(2);
    player.play('place');
    expect(contexts[1]!.oscillators).toHaveLength(SOUNDS.place.length);
  });

  it('ein von iOS geschlossener Kontext wird bei unlock() ersetzt', () => {
    const { player, contexts } = setup();
    player.unlock();
    contexts[0]!.state = 'closed';
    player.unlock();
    expect(contexts).toHaveLength(2);
  });

  it('ein fehlschlagendes close() wird verschluckt', () => {
    const { player, contexts } = setup();
    player.unlock();
    contexts[0]!.close = () => Promise.reject(new Error('schon zu'));
    expect(() => player.suspend()).not.toThrow();
  });

  it('play() wirft nicht, wenn der Kontext beim Anlegen von Knoten einen Fehler wirft', () => {
    const { player, contexts } = setup();
    player.unlock();
    contexts[0]!.throwOnCreate = true;
    for (const name of NAMES) expect(() => player.play(name)).not.toThrow();
  });

  it('play() wirft nicht, wenn enabled() einen Fehler wirft', () => {
    const player = createSoundPlayer({
      createContext: () => new FakeContext(),
      enabled: () => {
        throw new Error('kaputt');
      },
    });
    player.unlock();
    expect(() => player.play('place')).not.toThrow();
  });
});

describe('SOUNDS', () => {
  it('jeder Klang ist kürzer als eine Sekunde', () => {
    for (const name of NAMES) {
      const end = Math.max(...SOUNDS[name].map((t) => t.start + t.duration));
      expect(end, name).toBeLessThan(1);
    }
  });

  it('kein Ton ist lauter als Gain 0.2, höher als 1500 Hz oder nicht sine/triangle', () => {
    for (const name of NAMES) {
      expect(SOUNDS[name].length, name).toBeGreaterThan(0);
      for (const tone of SOUNDS[name]) {
        expect(tone.gain, name).toBeGreaterThan(0);
        expect(tone.gain, name).toBeLessThanOrEqual(0.2);
        expect(tone.frequency, name).toBeLessThanOrEqual(1500);
        expect(['sine', 'triangle'], name).toContain(tone.wave);
      }
    }
  });
});
