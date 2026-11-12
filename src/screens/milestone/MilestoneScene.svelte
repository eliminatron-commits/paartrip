<script lang="ts">
  // Meilenstein: erst die Story-Szene, dann das verhüllte Geschenk. Darin liegen die Gutscheine, die an
  // diesem Meilenstein gewartet haben – oder, wenn keiner dort lag, ein besonderes Dekostück.
  // Liegt über der ganzen App, bis der Spieler weitergeht; dann merkt sich der Server "gesehen".
  import type { Chapter } from '../../../shared/content-schema.ts';
  import { type HouseView, otherSlot, type ReachedMilestone } from '../../../shared/model.ts';
  import PieceArt from '../../components/PieceArt.svelte';
  import { playSound } from '../../lib/audio.ts';
  import { pieceMap, sceneFor } from '../../lib/house.ts';
  import { dispatch } from '../../lib/session.svelte.ts';
  import { go, startPlacing } from '../../lib/ui.svelte.ts';

  let { view, chapter, milestone }: { view: HouseView; chapter: Chapter; milestone: ReachedMilestone } = $props();

  const partner = $derived(view.players[otherSlot(view.you)]?.name ?? 'your partner');
  const scene = $derived(sceneFor(chapter, milestone.at));
  const unwrapped = $derived(view.coupons.filter((c) => c.milestone === milestone.at && c.state !== 'veiled'));
  const forMe = $derived(unwrapped.filter((c) => c.to === view.you));
  const fromMe = $derived(unwrapped.filter((c) => c.from === view.you));
  const deco = $derived(milestone.decoPiece ? (pieceMap(chapter).get(milestone.decoPiece) ?? null) : null);
  const decoWaits = $derived(deco !== null && !view.placements.some((p) => p.pieceId === deco.id));

  let opened = $state(false);
  let leaving = $state(false);

  let heading = $state<HTMLElement | null>(null);
  $effect(() => heading?.focus());

  function open(): void {
    opened = true;
    playSound('reveal');
  }

  async function leave(then: 'gifts' | 'place' | 'stay'): Promise<void> {
    if (leaving) return;
    leaving = true;
    if (then === 'gifts') go('gifts');
    else if (then === 'place' && deco) startPlacing({ kind: 'move', pieceId: deco.id });
    await dispatch({ type: 'milestone.seen', milestone: milestone.at });
  }
</script>

<div class="scene" role="dialog" aria-modal="true" aria-labelledby="scene-title" data-testid="milestone">
  <div class="sky"></div>
  <div class="content">
    <p class="eyebrow">{milestone.at} tasks together</p>
    <h2 id="scene-title" tabindex="-1" bind:this={heading}>{scene?.title ?? 'A milestone'}</h2>
    {#if scene}
      <p class="story">{scene.text}</p>
    {/if}

    {#if !opened}
      <svg class="present" viewBox="0 0 120 110" aria-hidden="true">
        <rect x="18" y="46" width="84" height="58" rx="6" fill="var(--terracotta)" />
        <rect x="12" y="32" width="96" height="20" rx="5" fill="var(--terracotta-soft)" />
        <rect x="53" y="32" width="14" height="72" fill="var(--cream)" />
        <path d="M60 32C48 8 26 14 34 26c4 6 16 6 26 6zm0 0c12-24 34-18 26-6-4 6-16 6-26 6z" fill="var(--sage-deep)" />
      </svg>
      <button type="button" onclick={open}>Open the gift</button>
    {:else}
      <div class="inside" data-testid="gift-inside">
        {#each forMe as coupon (coupon.id)}
          <div class="reveal">
            <p class="eyebrow">From {partner}, for you</p>
            <p class="promise">{coupon.text}</p>
          </div>
        {/each}
        {#each fromMe as coupon (coupon.id)}
          <div class="reveal">
            <p class="eyebrow">Your gift for {partner} is unwrapped</p>
            <p class="promise">{coupon.text}</p>
          </div>
        {/each}
        {#if deco}
          <div class="reveal">
            <span class="deco"><PieceArt art={deco.art} /></span>
            <p class="eyebrow">A special piece for your home</p>
            <p class="promise">
              {deco.name}
              {#if deco.nameVi}<span class="vi" lang="vi">{deco.nameVi}</span>{/if}
            </p>
          </div>
        {/if}
        {#if forMe.length + fromMe.length === 0 && !deco}
          <p>The house feels a little more like home.</p>
        {/if}
      </div>

      <div class="row">
        {#if forMe.length > 0}
          <button type="button" disabled={leaving} onclick={() => leave('gifts')}>See your gifts</button>
          <button type="button" class="quiet" disabled={leaving} onclick={() => leave('stay')}>Later</button>
        {:else if decoWaits}
          <button type="button" disabled={leaving} onclick={() => leave('place')}>Find a spot for it</button>
          <button type="button" class="quiet" disabled={leaving} onclick={() => leave('stay')}>Later</button>
        {:else}
          <button type="button" disabled={leaving} onclick={() => leave('stay')}>Continue</button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .scene {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    /* Der Inhalt rollt nicht unter den Home-Indikator. */
    padding-bottom: var(--safe-bottom);
    background: var(--cream);
  }

  /* Dunkler Streifen unter Uhr und Dynamic Island – die Uhr ist dort weiß. */
  .sky {
    flex: none;
    height: calc(var(--safe-top) + 12px);
    background: var(--petrol);
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    overflow-y: auto;
    padding: 28px calc(var(--safe-right) + 24px) 28px calc(var(--safe-left) + 24px);
    text-align: center;
  }

  h2 {
    font-size: 1.9rem;
    outline: none;
  }

  .story {
    max-width: 34em;
    text-align: left;
  }

  .present {
    width: 150px;
    margin-top: 8px;
  }

  .inside {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    max-width: 34em;
  }

  .reveal {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 20px 16px;
    border-radius: var(--radius);
    background: var(--cream-deep);
  }

  .promise {
    display: flex;
    flex-direction: column;
    font-family: var(--font-title);
    font-size: 1.45rem;
    font-weight: 600;
    line-height: 1.2;
    color: var(--petrol);
    overflow-wrap: anywhere;
  }

  .deco {
    width: 110px;
    height: 110px;
  }

  .row {
    justify-content: center;
  }
</style>
