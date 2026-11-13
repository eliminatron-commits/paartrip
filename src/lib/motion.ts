// Übergänge der Oberfläche (Svelte-Transitions). Svelte spielt sie über die Web Animations API ab – die
// Regel für "Bewegung reduzieren" in app.css greift dort nicht, deshalb fragt jede Funktion selbst nach.
import type { TransitionConfig } from 'svelte/transition';

const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Ein Bildschirm erscheint: blendet auf und rückt ein paar Pixel nach oben. */
export function arrive(_node: Element): TransitionConfig {
  if (calm()) return { duration: 0 };
  return {
    duration: 240,
    css: (t, u) => {
      const eased = 1 - u * u * u;
      return `opacity: ${eased}; transform: translateY(${(1 - eased) * 8}px)`;
    },
  };
}

/** Bis hierhin fällt das Stück (Anteil der Dauer), danach federt es nach. */
const LANDING = 0.5;

/**
 * Ein Stück kommt ins Haus: Es sinkt aus ein paar Einheiten Höhe auf seinen Platz, staucht sich beim
 * Aufsetzen ein wenig und federt zurück. Der Drehpunkt ist die Mitte der Unterkante des Felds (Raumkoordinaten).
 */
export function settle(_node: Element, { x, y }: { x: number; y: number }): TransitionConfig {
  if (calm()) return { duration: 0 };
  return {
    duration: 620,
    css: (t) => {
      if (t < LANDING) {
        const fall = t / LANDING;
        return `opacity: ${Math.min(1, fall * 2.5)}; transform-origin: ${x}px ${y}px; transform: translateY(${-14 * (1 - fall * fall)}px)`;
      }
      const after = (t - LANDING) / (1 - LANDING);
      const squash = Math.sin(after * Math.PI) * (1 - after * 0.6);
      return `transform-origin: ${x}px ${y}px; transform: scale(${1 + 0.05 * squash}, ${1 - 0.08 * squash})`;
    },
  };
}

/** Beim Aufsetzen wirbelt ein Hauch Staub auf: ein heller Ring am Boden, der sich weitet und verfliegt. */
export function puff(_node: Element, { x, y }: { x: number; y: number }): TransitionConfig {
  if (calm()) return { duration: 0 };
  return {
    delay: 620 * LANDING - 40,
    duration: 520,
    css: (t) => `transform-origin: ${x}px ${y}px; transform: scale(${0.5 + t * 0.8}); opacity: ${0.55 * (1 - t) * Math.min(1, t * 6)}`,
  };
}
