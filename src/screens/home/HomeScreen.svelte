<script lang="ts">
  // Home: wer hier wohnt, wie weit das Kapitel ist, der nächste Schritt im Haus – und das Haus selbst.
  import type { Chapter } from '../../../shared/content-schema.ts';
  import { type HouseView, otherSlot } from '../../../shared/model.ts';
  import InviteCode from '../../components/InviteCode.svelte';
  import { type Move, nextMilestone } from '../../lib/house.ts';
  import House from './House.svelte';
  import MoveCard from './MoveCard.svelte';

  let { view, chapter, move }: { view: HouseView; chapter: Chapter; move: Move | null } = $props();

  const me = $derived(view.players[view.you]);
  const partner = $derived(view.players[otherSlot(view.you)]);
  const done = $derived(view.done.length);
  const upcoming = $derived(nextMilestone(view, chapter));
</script>

<div class="home">
  <div class="page">
    {#if me && partner}
      <section class="intro" aria-labelledby="home-title">
        <h2 id="home-title" data-testid="house-names">{me.name} &amp; {partner.name}</h2>
        <p class="chapter">
          <span class="eyebrow">Chapter {chapter.number}</span>
          {chapter.title} · <span class="vi" lang="vi">{chapter.titleVi}</span>
        </p>
        <p class="note" data-testid="progress">
          {done === 0 ? 'No tasks done yet' : `${done} ${done === 1 ? 'task' : 'tasks'} done together`}{#if upcoming !== null}&nbsp;· next gift at {upcoming}{/if}
        </p>
        <ol class="track" aria-hidden="true">
          {#each chapter.milestones as milestone (milestone)}
            <li class:reached={done >= milestone}>{milestone}</li>
          {/each}
        </ol>
      </section>
      {#if move}
        <MoveCard {view} {chapter} {move} />
      {/if}
    {:else if me}
      <InviteCode name={me.name} code={view.pairingCode} />
    {/if}
  </div>
  <House {view} {chapter} />
</div>

<style>
  .home {
    /* Platz unter dem Garten, damit die Leiste zum Platzieren nichts verdeckt. */
    padding-bottom: 20px;
  }

  .intro {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .intro h2 {
    font-size: 1.7rem;
  }

  .chapter {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 8px;
  }

  /* Die sechs Meilensteine als kleine Marken: erreicht = gefüllt. */
  .track {
    display: flex;
    gap: 8px;
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
  }

  .track li {
    display: grid;
    place-items: center;
    min-width: 34px;
    height: 26px;
    padding: 0 6px;
    border-radius: 999px;
    box-shadow: inset 0 0 0 2px var(--sage-deep);
    color: var(--sage-deep);
    font-size: 0.8rem;
    font-weight: 700;
  }

  .track li.reached {
    background: var(--sage-deep);
    color: var(--cream);
  }
</style>
