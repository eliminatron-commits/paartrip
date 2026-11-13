// Musik: drei Lieder des Nutzers, abgespielt über WebAudio (kein <audio>-Element – iOS verliert dessen Ton
// nach Sperre oder App-Wechsel ohne Fehlermeldung). Wie beim Ton (sound.ts) entsteht der AudioContext erst
// aus einer Nutzergeste und wird nach Sperre oder App-Wechsel verworfen; die nächste Geste baut ihn neu.

export type Track = 'day' | 'night' | 'pulse';
export const TRACKS: readonly Track[] = ['day', 'night', 'pulse'];

/** Ab dieser Stunde (Uhr des Geräts) läuft das Abendlied, bis NIGHT_UNTIL. */
export const NIGHT_FROM = 19;
export const NIGHT_UNTIL = 6;

/** Leise: Die Musik liegt unter den Klängen, sie soll nicht über ihnen stehen. */
export const VOLUME = 0.32;
/** Sekunden für Ein- und Ausblenden beim Start und beim Wechsel des Lieds. */
export const FADE_IN = 1.6;
export const FADE_OUT = 1.2;

/**
 * Welches Lied wohin gehört: Bei den Aufgaben (Today) "Everyday Pulse", sonst je nach Uhrzeit das Tag- oder
 * das Abendlied. Die Uhr des Geräts ist hier richtig – das ist Stimmung, keine Spielregel.
 */
export function trackFor(screen: string, hour: number): Track {
  if (screen === 'today') return 'pulse';
  return hour >= NIGHT_FROM || hour < NIGHT_UNTIL ? 'night' : 'day';
}

/** Schmale Sicht auf die Teile des AudioContext, die die Musik braucht (ein echter AudioContext passt). */
export interface MusicContext {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  createGain(): MusicGain;
  createBufferSource(): MusicSource;
  decodeAudioData(data: ArrayBuffer): Promise<MusicBuffer>;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export interface MusicBuffer {
  readonly duration: number;
}

export interface MusicGain {
  readonly gain: {
    value: number;
    setValueAtTime(value: number, when: number): unknown;
    linearRampToValueAtTime(value: number, when: number): unknown;
    cancelScheduledValues(when: number): unknown;
  };
  connect(destination: never): unknown;
}

export interface MusicSource {
  buffer: unknown;
  loop: boolean;
  connect(destination: never): unknown;
  start(when: number, offset: number): void;
  stop(when?: number): void;
}

export interface MusicPlayer {
  /** Aus jeder Nutzergeste aufrufen: baut den Kontext bei Bedarf (neu), setzt ihn fort und startet die Musik. */
  unlock(): void;
  /** Nach Bildschirmsperre oder App-Wechsel: Stelle merken, Kontext schließen. */
  suspend(): void;
  /** Das Lied, das jetzt passt. Ein Wechsel blendet über. */
  setTrack(track: Track): void;
  /** Nach dem Umschalten in den Einstellungen: ein- oder ausblenden. */
  refresh(): void;
}

interface Playing {
  track: Track;
  source: MusicSource;
  gain: MusicGain;
  /** Kontextzeit, zu der `offset` erklang. */
  startedAt: number;
  offset: number;
  duration: number;
}

/** Ohne Browser prüfbar: Kontext und Laden kommen von außen. `enabled` wird bei jedem Abgleich gefragt. */
export function createMusicPlayer(options: {
  createContext: () => MusicContext;
  /** Die Datei eines Lieds, komprimiert. Wird je Lied höchstens einmal geholt. */
  load: (track: Track) => Promise<ArrayBuffer>;
  enabled: () => boolean;
}): MusicPlayer {
  let ctx: MusicContext | null = null;
  let wanted: Track | null = null;
  let playing: Playing | null = null;
  // Jeder Abgleich bekommt eine Nummer; ein älterer, der noch auf das Entpacken wartet, gibt dann auf.
  let generation = 0;
  const files = new Map<Track, Promise<ArrayBuffer>>();
  // Entpackt hält ein Lied rund 60 MB: nur das gerade gebrauchte, und nur für den laufenden Kontext.
  let decoded: { ctx: MusicContext; track: Track; buffer: Promise<MusicBuffer> } | null = null;
  // Wo jedes Lied zuletzt stand – nach einer Sperre oder einem Bildschirmwechsel geht es dort weiter.
  const positions = new Map<Track, number>();

  function file(track: Track): Promise<ArrayBuffer> {
    let pending = files.get(track);
    if (!pending) {
      pending = options.load(track);
      // Ein Fehlschlag (kein Netz, Datei fehlt) wird beim nächsten Mal neu versucht.
      pending.catch(() => files.delete(track));
      files.set(track, pending);
    }
    return pending;
  }

  function decode(c: MusicContext, track: Track): Promise<MusicBuffer> {
    if (decoded?.ctx !== c || decoded.track !== track) {
      // decodeAudioData übernimmt den Puffer; die Kopie lässt die geholte Datei für später unberührt.
      decoded = { ctx: c, track, buffer: file(track).then((data) => c.decodeAudioData(data.slice(0))) };
    }
    return decoded.buffer;
  }

  function position(p: Playing, at: number): number {
    return p.duration > 0 ? (p.offset + Math.max(0, at - p.startedAt)) % p.duration : 0;
  }

  /** Blendet das laufende Lied aus und merkt sich seine Stelle. */
  function fadeOut(c: MusicContext): void {
    const p = playing;
    playing = null;
    if (!p) return;
    const now = c.currentTime;
    positions.set(p.track, position(p, now));
    try {
      p.gain.gain.cancelScheduledValues(now);
      p.gain.gain.setValueAtTime(p.gain.gain.value, now);
      p.gain.gain.linearRampToValueAtTime(0, now + FADE_OUT);
      p.source.stop(now + FADE_OUT + 0.05);
    } catch {
      // schon beendet
    }
  }

  function start(c: MusicContext, track: Track, buffer: MusicBuffer): void {
    const now = c.currentTime;
    const source = c.createBufferSource();
    const gain = c.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(VOLUME, now + FADE_IN);
    source.connect(gain as never);
    gain.connect(c.destination as never);
    const offset = (positions.get(track) ?? 0) % (buffer.duration || 1);
    source.start(now, offset);
    playing = { track, source, gain, startedAt: now, offset, duration: buffer.duration };
  }

  /** Bringt das, was klingt, in Einklang mit dem, was passt. Wirft nie. */
  async function sync(): Promise<void> {
    try {
      const c = ctx;
      if (!c || c.state !== 'running') return;
      const want = options.enabled() ? wanted : null;
      if (playing?.track === want) return;
      const token = ++generation;
      fadeOut(c);
      if (!want) return;
      const buffer = await decode(c, want);
      if (token !== generation || ctx !== c || c.state !== 'running') return;
      start(c, want, buffer);
    } catch {
      // Musik ist nie wichtig genug, um die App zu stören (kein Netz, Datei fehlt, kein Audio)
    }
  }

  return {
    unlock() {
      try {
        if (!ctx || ctx.state === 'closed') ctx = options.createContext();
        const c = ctx;
        // iOS meldet auch "interrupted": alles außer "running" wird fortgesetzt
        if (c.state === 'running') void sync();
        else
          void c
            .resume()
            .then(() => {
              if (ctx === c) void sync();
            })
            .catch(() => {});
      } catch {
        // keine Musik ist besser als ein Fehler in der Nutzergeste
      }
    },
    suspend() {
      const old = ctx;
      ctx = null;
      generation++;
      decoded = null;
      if (!old) return;
      if (playing) positions.set(playing.track, position(playing, old.currentTime));
      playing = null;
      try {
        old.close().catch(() => {});
      } catch {
        // Kontext ist schon weg
      }
    },
    setTrack(track) {
      if (wanted === track) return;
      wanted = track;
      void sync();
    },
    refresh() {
      void sync();
    },
  };
}

/** Verdrahtung im Browser: registriert die Ereignisse und liefert den Player. */
export function initMusic(options: { enabled: () => boolean; url: (track: Track) => string }): MusicPlayer {
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!Ctor) return { unlock() {}, suspend() {}, setTrack() {}, refresh() {} };

  // "ambient": mischt sich mit anderer Wiedergabe (Podcast, Spotify) statt sie zu beenden und schweigt beim
  // Stummschalter – wie man es von Hintergrundmusik in Spielen kennt.
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (session) {
    try {
      session.type = 'ambient';
    } catch {
      // ältere Versionen kennen die Art nicht
    }
  }

  const player = createMusicPlayer({
    createContext: () => new Ctor() as unknown as MusicContext,
    load: async (track) => {
      const response = await fetch(options.url(track));
      if (!response.ok) throw new Error(`Musik ${track}: ${response.status}`);
      return response.arrayBuffer();
    },
    enabled: options.enabled,
  });
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
