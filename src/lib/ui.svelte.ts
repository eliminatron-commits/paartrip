// Zustand der Oberfläche, der nicht zum Spielstand gehört: welcher Bildschirm offen ist und ob gerade
// ein Stück auf seinen Platz wartet. Geht beim Schließen der App verloren – das ist gewollt.

export type Tab = 'home' | 'today' | 'gifts';

/** Ein Stück sucht einen Platz: aus einem Bauzug oder beim Umstellen (auch das Dekostück aus einem Geschenk). */
export type Placing = { kind: 'turn'; turn: number; pieceId: string } | { kind: 'move'; pieceId: string };

export const ui = $state<{ tab: Tab; settings: boolean; placing: Placing | null }>({ tab: 'home', settings: false, placing: null });

export function go(tab: Tab): void {
  ui.tab = tab;
  ui.settings = false;
  if (tab !== 'home') ui.placing = null;
}

/** Wechselt ins Haus und lässt dort die passenden freien Plätze aufleuchten. */
export function startPlacing(placing: Placing): void {
  ui.placing = placing;
  ui.tab = 'home';
  ui.settings = false;
}
