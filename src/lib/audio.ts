// Der eine Ton-Player und der eine Musik-Player der App. Ob sie spielen, entscheiden die Einstellungen
// "sound" und "music" dieses Geräts.
import { initMusic, trackFor, type MusicPlayer } from './music.ts';
import { session } from './session.svelte.ts';
import { initSound, type SoundName, type SoundPlayer } from './sound.ts';

let player: SoundPlayer | null = null;
let music: MusicPlayer | null = null;
let screen = 'home';

export function startSound(): void {
  player = initSound(() => session.settings.sound);
  music = initMusic({
    enabled: () => session.settings.music,
    url: (track) => `${import.meta.env.BASE_URL}music/${track}.m4a`,
  });
  // Um 19 und um 6 Uhr wechselt das Lied auch, wenn die App offen bleibt.
  setInterval(() => music?.setTrack(trackFor(screen, new Date().getHours())), 60_000);
}

/** Aus einem Tippen aufrufen – der Klang gehört zur Geste, nicht zur späteren Antwort des Servers. */
export function playSound(name: SoundName): void {
  player?.play(name);
}

/** Der sichtbare Bildschirm bestimmt das Lied (bei den Aufgaben ein anderes als im Haus). */
export function setMusicScreen(name: string): void {
  screen = name;
  music?.setTrack(trackFor(screen, new Date().getHours()));
}

/** Nach dem Umschalten von "Music" in den Einstellungen. */
export function refreshMusic(): void {
  music?.refresh();
}
