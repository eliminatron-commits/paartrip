import { describe, expect, it } from 'vitest';
import { createMusicPlayer, FADE_OUT, NIGHT_FROM, NIGHT_UNTIL, trackFor, type MusicContext, type Track, VOLUME } from './music.ts';

describe('trackFor', () => {
  it('bei den Aufgaben läuft "Everyday Pulse", zu jeder Uhrzeit', () => {
    for (let hour = 0; hour < 24; hour++) expect(trackFor('today', hour)).toBe('pulse');
  });

  it('sonst tags das Tag- und abends das Abendlied', () => {
    for (const screen of ['home', 'gifts', 'settings', 'welcome']) {
      expect(trackFor(screen, NIGHT_FROM - 1)).toBe('day');
      expect(trackFor(screen, NIGHT_FROM)).toBe('night');
      expect(trackFor(screen, 23)).toBe('night');
      expect(trackFor(screen, 0)).toBe('night');
      expect(trackFor(screen, NIGHT_UNTIL - 1)).toBe('night');
      expect(trackFor(screen, NIGHT_UNTIL)).toBe('day');
      expect(trackFor(screen, 12)).toBe('day');
    }
  });
});

/** Ein nachgebauter Kontext: hält fest, welche Quellen mit welchem Puffer und ab welcher Stelle liefen. */
class FakeContext implements MusicContext {
  state = 'suspended';
  currentTime = 0;
  destination = {};
  sources: { buffer: unknown; loop: boolean; offset: number | null; stopAt: number | null; gain: FakeGain | null }[] = [];
  gains: FakeGain[] = [];
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBufferSource() {
    const entry = { buffer: null as unknown, loop: false, offset: null as number | null, stopAt: null as number | null, gain: null as FakeGain | null };
    this.sources.push(entry);
    return {
      get buffer() {
        return entry.buffer;
      },
      set buffer(value: unknown) {
        entry.buffer = value;
      },
      get loop() {
        return entry.loop;
      },
      set loop(value: boolean) {
        entry.loop = value;
      },
      connect(target: unknown) {
        entry.gain = target as FakeGain;
      },
      start(_when: number, offset: number) {
        entry.offset = offset;
      },
      stop(when?: number) {
        entry.stopAt = when ?? 0;
      },
    };
  }
  async decodeAudioData(data: ArrayBuffer) {
    return { duration: 100, track: new TextDecoder().decode(data) };
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

class FakeGain {
  ramps: [number, number][] = [];
  gain = {
    value: 0,
    setValueAtTime: (value: number) => {
      this.gain.value = value;
    },
    linearRampToValueAtTime: (value: number, when: number) => {
      this.ramps.push([value, when]);
    },
    cancelScheduledValues: () => {},
  };
  connect() {}
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(enabled = { on: true }) {
  const contexts: FakeContext[] = [];
  const loads: Track[] = [];
  const player = createMusicPlayer({
    createContext: () => {
      const ctx = new FakeContext();
      contexts.push(ctx);
      return ctx;
    },
    load: async (track) => {
      loads.push(track);
      return new TextEncoder().encode(track).buffer as ArrayBuffer;
    },
    enabled: () => enabled.on,
  });
  const ctx = () => contexts.at(-1)!;
  /** Was gerade klingt: Quellen, die nicht gestoppt sind, mit dem Lied aus ihrem Puffer. */
  const audible = () => ctx().sources.filter((s) => s.stopAt === null).map((s) => (s.buffer as { track: Track }).track);
  return { player, contexts, loads, ctx, audible, enabled };
}

describe('createMusicPlayer', () => {
  it('ohne Nutzergeste klingt nichts; die erste Geste startet das passende Lied leise und in Schleife', async () => {
    const { player, contexts, ctx, audible } = setup();
    player.setTrack('day');
    await flush();
    expect(contexts).toHaveLength(0);

    player.unlock();
    await flush();
    expect(audible()).toEqual(['day']);
    expect(ctx().sources[0]!.loop).toBe(true);
    expect(ctx().sources[0]!.gain!.ramps.at(-1)![0]).toBe(VOLUME);
  });

  it('ein Wechsel des Lieds blendet das alte aus und das neue ein', async () => {
    const { player, ctx, audible } = setup();
    player.setTrack('day');
    player.unlock();
    await flush();
    ctx().currentTime = 30;

    player.setTrack('pulse');
    await flush();
    expect(audible()).toEqual(['pulse']);
    const old = ctx().sources[0]!;
    expect(old.gain!.ramps.at(-1)).toEqual([0, 30 + FADE_OUT]);
    expect(old.stopAt).toBeGreaterThan(30);
  });

  it('zurück beim alten Lied geht es an der Stelle weiter, an der es ausgeblendet wurde', async () => {
    const { player, ctx } = setup();
    player.setTrack('day');
    player.unlock();
    await flush();
    ctx().currentTime = 42;
    player.setTrack('pulse');
    await flush();
    ctx().currentTime = 50;
    player.setTrack('day');
    await flush();
    expect(ctx().sources.at(-1)!.offset).toBe(42);
  });

  it('ausgeschaltet blendet sie aus; eingeschaltet kommt sie wieder', async () => {
    const { player, audible, enabled } = setup();
    player.setTrack('night');
    player.unlock();
    await flush();
    expect(audible()).toEqual(['night']);

    enabled.on = false;
    player.refresh();
    await flush();
    expect(audible()).toEqual([]);

    // Auch eine weitere Geste startet sie dann nicht.
    player.unlock();
    await flush();
    expect(audible()).toEqual([]);

    enabled.on = true;
    player.refresh();
    await flush();
    expect(audible()).toEqual(['night']);
  });

  it('ist sie von Anfang an aus, wird kein Lied geholt', async () => {
    const { player, loads } = setup({ on: false });
    player.setTrack('day');
    player.unlock();
    await flush();
    expect(loads).toEqual([]);
  });

  it('nach Sperre oder App-Wechsel ist der Kontext zu; die nächste Geste baut ihn neu und spielt weiter, wo es war', async () => {
    const { player, contexts, ctx, audible } = setup();
    player.setTrack('day');
    player.unlock();
    await flush();
    ctx().currentTime = 12;

    player.suspend();
    expect(contexts[0]!.state).toBe('closed');

    player.unlock();
    await flush();
    expect(contexts).toHaveLength(2);
    expect(audible()).toEqual(['day']);
    expect(ctx().sources[0]!.offset).toBe(12);
  });

  it('jedes Lied wird nur einmal geholt, auch über mehrere Wechsel und Kontexte', async () => {
    const { player, loads } = setup();
    player.setTrack('day');
    player.unlock();
    await flush();
    player.setTrack('pulse');
    await flush();
    player.setTrack('day');
    await flush();
    player.suspend();
    player.unlock();
    await flush();
    expect(loads.sort()).toEqual(['day', 'pulse']);
  });

  it('schnelle Wechsel: am Ende klingt genau das zuletzt gewünschte Lied', async () => {
    const { player, audible } = setup();
    player.unlock();
    await flush();
    player.setTrack('day');
    player.setTrack('pulse');
    player.setTrack('night');
    await flush();
    await flush();
    expect(audible()).toEqual(['night']);
  });

  it('lässt sich ein Lied nicht holen, bleibt es still, ohne zu werfen – und der nächste Versuch holt neu', async () => {
    let fail = true;
    const loads: Track[] = [];
    const contexts: FakeContext[] = [];
    const player = createMusicPlayer({
      createContext: () => {
        const ctx = new FakeContext();
        contexts.push(ctx);
        return ctx;
      },
      load: async (track) => {
        loads.push(track);
        if (fail) throw new Error('offline');
        return new TextEncoder().encode(track).buffer as ArrayBuffer;
      },
      enabled: () => true,
    });
    player.setTrack('day');
    player.unlock();
    await flush();
    expect(contexts[0]!.sources).toHaveLength(0);

    fail = false;
    player.suspend();
    player.unlock();
    await flush();
    expect(loads).toEqual(['day', 'day']);
    expect(contexts[1]!.sources).toHaveLength(1);
  });

  it('ein Kontext ohne die nötigen Teile (kein Audio) stört nicht', async () => {
    const player = createMusicPlayer({
      createContext: () => {
        throw new Error('kein Audio');
      },
      load: async () => new ArrayBuffer(0),
      enabled: () => true,
    });
    expect(() => {
      player.setTrack('day');
      player.unlock();
      player.refresh();
      player.suspend();
    }).not.toThrow();
  });
});
