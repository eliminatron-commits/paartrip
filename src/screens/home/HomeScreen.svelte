<script lang="ts">
  // Home: wer hier wohnt, wie weit das Kapitel ist, der nächste Schritt im Haus – und das Haus selbst.
  // Oben liegt der Abendhimmel; die Meilensteine hängen als Laternen an einer Schnur, erreichte leuchten.
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

  /** Breite der Laternen-Zeichnung; die Schnur hängt in der Mitte am tiefsten. */
  const STRING = 360;
  const sag = (x: number) => 4 + 28 * (x / STRING) * (1 - x / STRING);
  const lanterns = $derived(
    chapter.milestones.map((milestone, index, all) => {
      const x = (STRING * (index + 0.5)) / all.length;
      return { milestone, x, y: sag(x), lit: done >= milestone };
    }),
  );
</script>

<div class="home">
  <div class="sky">
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
          <svg class="lanterns" viewBox="0 0 {STRING} 50" aria-hidden="true">
            <defs>
              <radialGradient id="ui-lantern-glow">
                <stop offset="0" stop-color="var(--lantern)" stop-opacity="0.6" />
                <stop offset="1" stop-color="var(--lantern)" stop-opacity="0" />
              </radialGradient>
            </defs>
            <path class="string" d="M0 4Q{STRING / 2} 32 {STRING} 4" />
            {#each lanterns as { milestone, x, y, lit } (milestone)}
              <g class="lantern" class:lit transform="translate({x} {y})">
                {#if lit}<circle class="glow" cy="19" r="26" />{/if}
                <path class="hanger" d="M0 0v5" />
                <rect class="cap" x="-5" y="4.500" width="10" height="3" rx="1" />
                <ellipse class="body" cy="19" rx="12" ry="12.500" />
                <path class="rib" d="M-6 8.500q-5 10.500 0 21M6 8.500q5 10.500 0 21" />
                <rect class="cap" x="-4" y="30.500" width="8" height="2.500" rx="1" />
                <text y="23.300" text-anchor="middle">{milestone}</text>
              </g>
            {/each}
          </svg>
        </section>
        {#if move}
          <MoveCard {view} {chapter} {move} />
        {/if}
      {:else if me}
        <InviteCode name={me.name} code={view.pairingCode} />
      {/if}
    </div>
  </div>
  <House {view} {chapter} />
</div>

<style>
  .home {
    /* Platz unter dem Garten, damit die Leiste zum Platzieren nichts verdeckt. */
    padding-bottom: 20px;
    background: var(--sage-deep);
  }

  /* Abendhimmel: schließt oben an die Kopfleiste an, unten an den Himmel über dem Dach (House). Dazu ein paar Sterne. */
  .sky {
    background:
      radial-gradient(1.6px 1.6px at 8% 22%, var(--cream) 50%, transparent 52%),
      radial-gradient(1.2px 1.2px at 27% 68%, var(--cream-deep) 50%, transparent 52%),
      radial-gradient(1.4px 1.4px at 46% 12%, var(--cream) 50%, transparent 52%),
      radial-gradient(1.2px 1.2px at 63% 44%, var(--cream-deep) 50%, transparent 52%),
      radial-gradient(1.6px 1.6px at 78% 18%, var(--cream) 50%, transparent 52%),
      radial-gradient(1.2px 1.2px at 92% 58%, var(--cream-deep) 50%, transparent 52%),
      linear-gradient(to bottom, var(--petrol), var(--dusk));
  }

  .sky .page {
    padding-top: 18px;
    padding-bottom: 8px;
  }

  .intro {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--cream);
  }

  .intro h2 {
    color: var(--cream);
    font-size: 1.8rem;
  }

  .chapter {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 8px;
  }

  .intro .eyebrow,
  .intro .note {
    color: var(--cream-deep);
  }

  .intro .vi {
    color: var(--lantern);
  }

  /* Die Meilensteine als Laternen an einer Schnur: erreicht = sie leuchtet. */
  .lanterns {
    display: block;
    width: 100%;
    margin-top: 6px;
    overflow: visible;
  }

  .string,
  .hanger {
    fill: none;
    stroke: var(--cream-deep);
    stroke-width: 1;
    opacity: 0.7;
  }

  .cap {
    fill: var(--cream-deep);
    opacity: 0.75;
  }

  .body {
    fill: color-mix(in srgb, var(--cream) 10%, transparent);
    stroke: var(--cream-deep);
    stroke-width: 1.2;
  }

  .rib {
    fill: none;
    stroke: var(--cream-deep);
    stroke-width: 0.7;
    opacity: 0.4;
  }

  .lantern text {
    fill: var(--cream-deep);
    font-size: 11.5px;
    font-weight: 800;
  }

  .glow {
    fill: url(#ui-lantern-glow);
  }

  .lit .body {
    fill: var(--lantern);
    stroke: var(--cream);
  }

  .lit .cap {
    fill: var(--terracotta-soft);
    opacity: 1;
  }

  .lit .rib {
    stroke: var(--terracotta);
    opacity: 0.35;
  }

  .lit text {
    fill: var(--ink);
  }
</style>
