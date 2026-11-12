// Der eine Ton-Player der App. Ob er spielt, entscheidet die Einstellung "sound" dieses Geräts.
import { session } from './session.svelte.ts';
import { initSound, type SoundName, type SoundPlayer } from './sound.ts';

let player: SoundPlayer | null = null;

export function startSound(): void {
  player = initSound(() => session.settings.sound);
}

/** Aus einem Tippen aufrufen – der Klang gehört zur Geste, nicht zur späteren Antwort des Servers. */
export function playSound(name: SoundName): void {
  player?.play(name);
}
