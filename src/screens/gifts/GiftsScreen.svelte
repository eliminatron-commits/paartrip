<script lang="ts">
  // Gifts: Gutscheine für mich und von mir – verhüllt, freigeschaltet, eingelöst – und das Hinterlegen
  // geheimer Gutscheine. Einlösen: Der Beschenkte tippt "Redeem", der Schenkende bestätigt.
  import type { Chapter } from '../../../shared/content-schema.ts';
  import { LIMITS } from '../../../shared/limits.ts';
  import { type CouponView, type HouseView, otherSlot } from '../../../shared/model.ts';
  import { canDeposit, gifts, redeemSent } from '../../lib/house.ts';
  import { dispatch, session } from '../../lib/session.svelte.ts';

  let { view, chapter }: { view: HouseView; chapter: Chapter } = $props();

  const partner = $derived(view.players[otherSlot(view.you)]);
  const lists = $derived(gifts(view));
  const open = $derived(canDeposit(view, chapter));

  let text = $state('');
  let busy = $state(false);

  async function wrap(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const gift = text.trim();
    if (!gift || busy) return;
    busy = true;
    try {
      // Gesichert ist die Aktion, sobald dispatch sie in die Warteschlange gelegt hat – auch ohne Netz.
      text = '';
      await dispatch({ type: 'coupon.deposit', text: gift });
    } finally {
      busy = false;
    }
  }

  function when(gift: CouponView): string {
    if (gift.state === 'redeemed') return 'Redeemed';
    if (gift.state === 'unlocked') return 'Unwrapped';
    return `Opens after ${gift.milestone} tasks`;
  }
</script>

{#snippet card(gift: CouponView, mine: boolean)}
  {@const sent = redeemSent(gift, session.queued)}
  <li class="gift" class:veiled={gift.state === 'veiled'} data-testid="gift" data-kind={gift.kind} data-from={gift.from === view.you ? 'me' : 'partner'} data-state={gift.state}>
    <span class="bow" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        {#if gift.state === 'redeemed'}
          <path d="m9.700 17.300-4.500-4.500 1.800-1.800 2.700 2.700 7.300-7.300 1.800 1.800z" />
        {:else}
          <path
            d="M12 6.800C10.800 3.600 6.500 3.300 6.500 6.200c0 .5.200 1 .5 1.300H3.500v4h17v-4H17c.3-.3.5-.8.5-1.300 0-2.900-4.300-2.600-5.500.6zM4.500 13h6.500v7.500H6A1.500 1.500 0 0 1 4.500 19zm8.500 0h6.500v6a1.500 1.500 0 0 1-1.500 1.500h-5z"
          />
        {/if}
      </svg>
    </span>
    <div class="body">
      <p class="what">
        {#if gift.text !== null}
          {gift.text}
        {:else}
          A wrapped gift from {partner?.name}
        {/if}
      </p>
      <p class="note">{when(gift)}</p>

      {#if gift.state === 'unlocked'}
        {#if sent}
          <p class="note">Saved on this phone. It's on its way.</p>
        {:else if mine && gift.redeemRequestedAt === null}
          <div class="row">
            <button type="button" onclick={() => dispatch({ type: 'coupon.requestRedeem', couponId: gift.id })}>Redeem</button>
          </div>
        {:else if mine}
          <p class="wait">You asked to redeem it. Now {partner?.name} says when it's done.</p>
        {:else if gift.redeemRequestedAt !== null}
          <p class="wait">{partner?.name} would like to redeem this.</p>
          <div class="row">
            <button type="button" onclick={() => dispatch({ type: 'coupon.confirmRedeem', couponId: gift.id })}>Done – mark as redeemed</button>
          </div>
        {:else}
          <p class="note">{partner?.name} can redeem it any time.</p>
        {/if}
      {/if}
    </div>
  </li>
{/snippet}

<div class="page">
  <h2>Gifts</h2>

  {#if !partner}
    <section class="panel">
      <p>Once your partner has moved in, your gifts for each other appear here.</p>
    </section>
  {:else}
    <section aria-labelledby="for-me-title">
      <h3 id="for-me-title">For you</h3>
      {#if lists.forMe.length === 0}
        <p class="note">Nothing yet. Maybe {partner.name} is planning something.</p>
      {:else}
        <ul>
          {#each lists.forMe as gift (gift.id)}
            {@render card(gift, true)}
          {/each}
        </ul>
      {/if}
    </section>

    <section aria-labelledby="from-me-title">
      <h3 id="from-me-title">From you</h3>
      {#if lists.fromMe.length === 0}
        <p class="note">Nothing yet. Leave a little promise below.</p>
      {:else}
        <ul>
          {#each lists.fromMe as gift (gift.id)}
            {@render card(gift, false)}
          {/each}
        </ul>
      {/if}
    </section>

    <section class="panel" aria-labelledby="secret-title">
      <h2 id="secret-title">A secret gift</h2>
      {#if open}
        <p>Leave a little promise for {partner.name}. It stays wrapped until a milestone opens it.</p>
        <form onsubmit={wrap}>
          <label>
            Your promise
            <textarea bind:value={text} rows="2" maxlength={LIMITS.couponTextLength} placeholder="Breakfast in bed, a walk at sunrise …"></textarea>
          </label>
          <button type="submit" disabled={text.trim().length === 0 || busy}>Wrap it up</button>
        </form>
      {:else}
        <p data-testid="deposit-closed">Every gift of this chapter has been opened. New ones can be wrapped when the next chapter begins.</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  section:not(.panel) {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  h3 {
    font-size: 1.2rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  form button {
    align-self: flex-start;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .gift {
    display: flex;
    gap: 12px;
    padding: 14px;
    border-radius: 14px;
    background: var(--cream-deep);
  }

  .bow {
    flex: none;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: var(--sage-deep);
  }

  .gift.veiled .bow {
    background: var(--terracotta);
  }

  .bow svg {
    width: 24px;
    height: 24px;
    fill: var(--cream);
  }

  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .what {
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .wait {
    color: var(--petrol);
    font-weight: 700;
  }

  .body .row {
    margin-top: 6px;
  }
</style>
