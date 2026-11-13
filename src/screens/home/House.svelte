<script lang="ts">
  // Das Haus im Querschnitt: Dach (chapter.roof), Galerie der Erinnerungsstücke, die Räume des Kapitels von oben nach unten,
  // darunter, was draußen liegt. Sucht ein Stück seinen Platz (ui.placing), leuchten die passenden freien
  // Plätze; sonst lässt sich ein platziertes Stück antippen und umstellen.
  import type { Chapter } from '../../../shared/content-schema.ts';
  import type { HouseView } from '../../../shared/model.ts';
  import { freeSpotsFor, moveSpotsFor } from '../../../shared/rules.ts';
  import PieceArt from '../../components/PieceArt.svelte';
  import { playSound } from '../../lib/audio.ts';
  import { pieceMap } from '../../lib/house.ts';
  import { dispatch } from '../../lib/session.svelte.ts';
  import { ui } from '../../lib/ui.svelte.ts';
  import MemoryWall from './MemoryWall.svelte';
  import RoomView from './RoomView.svelte';

  let { view, chapter }: { view: HouseView; chapter: Chapter } = $props();

  const pieces = $derived(pieceMap(chapter));
  const placed = $derived(new Map(view.placements.flatMap((p) => (pieces.has(p.pieceId) ? [[p.spotId, pieces.get(p.pieceId)!] as const] : []))));
  const indoor = $derived(chapter.rooms.filter((room) => !room.outdoor));
  const outdoor = $derived(chapter.rooms.filter((room) => room.outdoor));

  const placing = $derived(ui.placing ? (pieces.get(ui.placing.pieceId) ?? null) : null);
  // Aus einem Bauzug darf das Stück auf jeden passenden freien Platz; beim Umstellen hat der offene Bauzug Vorrang.
  const targets = $derived.by(() => {
    if (!placing || !ui.placing) return new Set<string>();
    const spots = ui.placing.kind === 'turn' ? freeSpotsFor(placing, view.placements, chapter) : moveSpotsFor(placing, view, chapter);
    return new Set(spots.map((spot) => spot.id));
  });

  let selectedId = $state<string | null>(null);
  // Nur was noch im Haus steht, kann ausgewählt sein.
  const selected = $derived(selectedId !== null && view.placements.some((p) => p.pieceId === selectedId) ? (pieces.get(selectedId) ?? null) : null);

  let house = $state<HTMLElement | null>(null);
  // Die leuchtenden Plätze können außerhalb des sichtbaren Bereichs liegen: zum ersten hinrollen.
  $effect(() => {
    if (!ui.placing || !house) return;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    house.querySelector('.target')?.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
  });

  async function place(spotId: string): Promise<void> {
    const intent = ui.placing;
    if (!intent) return;
    ui.placing = null;
    selectedId = null;
    playSound('place');
    await dispatch(intent.kind === 'turn' ? { type: 'build.place', turn: intent.turn, spotId } : { type: 'piece.move', pieceId: intent.pieceId, spotId });
  }
</script>

{#if chapter.roof}
  <!-- Das Dach vor dem Abendhimmel: Der Himmel ist Sache der App, die Zeichnung kommt aus dem Kapitel. -->
  <div class="crown" aria-hidden="true">
    <svg viewBox={chapter.roof.viewBox}>{@html chapter.roof.body}</svg>
  </div>
{/if}
<div class="house" bind:this={house}>
  <MemoryWall {view} {chapter} />
  {#each indoor as room (room.id)}
    <RoomView {room} {placed} {targets} selected={selected?.id ?? null} onspot={place} onpiece={(id) => (selectedId = selectedId === id ? null : id)} />
  {/each}
  <div class="plinth"></div>
  {#each outdoor as room (room.id)}
    <div class="outside">
      <RoomView {room} {placed} {targets} selected={selected?.id ?? null} onspot={place} onpiece={(id) => (selectedId = selectedId === id ? null : id)} />
    </div>
  {/each}
</div>

{#if placing}
  <div class="bar" role="status" data-testid="placing-bar">
    <span class="thumb"><PieceArt art={placing.art} /></span>
    <p>
      {#if targets.size > 0}
        Tap a glowing spot for the {placing.name.toLowerCase()}.
      {:else}
        No free spot fits the {placing.name.toLowerCase()} right now. Move another piece to make room.
      {/if}
    </p>
    <button type="button" class="quiet" onclick={() => (ui.placing = null)}>Cancel</button>
  </div>
{:else if selected}
  <div class="bar" data-testid="piece-bar">
    <span class="thumb"><PieceArt art={selected.art} /></span>
    <p>
      <strong>{selected.name}</strong>
      {#if selected.nameVi}<span class="vi" lang="vi">{selected.nameVi}</span>{/if}
    </p>
    <button type="button" onclick={() => (ui.placing = { kind: 'move', pieceId: selected.id })}>Move</button>
    <button type="button" class="quiet" onclick={() => (selectedId = null)}>Done</button>
  </div>
{/if}

<style>
  .house {
    container-type: inline-size;
    width: 100%;
    /* Im Querformat und auf breiten Bildschirmen bleibt das Haus handlich. */
    max-width: 520px;
    margin: 0 auto;
  }

  /* Setzt den Himmel von Home fort: von der Dämmerung ins Abendrot an der Traufe. */
  .crown {
    background: linear-gradient(to bottom, var(--dusk), var(--mauve) 58%, var(--afterglow));
  }

  .crown svg {
    display: block;
    width: 100%;
    max-width: 520px;
    margin: 0 auto;
  }

  /* Sockel: schließt das Haus nach unten ab. */
  .plinth {
    height: 10px;
    background: var(--petrol);
  }

  .outside {
    margin-top: 14px;
    overflow: hidden;
    border-radius: var(--radius) var(--radius) 0 0;
  }

  /* Bleibt beim Rollen durch das Haus unten stehen. */
  .bar {
    position: sticky;
    bottom: 12px;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 12px calc(var(--safe-right) + 12px) 0 calc(var(--safe-left) + 12px);
    padding: 8px 10px;
    border-radius: 18px;
    background: var(--cream);
    box-shadow:
      0 0 0 2px var(--petrol),
      0 6px 20px rgb(35 55 60 / 0.3);
  }

  .bar p {
    flex: 1;
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }

  .thumb {
    flex: none;
    width: 44px;
    height: 44px;
  }
</style>
