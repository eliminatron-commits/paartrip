// Ton: drei kurze, synthetische Klänge über WebAudio (kein <audio>, keine Audiodateien).
// iOS beendet oder unterbricht den AudioContext ohne Vorwarnung: Er wird bei jeder Nutzergeste
// neu gebaut bzw. fortgesetzt und nach Sperre oder App-Wechsel verworfen.

export type SoundName = 'place' | 'solve' | 'reveal';

/** Ein Ton eines Klangs. Zeiten in Sekunden, `start` relativ zum Beginn des Klangs. */
export interface Tone {
  frequency: number;
  start: number;
  duration: number;
  wave: 'sine' | 'triangle';
  /** Spitzen-Gain */
  gain: number;
}

// Warm statt piepsig: nur sine/triangle, alle Frequenzen unter 1500 Hz, Spitzen-Gain höchstens 0.2.
export const SOUNDS: Record<SoundName, Tone[]> = {
  // weiches, kurzes "Tock"
  place: [{ frequency: 220, start: 0, duration: 0.13, wave: 'triangle', gain: 0.18 }],
  // zwei aufsteigende Töne (Quinte)
  solve: [
    { frequency: 392, start: 0, duration: 0.18, wave: 'sine', gain: 0.15 },
    { frequency: 587, start: 0.14, duration: 0.24, wave: 'sine', gain: 0.15 },
  ],
  // sanftes Dur-Dreiklang-Arpeggio
  reveal: [
    { frequency: 330, start: 0, duration: 0.3, wave: 'sine', gain: 0.13 },
    { frequency: 415, start: 0.16, duration: 0.3, wave: 'sine', gain: 0.13 },
    { frequency: 494, start: 0.32, duration: 0.3, wave: 'sine', gain: 0.13 },
    { frequency: 659, start: 0.48, duration: 0.28, wave: 'triangle', gain: 0.12 },
  ],
};

/** Kurzes Einschwingen gegen Knacken. */
const ATTACK = 0.012;

/** Läuft der Kontext erst nach dieser Zeit, wird ein wartender Klang nicht mehr gespielt. */
const LATE_MS = 500;

/** Schmale Sicht auf die Teile des AudioContext, die das Modul braucht (ein echter AudioContext passt). */
export interface SoundContext {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  createOscillator(): SoundOscillator;
  createGain(): SoundGain;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export interface SoundOscillator {
  type: OscillatorType;
  readonly frequency: { value: number };
  connect(destination: never): unknown;
  start(when: number): void;
  stop(when: number): void;
}

export interface SoundGain {
  readonly gain: {
    setValueAtTime(value: number, when: number): unknown;
    linearRampToValueAtTime(value: number, when: number): unknown;
  };
  connect(destination: never): unknown;
}

export interface SoundPlayer {
  /** Aus jeder Nutzergeste aufrufen: baut den AudioContext bei Bedarf (neu) und setzt ihn fort. */
  unlock(): void;
  /** Nach Bildschirmsperre oder App-Wechsel: Kontext schließen und verwerfen; die nächste Geste baut ihn neu. */
  suspend(): void;
  /** Spielt den Klang, wenn Ton eingeschaltet ist und der Kontext läuft; sonst geschieht nichts. Wirft nie. */
  play(name: SoundName): void;
}

/** Plant alle Töne eines Klangs mit sanfter Hüllkurve auf dem Kontext ein. */
export function scheduleSound(ctx: SoundContext, tones: readonly Tone[]): void {
  const now = ctx.currentTime;
  for (const tone of tones) {
    const begin = now + tone.start;
    const end = begin + tone.duration;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = tone.wave;
    osc.frequency.value = tone.frequency;
    amp.gain.setValueAtTime(0, begin);
    amp.gain.linearRampToValueAtTime(tone.gain, begin + ATTACK);
    amp.gain.linearRampToValueAtTime(0, end);
    osc.connect(amp as never);
    amp.connect(ctx.destination as never);
    osc.start(begin);
    osc.stop(end + 0.02);
  }
}

/** Ohne Browser prüfbar: der Kontext kommt von außen. `enabled` wird bei jedem play() gefragt. */
export function createSoundPlayer(options: {
  createContext: () => SoundContext;
  enabled: () => boolean;
}): SoundPlayer {
  let ctx: SoundContext | null = null;
  // Läuft gerade ein resume() aus einer Nutzergeste? Ein frisch gebauter Kontext läuft auf iOS erst einen
  // Moment später – der Klang derselben Geste (Antippen eines Platzes) soll trotzdem kommen.
  let resuming: { done: Promise<void>; since: number } | null = null;

  return {
    unlock() {
      try {
        if (!ctx || ctx.state === 'closed') ctx = options.createContext();
        // iOS meldet auch "interrupted": alles außer "running" wird fortgesetzt
        if (ctx.state !== 'running') {
          const pending = { done: ctx.resume().catch(() => {}), since: Date.now() };
          resuming = pending;
          void pending.done.then(() => {
            if (resuming === pending) resuming = null;
          });
        }
      } catch {
        // kein Ton ist besser als ein Fehler in der Nutzergeste
      }
    },
    suspend() {
      const old = ctx;
      ctx = null;
      resuming = null;
      if (!old) return;
      try {
        old.close().catch(() => {});
      } catch {
        // Kontext ist schon weg
      }
    },
    play(name) {
      try {
        if (!options.enabled() || !ctx) return;
        if (ctx.state === 'running') {
          scheduleSound(ctx, SOUNDS[name]);
          return;
        }
        // Nicht nachholen – außer der Kontext wird gerade aus dieser Geste fortgesetzt. Kommt er erst
        // deutlich später in Gang, passt der Klang zu nichts mehr und bleibt aus.
        const current = ctx;
        const pending = resuming;
        if (!pending) return;
        void pending.done.then(() => {
          try {
            if (ctx === current && current.state === 'running' && Date.now() - pending.since < LATE_MS) scheduleSound(current, SOUNDS[name]);
          } catch {
            // wie unten
          }
        });
      } catch {
        // Ton ist nie wichtig genug, um die App zu stören
      }
    },
  };
}

/** Verdrahtung im Browser: registriert die Ereignisse und liefert den Player. */
export function initSound(enabled: () => boolean): SoundPlayer {
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!Ctor) {
    return { unlock() {}, suspend() {}, play() {} };
  }

  const player = createSoundPlayer({ createContext: () => new Ctor(), enabled });
  const listen = { capture: true, passive: true } as const;
  const unlock = () => player.unlock();

  for (const type of ['pointerdown', 'touchend', 'keydown'] as const) {
    document.addEventListener(type, unlock, listen);
  }
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') player.suspend();
    },
    listen,
  );
  window.addEventListener('pagehide', () => player.suspend());

  return player;
}
