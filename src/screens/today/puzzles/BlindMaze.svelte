<script lang="ts">
  // Wegweiser. Rolle 1 (lead) sieht das Labyrinth und sagt den Weg an. Rolle 2 (partner) steuert blind: leeres
  // Raster, Start, Ziel und die eigene Spur – an Wänden hält nichts an und nichts meldet sich. Erst am Ziel
  // wird geprüft, ob der Weg sauber war; sonst geht es zurück zum Start. Geprüft wird auf dem Gerät des Steuernden.
  import type { PuzzleRole } from '../../../../shared/puzzles/kinds.ts';
  import { type BlindMazeData, goalCell, isSolved, type Move, MOVES, mazeSize, startCell, stepFrom, walk } from '../../../../shared/puzzles/blind-maze.ts';
  import Glyph from '../../../components/Glyph.svelte';

  let {
    data,
    role,
    saved,
    onchange,
    onsolved,
  }: {
    data: BlindMazeData;
    role: PuzzleRole;
    /** Zuletzt gesicherter Zwischenstand dieses Rätsels auf diesem Gerät, sonst null. */
    saved: unknown;
    /** Zwischenstand sichern. */
    onchange: (value: unknown) => void;
    /** Die Eingabe stimmt. */
    onsolved: () => void;
  } = $props();

  const LOST = 'You walked through a wall somewhere. Back to the start – ask for the way again.';
  const LABELS: Record<Move, string> = { up: 'Up', right: 'Right', down: 'Down', left: 'Left' };
  // Lage der vier Knöpfe im 3 × 3-Raster und Drehung des Pfeils (er zeigt nach oben gezeichnet).
  const PAD: Record<Move, { row: number; col: number; turn: number }> = {
    up: { row: 1, col: 2, turn: 0 },
    left: { row: 2, col: 1, turn: 270 },
    right: { row: 2, col: 3, turn: 90 },
    down: { row: 3, col: 2, turn: 180 },
  };

  const size = $derived(mazeSize(data));
  const start = $derived(startCell(data));
  const goal = $derived(goalCell(data));
  const cells = $derived(Array.from({ length: size.rows * size.cols }, (_, index) => ({ row: Math.floor(index / size.cols), col: index % size.cols })));

  // Nur Schritte übernehmen, die im Raster bleiben – so zählt ein gesicherter Stand genauso wie ein gegangener.
  function restored(): Move[] {
    if (!Array.isArray(saved)) return [];
    const kept: Move[] = [];
    let at = startCell(data);
    for (const move of saved) {
      if (!(MOVES as unknown[]).includes(move)) return [];
      const next = stepFrom(data, at, move as Move);
      if (!next) continue;
      kept.push(move as Move);
      at = next;
    }
    return kept;
  }

  let moves = $state(restored());
  let feedback = $state('');

  const path = $derived(walk(data, moves).path);
  const here = $derived(path[path.length - 1] ?? start);
  const visited = $derived(new Set(path.map((cell) => `${cell.row},${cell.col}`)));

  function save(next: Move[]): void {
    moves = next;
    onchange([...next]);
  }

  function step(move: Move): void {
    const next = stepFrom(data, here, move);
    if (!next) return;
    const attempt = [...moves, move];
    feedback = '';
    if (next.row !== goal.row || next.col !== goal.col) return save(attempt);
    if (isSolved(data, attempt)) {
      save(attempt);
      onsolved();
    } else {
      save([]);
      feedback = LOST;
    }
  }

  function stepBack(): void {
    feedback = '';
    save(moves.slice(0, -1));
  }

  function restart(): void {
    feedback = '';
    save([]);
  }

  const is = (a: { row: number; col: number }, b: { row: number; col: number }) => a.row === b.row && a.col === b.col;
</script>

{#snippet legend(you: boolean)}
  <ul class="legend">
    <li><span class="swatch"><span class="marker"></span></span> Start</li>
    <li><span class="swatch"><Glyph glyph="house" /></span> Door</li>
    {#if you}<li><span class="swatch"><span class="here"></span></span> You</li>{/if}
  </ul>
{/snippet}

{#if role === 'lead'}
  <div
    class="grid"
    style="--cols: {size.cols}"
    role="img"
    aria-label="The maze, {size.rows} rows by {size.cols} columns. Dark squares are walls, light squares are open."
    data-testid="maze-map"
  >
    {#each cells as cell (`${cell.row},${cell.col}`)}
      {@const wall = data.maze[cell.row]?.[cell.col] === '#'}
      <div class="cell" class:solid={wall} data-cell="{cell.row},{cell.col}" data-wall={wall ? 'true' : 'false'}>
        {#if is(cell, start)}<span class="marker"></span>{:else if is(cell, goal)}<span class="door"><Glyph glyph="house" /></span>{/if}
      </div>
    {/each}
  </div>
  {@render legend(false)}
{:else}
  <div
    class="grid"
    style="--cols: {size.cols}"
    role="img"
    aria-label="Blank grid, {size.rows} rows by {size.cols} columns. You are at row {here.row + 1}, column {here.col + 1}."
    data-testid="maze-board"
  >
    {#each cells as cell (`${cell.row},${cell.col}`)}
      {@const isHere = is(cell, here)}
      <div class="cell" data-cell="{cell.row},{cell.col}" data-here={isHere ? 'true' : undefined}>
        {#if is(cell, start)}<span class="marker"></span>{:else if is(cell, goal)}<span class="door"><Glyph glyph="house" /></span>{/if}
        {#if isHere}<span class="here"></span>{:else if visited.has(`${cell.row},${cell.col}`)}<span class="trail"></span>{/if}
      </div>
    {/each}
  </div>
  {@render legend(true)}

  <div class="controls" data-testid="puzzle-input">
    <div class="pad">
      {#each MOVES as move (move)}
        <button
          type="button"
          class="arrow"
          aria-label={LABELS[move]}
          data-move={move}
          style="grid-row: {PAD[move].row}; grid-column: {PAD[move].col}"
          onclick={() => step(move)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" style="transform: rotate({PAD[move].turn}deg)"><path d="M12 4l8 9h-5v7H9v-7H4z" fill="currentColor" /></svg>
        </button>
      {/each}
    </div>
    <div class="row">
      <button type="button" class="quiet" disabled={moves.length === 0} onclick={stepBack}>Step back</button>
      <button type="button" class="quiet" onclick={restart}>Back to start</button>
    </div>
  </div>

  <p class="problem" role="status" data-testid="puzzle-feedback">{feedback}</p>
{/if}

<style>
  /* Höchstens 44 px je Feld, nie breiter als der Platz; die Felder sind nicht antippbar. */
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: 2px;
    width: min(100%, calc(var(--cols) * 44px));
    margin-inline: auto;
  }

  .cell {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    border-radius: 4px;
    background: var(--cream);
  }

  .cell.solid {
    background: var(--petrol);
  }

  .marker {
    width: 62%;
    height: 62%;
    border-radius: 50%;
    background: var(--terracotta);
  }

  .door {
    width: 74%;
    height: 74%;
  }

  /* Spur und Position liegen über Start und Ziel. */
  .trail,
  .here {
    position: absolute;
    border-radius: 50%;
  }

  .trail {
    width: 22%;
    height: 22%;
    background: var(--ink-soft);
  }

  .here {
    width: 46%;
    height: 46%;
    background: var(--petrol);
    box-shadow: 0 0 0 3px var(--cream);
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px 18px;
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink-soft);
    font-size: 0.95rem;
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .swatch {
    position: relative;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    background: var(--cream);
  }

  .swatch .marker {
    width: 70%;
    height: 70%;
  }

  .swatch .here {
    width: 55%;
    height: 55%;
    box-shadow: none;
  }

  .controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }

  .pad {
    display: grid;
    grid-template-columns: repeat(3, 56px);
    grid-template-rows: repeat(3, 56px);
    gap: 6px;
  }

  .arrow {
    display: grid;
    place-items: center;
    min-width: 48px;
    min-height: 48px;
    padding: 0;
    border-radius: 14px;
  }

  .arrow svg {
    width: 28px;
    height: 28px;
  }
</style>
