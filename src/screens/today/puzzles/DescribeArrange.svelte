<script lang="ts">
  // Beschreiben und Anordnen. Rolle 1 (lead) sieht das Zielbild und beschreibt es, Rolle 2 (partner) hat das leere
  // Raster und einen Vorrat an Teilen und legt nach. Geprüft wird hier auf dem Gerät. Das Zielbild steht nur in
  // der Ansicht von Rolle 1 im DOM, nie in der von Rolle 2.
  import type { PuzzleRole } from '../../../../shared/puzzles/kinds.ts';
  import { type DescribeArrangeAttempt, type DescribeArrangeData, isSolved } from '../../../../shared/puzzles/describe-arrange.ts';
  import Glyph from '../../../components/Glyph.svelte';

  let {
    data,
    role,
    saved,
    onchange,
    onsolved,
  }: {
    data: DescribeArrangeData;
    role: PuzzleRole;
    /** Zuletzt gesicherter Zwischenstand dieses Rätsels auf diesem Gerät, sonst null. */
    saved: unknown;
    /** Zwischenstand sichern. */
    onchange: (value: unknown) => void;
    /** Die Eingabe stimmt. */
    onsolved: () => void;
  } = $props();

  const cells = $derived(data.cols * data.rows);
  const empty = (): DescribeArrangeAttempt => Array.from({ length: data.cols * data.rows }, () => null);
  // Nur ein Zwischenstand der richtigen Form kommt zurück; jedes Teil höchstens einmal.
  const restored = (): DescribeArrangeAttempt => {
    const fits =
      Array.isArray(saved) &&
      saved.length === data.cols * data.rows &&
      saved.every((tile) => tile === null || (Number.isInteger(tile) && tile >= 0 && tile < data.tiles.length)) &&
      new Set(saved.filter((tile) => tile !== null)).size === saved.filter((tile) => tile !== null).length;
    return fits ? [...(saved as DescribeArrangeAttempt)] : empty();
  };

  let placed = $state(restored());
  /** Das Teil aus dem Vorrat, das das nächste angetippte Feld bekommt. */
  let selected = $state<number | null>(null);
  let feedback = $state('');
  const anyPlaced = $derived(placed.some((tile) => tile !== null));

  function changed(): void {
    feedback = '';
    onchange([...placed]);
  }

  function pick(tile: number): void {
    selected = selected === tile ? null : tile;
  }

  function tapCell(cell: number): void {
    if (selected !== null) {
      // Lag das gewählte Teil schon auf einem anderen Feld, zieht es um; ein Teil auf dem Zielfeld wandert zurück in den Vorrat.
      const from = placed.indexOf(selected);
      if (from !== -1) placed[from] = null;
      placed[cell] = selected;
      selected = null;
    } else if (placed[cell] !== null) {
      placed[cell] = null;
    } else {
      return;
    }
    changed();
  }

  function clear(): void {
    placed = empty();
    selected = null;
    changed();
  }

  function check(): void {
    if (isSolved(data, placed)) onsolved();
    else feedback = 'Not quite the same yet. Compare again, square by square.';
  }
</script>

{#if role === 'lead'}
  <div class="grid" style:--cols={data.cols} role="group" aria-label="The shelf to describe" data-testid="arrange-target">
    {#each data.target as tile, cell (cell)}
      <div class="cell" data-cell={cell} data-glyph-name={tile === null ? undefined : data.tiles[tile]}>
        {#if tile !== null}<Glyph glyph={data.tiles[tile]!} label={data.tiles[tile]} />{/if}
      </div>
    {/each}
  </div>
{:else}
  <div class="grid" style:--cols={data.cols} role="group" aria-label="Your shelf" data-testid="puzzle-input">
    {#each { length: cells } as _, cell (cell)}
      {@const tile = placed[cell] ?? null}
      <button
        type="button"
        class="plain cell"
        aria-label="Square {cell + 1}: {tile === null ? 'empty' : data.tiles[tile]}"
        data-testid="arrange-cell"
        data-cell={cell}
        data-glyph-name={tile === null ? undefined : data.tiles[tile]}
        onclick={() => tapCell(cell)}
      >
        {#if tile !== null}<Glyph glyph={data.tiles[tile]!} />{/if}
      </button>
    {/each}
  </div>

  <div class="stock" role="group" aria-label="Pieces">
    {#each data.tiles as glyph, tile (tile)}
      <button
        type="button"
        class="plain piece"
        class:chosen={selected === tile}
        class:used={placed.includes(tile)}
        aria-label={glyph}
        aria-pressed={selected === tile}
        data-tile={tile}
        disabled={placed.includes(tile)}
        onclick={() => pick(tile)}
      >
        <Glyph {glyph} />
      </button>
    {/each}
  </div>

  <p class="problem" role="status" data-testid="puzzle-feedback">{feedback}</p>
  <div class="row">
    <button type="button" data-testid="puzzle-check" disabled={!anyPlaced} onclick={check}>Check the shelf</button>
    <button type="button" class="quiet" onclick={clear}>Start over</button>
  </div>
{/if}

<style>
  /* Felder höchstens 72 px, aber nie breiter, als der Platz hergibt; so bleiben fünf Spalten auf dem Telefon im Rahmen. */
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: 8px;
    width: min(100%, calc(var(--cols) * 72px + (var(--cols) - 1) * 8px));
    margin: 0;
    padding: 0;
  }

  .cell,
  .piece {
    display: grid;
    place-items: center;
    padding: 9px;
    border-radius: 12px;
    background: var(--cream);
  }

  .cell {
    aspect-ratio: 1;
    min-width: 0;
    box-shadow: inset 0 0 0 2px var(--ink-soft);
  }

  .stock {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .piece {
    width: 56px;
    height: 56px;
    box-shadow: inset 0 0 0 2px var(--cream-deep);
  }

  /* Gelegte Teile bleiben als Knopf im DOM, sind aber nicht mehr wählbar. */
  .piece.used {
    visibility: hidden;
  }

  .piece.chosen {
    box-shadow: inset 0 0 0 3px var(--petrol);
  }
</style>
