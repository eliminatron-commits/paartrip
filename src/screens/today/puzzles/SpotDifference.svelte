<script lang="ts">
  // Zwei Bilder vergleichen. Beide Rollen sehen dasselbe Regal, aber nur die eigene Fassung, und markieren
  // die Felder, die ihrer Meinung nach abweichen. Geprüft wird hier auf dem Gerät; wer die richtigen Felder
  // markiert hat, schließt das Rätsel ab. Beim Antippen gibt es absichtlich keine Rückmeldung je Feld,
  // sonst ließe sich alles durch Probieren lösen.
  import type { PuzzleRole } from '../../../../shared/puzzles/kinds.ts';
  import { isSolved, type SpotDifferenceData, versionFor } from '../../../../shared/puzzles/spot-difference.ts';
  import Glyph from '../../../components/Glyph.svelte';

  let {
    data,
    role,
    saved,
    onchange,
    onsolved,
  }: {
    data: SpotDifferenceData;
    role: PuzzleRole;
    /** Zuletzt gesicherter Zwischenstand dieses Rätsels auf diesem Gerät, sonst null. */
    saved: unknown;
    /** Zwischenstand sichern. */
    onchange: (value: unknown) => void;
    /** Die Eingabe stimmt. */
    onsolved: () => void;
  } = $props();

  // Nur die eigene Fassung wird abgeleitet; die der anderen Rolle kommt nie in die Oberfläche.
  const version = $derived(versionFor(data, role));

  const restored = (): number[] => {
    const cells = data.cols * data.rows;
    const fits = Array.isArray(saved) && saved.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < cells);
    return fits ? [...new Set(saved as number[])] : [];
  };

  let marked = $state<number[]>(restored());
  let feedback = $state('');

  function toggle(cell: number): void {
    marked = marked.includes(cell) ? marked.filter((c) => c !== cell) : [...marked, cell];
    feedback = '';
    onchange([...marked]);
  }

  function clear(): void {
    marked = [];
    feedback = '';
    onchange([]);
  }

  function check(): void {
    if (isSolved(data, marked)) onsolved();
    else feedback = 'Not all of them yet – or one too many. Compare again.';
  }
</script>


<div class="shelf" role="group" aria-label="Your shelf" style:--cols={data.cols} data-testid="puzzle-input">
  {#each version as glyph, cell (cell)}
    {@const on = marked.includes(cell)}
    <button
      type="button"
      class="plain spot"
      class:on
      aria-label="Row {Math.floor(cell / data.cols) + 1}, column {(cell % data.cols) + 1}: {glyph ?? 'empty'}"
      aria-pressed={on}
      data-testid="spot-cell"
      data-cell={cell}
      data-glyph-name={glyph ?? undefined}
      onclick={() => toggle(cell)}
    >
      {#if glyph}<Glyph {glyph} />{/if}
      {#if on}
        <!-- Häkchen neben dem Ring, damit die Markierung nicht allein an der Farbe hängt. -->
        <svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
      {/if}
    </button>
  {/each}
</div>

<p class="problem" role="status" data-testid="puzzle-feedback">{feedback}</p>
<div class="row">
  <button type="button" data-testid="puzzle-check" disabled={marked.length === 0} onclick={check}>Check</button>
  <button type="button" class="quiet" onclick={clear}>Clear</button>
</div>

<style>
  /* Felder wachsen bis 72 px, schrumpfen aber mit dem Platz; so bleibt das Raster nie breiter als die Seite. */
  .shelf {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: 8px;
    width: 100%;
    max-width: calc(var(--cols) * 72px + (var(--cols) - 1) * 8px);
    margin: 0 auto;
  }

  .spot {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    min-width: 0;
    padding: 10px;
    border-radius: 12px;
    background: var(--cream);
    box-shadow: inset 0 0 0 2px var(--ink-soft);
  }

  .spot.on {
    box-shadow: inset 0 0 0 5px var(--petrol);
  }

  .mark {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 20px;
    height: 20px;
    padding: 3px;
    border-radius: 50%;
    background: var(--petrol);
    color: var(--cream);
  }
</style>
