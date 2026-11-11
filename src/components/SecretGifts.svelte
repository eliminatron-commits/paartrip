<script lang="ts">
  // Geheime Gutscheine hinterlegen und sehen, was verhüllt wartet. Vorläufige Fassung:
  // Die Geschenke-Seite mit Enthüllen und Einlösen entsteht in Phase 3.
  import { LIMITS } from '../../shared/limits.ts';
  import { type CouponView, otherSlot } from '../../shared/model.ts';
  import { dispatch, session } from '../lib/session.svelte.ts';

  const view = $derived(session.view);
  const partner = $derived(view ? view.players[otherSlot(view.you)] : null);
  const gifts = $derived(view ? [...view.coupons].sort((x, y) => x.milestone - y.milestone) : []);

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

{#if view && partner}
  <section class="panel" aria-labelledby="gifts-title">
    <h2 id="gifts-title">Secret gifts</h2>
    <p>Leave a little promise for {partner.name}. It stays wrapped until a milestone opens it.</p>

    <form onsubmit={wrap}>
      <label>
        Your promise
        <textarea bind:value={text} rows="2" maxlength={LIMITS.couponTextLength} placeholder="Breakfast in bed, a walk at sunrise …"></textarea>
      </label>
      <button type="submit" disabled={text.trim().length === 0 || busy}>Wrap it up</button>
    </form>

    {#if gifts.length > 0}
      <h3>Waiting at home</h3>
      <ul>
        {#each gifts as gift (gift.id)}
          <li data-testid="gift" data-kind={gift.kind} data-from={gift.from === view.you ? 'me' : 'partner'}>
            <span class="what">
              {#if gift.text !== null}
                {gift.text}
              {:else}
                A wrapped gift from {partner.name}
              {/if}
            </span>
            <span class="note">{gift.from === view.you ? `For ${partner.name}` : 'For you'} · {when(gift)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
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

  li {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--cream);
  }

  .what {
    font-weight: 700;
    overflow-wrap: anywhere;
  }
</style>
