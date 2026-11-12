<script lang="ts">
  // Karte und Legende. Rolle 1 (lead) sieht den Grundriss mit Zeichen ohne Namen und tippt das Versteck an,
  // Rolle 2 hat die Legende und die Hinweise. Namen und Hinweise stehen nur in der Ansicht von Rolle 2 im DOM;
  // geprüft wird hier auf dem Gerät von Rolle 1.
  import type { PuzzleRole } from '../../../../shared/puzzles/kinds.ts';
  import { isSolved, type MapLegendData, planCells } from '../../../../shared/puzzles/map-legend.ts';
  import Glyph from '../../../components/Glyph.svelte';

  let {
    data,
    role,
    saved,
    onchange,
    onsolved,
  }: {
    data: MapLegendData;
    role: PuzzleRole;
    /** Zuletzt gesicherter Zwischenstand dieses Rätsels auf diesem Gerät, sonst null. */
    saved: unknown;
    /** Zwischenstand sichern. */
    onchange: (value: unknown) => void;
    /** Die Eingabe stimmt. */
    onsolved: () => void;
  } = $props();

  const cells = $derived(planCells(data));
  const columns = $derived(data.plan[0]?.length ?? 1);
  const glyphOf = (key: string) => data.landmarks.find((landmark) => landmark.key === key)?.glyph;
  const spotKeys = $derived(cells.flat().flatMap((cell) => (cell.kind === 'spot' ? cell.key : [])));

  // Nur ein Versteck, das es im Grundriss gibt, gilt als gesicherter Stand; alles andere beginnt leer.
  const restored = (): string | null => (typeof saved === 'string' && spotKeys.includes(saved) ? saved : null);

  let chosen = $state<string | null>(restored());
  let feedback = $state('');

  function choose(key: string): void {
    chosen = key;
    feedback = '';
    onchange(key);
  }

  function check(): void {
    if (chosen !== null && isSolved(data, chosen)) onsolved();
    else feedback = 'Nothing here. Ask for another clue and try a different spot.';
  }
</script>

{#if role === 'lead'}
  <div class="plan" role="group" aria-label="Floor plan" style:--columns={columns} style:--max-width="{columns * 56}px" data-testid="puzzle-input">
    {#each cells as row, y (y)}
      {#each row as cell, x (x)}
        {#if cell.kind === 'wall'}
          <div class="cell wall"></div>
        {:else if cell.kind === 'floor'}
          <div class="cell floor"></div>
        {:else if cell.kind === 'landmark'}
          <div class="cell floor sign">{#if glyphOf(cell.key)}<Glyph glyph={glyphOf(cell.key)!} />{/if}</div>
        {:else if cell.kind === 'spot'}
          <button
            type="button"
            class="plain cell spot"
            class:chosen={chosen === cell.key}
            aria-label="Hiding place, row {y + 1}, column {x + 1}"
            aria-pressed={chosen === cell.key}
            data-spot={cell.key}
            onclick={() => choose(cell.key)}
          >
            ?
          </button>
        {/if}
      {/each}
    {/each}
  </div>

  <p class="problem" role="status" data-testid="puzzle-feedback">{feedback}</p>
  <div class="row">
    <button type="button" data-testid="puzzle-check" disabled={chosen === null} onclick={check}>Look here</button>
  </div>
{:else}
  <p class="note">What the symbols on the floor plan stand for:</p>
  <ul class="legend" data-testid="map-legend">
    {#each data.landmarks as landmark (landmark.key)}
      <li data-landmark={landmark.key}>
        <span class="icon"><Glyph glyph={landmark.glyph} /></span>
        <span>{landmark.name}</span>
      </li>
    {/each}
  </ul>

  <p class="note">The clues:</p>
  <ul class="clues" data-testid="map-clues">
    {#each data.clues as clue, index (index)}
      <li>{clue}</li>
    {/each}
  </ul>
{/if}

<style>
  /* Quadratische Felder; die Breite wächst mit den Spalten, bleibt aber im verfügbaren Platz. */
  .plan {
    display: grid;
    grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
    gap: 1px;
    width: min(100%, var(--max-width));
    margin: 0 auto;
  }

  .cell {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border-radius: 0;
  }

  .wall {
    background: var(--petrol);
  }

  .floor {
    background: var(--cream);
  }

  .sign {
    padding: 14%;
  }

  /* Antippbare Felder: das Fragezeichen markiert sie, der Rand trennt sie vom Boden. */
  .spot {
    background: var(--cream);
    color: var(--terracotta);
    font-size: 1.1rem;
    font-weight: 700;
    box-shadow: inset 0 0 0 2px var(--terracotta);
  }

  .spot.chosen {
    background: var(--terracotta);
    color: var(--cream);
  }

  .legend,
  .clues {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
  }

  .legend {
    padding: 0;
    list-style: none;
  }

  .clues {
    padding-left: 1.4em;
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .icon {
    flex: none;
    width: 36px;
    height: 36px;
    padding: 4px;
    border-radius: 10px;
    background: var(--cream);
  }
</style>
