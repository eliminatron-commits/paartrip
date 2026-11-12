<script lang="ts">
  // Eine aufgedeckte Kennst-du-mich-Frage: beide Antworten, beide Tipps, die Herzen. Bei frei getippten
  // Antworten entscheidet, wer geantwortet hat, ob der Tipp des anderen zählt – das geschieht hier.
  import { dispatch } from '../../lib/session.svelte.ts';
  import type { Reveal } from '../../lib/tasks.ts';

  let { reveal, partner }: { reveal: Reveal; partner: string } = $props();

  const HEART = 'M12 20.5C4.5 15.2 2.5 11.5 4.3 8.3 6 5.4 9.9 5.5 12 8.4c2.1-2.900 6-3 7.700-.1 1.800 3.200-.2 6.900-7.700 12.200z';

  async function judge(counts: boolean): Promise<void> {
    await dispatch({ type: 'knowme.judge', taskId: reveal.taskId, counts });
  }
</script>

{#snippet heart(text: string)}
  <span class="heart" data-testid="heart">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={HEART} /></svg>
    {text}
  </span>
{/snippet}

<section class="panel" aria-label="Answers to: {reveal.question}" data-testid="reveal" data-task={reveal.taskId}>
  <p class="eyebrow">Unveiled</p>
  <h2>{reveal.question}</h2>

  <dl>
    <div data-testid="reveal-theirs">
      <dt>{partner} said</dt>
      <dd class="answer">{reveal.theirs.answer}</dd>
      <dd>
        You guessed: {reveal.theirs.myGuess}
        {#if reveal.myHeart}{@render heart('Right!')}{/if}
      </dd>
      {#if reveal.myVerdict !== 'none' && !reveal.theirVerdict}
        <dd class="note">{partner} decides whether that counts.</dd>
      {/if}
    </div>
    <div data-testid="reveal-mine">
      <dt>You said</dt>
      <dd class="answer">{reveal.mine.answer}</dd>
      <dd>
        {partner} guessed: {reveal.mine.theirGuess}
        {#if reveal.theirHeart}{@render heart('Right!')}{/if}
      </dd>
    </div>
  </dl>

  {#if reveal.myVerdict === 'open'}
    <p>Does {partner}'s guess count?</p>
    <div class="row">
      <button type="button" onclick={() => judge(true)}>Yes, that counts</button>
      <button type="button" class="quiet" onclick={() => judge(false)}>Not quite</button>
    </div>
  {:else if reveal.myVerdict === 'sent'}
    <p class="note">Saved on this phone. It's on its way.</p>
  {/if}
</section>

<style>
  dl {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin: 0;
  }

  dl > div {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--cream);
  }

  dt {
    color: var(--ink-soft);
    font-size: 0.9rem;
    font-weight: 700;
  }

  dd {
    margin: 0;
  }

  .answer {
    font-family: var(--font-title);
    font-size: 1.25rem;
    color: var(--petrol);
  }

  .heart {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 6px;
    color: var(--terracotta);
    font-weight: 700;
    white-space: nowrap;
  }

  .heart svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
  }
</style>
