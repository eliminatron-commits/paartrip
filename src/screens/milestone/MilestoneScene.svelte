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
  <!-- Abendhimmel mit einer Lichterkette; darunter das Blatt mit der Geschichte. -->
  <div class="sky" aria-hidden="true">
    <svg class="lights" viewBox="0 0 360 44" preserveAspectRatio="xMidYMax meet">
      <defs>
        <radialGradient id="ui-scene-glow">
          <stop offset="0" stop-color="var(--lantern)" stop-opacity="0.75" />
          <stop offset="1" stop-color="var(--lantern)" stop-opacity="0" />
        </radialGradient>
      </defs>
      <path class="cord" d="M-10 2Q90 34 180 10Q270 34 370 2" />
      {#each [[36, 13], [72, 20.500], [108, 21.500], [144, 16.500], [216, 16.500], [252, 21.500], [288, 20.500], [324, 13]] as [x, y], index (x)}
        <g class="bulb" class:fx-twinkle={index % 3 === 1} transform="translate({x} {y})">
          <circle cy="6" r="13" fill="url(#ui-scene-glow)" />
          <rect class="socket" x="-1.600" y="-.500" width="3.200" height="3.400" rx="0.800" />
          <ellipse class="glass" cy="7.300" rx="4" ry="4.800" />
        </g>
      {/each}
    </svg>
  </div>
  <div class="content">
    <p class="eyebrow">{milestone.at} tasks together</p>
    <h2 id="scene-title" tabindex="-1" bind:this={heading}>{scene?.title ?? 'A milestone'}</h2>
    {#if scene}
      <p class="story">{scene.text}</p>
    {/if}

    {#if !opened}
      <svg class="present" viewBox="0 0 120 116" aria-hidden="true">
        <defs>
          <radialGradient id="ui-present-glow">
            <stop offset="0" stop-color="var(--lantern)" stop-opacity="0.6" />
            <stop offset="1" stop-color="var(--lantern)" stop-opacity="0" />
          </radialGradient>
          <linearGradient id="ui-present-box" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="var(--terracotta-soft)" />
            <stop offset="1" stop-color="var(--terracotta)" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="62" r="58" fill="url(#ui-present-glow)" />
        <ellipse class="ground" cx="60" cy="106" rx="46" ry="5" />
        <rect x="18" y="46" width="84" height="58" rx="6" fill="url(#ui-present-box)" />
        <rect class="shade" x="18" y="50" width="84" height="7" />
        <rect x="12" y="32" width="96" height="20" rx="5" fill="var(--terracotta-soft)" />
        <rect class="shine" x="15" y="33.500" width="90" height="2" rx="1" />
        <rect x="53" y="32" width="14" height="72" fill="var(--cream)" />
        <rect class="fold" x="64" y="32" width="3" height="72" />
        <path d="M60 32C48 8 26 14 34 26c4 6 16 6 26 6zm0 0c12-24 34-18 26-6-4 6-16 6-26 6z" fill="var(--sage-deep)" />
        <path class="loop" d="M60 32c-8-10-18-13-22-9M60 32c8-10 18-13 22-9" />
        <circle cx="60" cy="31" r="4.500" fill="var(--sage)" />
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

  /* Abendhimmel unter Uhr und Dynamic Island – die Uhr ist dort weiß. Das Blatt schiebt sich darüber. */
  .sky {
    flex: none;
    display: flex;
    align-items: flex-end;
    height: calc(var(--safe-top) + 96px);
    padding-bottom: 34px;
    background:
      var(--stars),
      linear-gradient(to bottom, var(--petrol), var(--dusk) calc(100% - 52px), var(--mauve) calc(100% - 26px), var(--afterglow));
  }

  .lights {
    display: block;
    width: 100%;
    height: 44px;
    overflow: visible;
  }

  .cord {
    fill: none;
    stroke: var(--ink);
    stroke-width: 1.2;
  }

  .socket {
    fill: var(--ink);
  }

  .glass {
    fill: var(--cream);
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    overflow-y: auto;
    margin-top: -26px;
    padding: 30px calc(var(--safe-right) + 24px) 28px calc(var(--safe-left) + 24px);
    border-radius: 26px 26px 0 0;
    background: var(--cream);
    box-shadow: 0 -10px 22px -14px color-mix(in srgb, var(--ink) 70%, transparent);
    text-align: center;
  }

  .ground {
    fill: color-mix(in srgb, var(--ink) 22%, transparent);
  }

  .shade {
    fill: color-mix(in srgb, var(--ink) 22%, transparent);
  }

  .shine {
    fill: color-mix(in srgb, var(--cream) 45%, transparent);
  }

  .fold {
    fill: color-mix(in srgb, var(--wood) 30%, transparent);
  }

  .loop {
    fill: none;
    stroke: color-mix(in srgb, var(--cream) 40%, transparent);
    stroke-width: 1.4;
    stroke-linecap: round;
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
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--cream) 85%, transparent),
      inset 0 0 0 1px color-mix(in srgb, var(--wood) 14%, transparent),
      var(--lift);
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
