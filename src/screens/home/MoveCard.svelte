<script lang="ts">
  // Der nächste Schritt im Haus: Stück wählen, Stück platzieren, auf den anderen warten oder das Dekostück
  // aus einem Geschenk aufstellen. Einer wählt, der andere platziert; die Rollen wechseln je Bauzug.
  import type { Chapter } from '../../../shared/content-schema.ts';
  import { type HouseView, otherSlot } from '../../../shared/model.ts';
  import PieceArt from '../../components/PieceArt.svelte';
  import { type Move, pieceMap } from '../../lib/house.ts';
  import { dispatch } from '../../lib/session.svelte.ts';
  import { startPlacing } from '../../lib/ui.svelte.ts';

  let { view, chapter, move }: { view: HouseView; chapter: Chapter; move: Move } = $props();

  const pieces = $derived(pieceMap(chapter));
  const partner = $derived(view.players[otherSlot(view.you)]?.name ?? 'Your partner');
  const offer = $derived(move.kind === 'choose' ? move.turn.offer.flatMap((id) => pieces.get(id) ?? []) : []);
  const piece = $derived('pieceId' in move ? (pieces.get(move.pieceId) ?? null) : null);

  let pickedId = $state<string | null>(null);
  const picked = $derived(offer.find((p) => p.id === pickedId) ?? null);

  async function choose(): Promise<void> {
    if (move.kind !== 'choose' || !picked) return;
    await dispatch({ type: 'build.choose', turn: move.turn.n, pieceId: picked.id });
  }

  const SAVED = "Saved on this phone. It's on its way.";
</script>

<section class="panel" aria-labelledby="move-title" data-testid="move" data-kind={move.kind}>
  {#if move.kind === 'choose'}
    <h2 id="move-title">Your pick</h2>
    {#if move.sent}
      <p class="note">{SAVED}</p>
    {:else}
      <p>Choose a piece for the house. {partner} decides where it goes.</p>
      <div class="offer" role="radiogroup" aria-label="Pieces to choose from">
        {#each offer as option (option.id)}
          <button type="button" class="plain option" class:picked={pickedId === option.id} role="radio" aria-checked={pickedId === option.id} data-piece={option.id} onclick={() => (pickedId = option.id)}>
            <span class="art"><PieceArt art={option.art} /></span>
            <span class="name">{option.name}</span>
            {#if option.nameVi}<span class="vi" lang="vi">{option.nameVi}</span>{/if}
          </button>
        {/each}
      </div>
      <div class="row">
        <button type="button" disabled={!picked} onclick={choose}>{picked ? `Choose the ${picked.name.toLowerCase()}` : 'Choose a piece'}</button>
      </div>
    {/if}
  {:else if move.kind === 'place' && piece}
    <h2 id="move-title">Your turn to place</h2>
    <div class="gift">
      <span class="art"><PieceArt art={piece.art} /></span>
      <p>
        {partner} picked the {piece.name.toLowerCase()}{#if piece.nameVi}&nbsp;(<span class="vi" lang="vi">{piece.nameVi}</span>){/if}. Where does it go?
      </p>
    </div>
    {#if move.sent}
      <p class="note">{SAVED}</p>
    {:else}
      <div class="row">
        <button type="button" onclick={() => startPlacing({ kind: 'turn', turn: move.turn.n, pieceId: piece.id })}>Find a spot</button>
      </div>
    {/if}
  {:else if move.kind === 'deco' && piece}
    <h2 id="move-title">A special piece</h2>
    <div class="gift">
      <span class="art"><PieceArt art={piece.art} /></span>
      <p>The {piece.name.toLowerCase()} from your gift is waiting for a spot. Whoever gets there first places it.</p>
    </div>
    {#if move.sent}
      <p class="note">{SAVED}</p>
    {:else}
      <div class="row">
        <button type="button" onclick={() => startPlacing({ kind: 'move', pieceId: piece.id })}>Find a spot</button>
      </div>
    {/if}
  {:else if move.kind === 'wait-choose'}
    <h2 id="move-title">{partner} picks next</h2>
    <p>After that, it's your turn to find a spot for the new piece.</p>
  {:else if move.kind === 'wait-place' && piece}
    <h2 id="move-title">{partner} places it</h2>
    <div class="gift">
      <span class="art"><PieceArt art={piece.art} /></span>
      <p>You picked the {piece.name.toLowerCase()}. Now {partner} finds a spot for it.</p>
    </div>
  {/if}
</section>

<style>
  .offer {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 10px;
  }

  .option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 10px 6px;
    border-radius: 14px;
    /* Jedes Stück steht in seinem kleinen Schaukasten, von oben beleuchtet. */
    background: radial-gradient(ellipse 90% 70% at 50% 0%, color-mix(in srgb, var(--lantern) 26%, var(--cream)), var(--cream) 78%);
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--wood) 18%, transparent),
      0 8px 16px -12px color-mix(in srgb, var(--ink) 70%, transparent);
    text-align: center;
    line-height: 1.2;
    transition: transform 0.15s ease-out;
  }

  .option.picked {
    box-shadow:
      inset 0 0 0 3px var(--petrol),
      0 12px 20px -12px color-mix(in srgb, var(--ink) 80%, transparent);
    transform: translateY(-3px);
  }

  .name {
    font-weight: 700;
    font-size: 0.95rem;
  }

  .option .vi {
    font-size: 0.85rem;
  }

  .art {
    flex: none;
    display: block;
    width: 68px;
    height: 68px;
  }

  .gift {
    display: flex;
    align-items: center;
    gap: 14px;
  }
</style>
