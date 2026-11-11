<script lang="ts">
  // Wer im Haus ist, der Kopplungscode (solange der zweite Spieler fehlt) und der Stand des Abgleichs.
  import { formatCode } from '../../shared/limits.ts';
  import { otherSlot } from '../../shared/model.ts';
  import { dismissRejected, session } from '../lib/session.svelte.ts';

  const view = $derived(session.view);
  const me = $derived(view?.players[view.you] ?? null);
  const partner = $derived(view ? view.players[otherSlot(view.you)] : null);

  let copied = $state(false);

  async function copy(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(formatCode(code));
      copied = true;
    } catch {
      // Ohne Zwischenablage bleibt der Code zum Abtippen sichtbar.
    }
  }

  const waiting = $derived(`${session.pending} ${session.pending === 1 ? 'change' : 'changes'} waiting to be sent`);
  const status = $derived.by(() => {
    if (session.syncing) return 'Syncing…';
    if (session.error === 'unauthorized' || session.error === 'not_found') return "This phone isn't linked to the house anymore.";
    if (session.offline) return session.pending > 0 ? `Offline. ${waiting}.` : 'Offline. Showing what was saved last.';
    if (session.error) return "Couldn't sync just now. It will try again.";
    return session.pending > 0 ? `${waiting}.` : 'Up to date.';
  });
</script>

{#if view && me}
  <section class="panel" aria-labelledby="house-title">
    {#if partner}
      <h2 id="house-title" data-testid="house-names">{me.name} &amp; {partner.name}</h2>
      <p>You're both in. The house is yours.</p>
    {:else}
      <h2 id="house-title" data-testid="house-names">The door is open, {me.name}</h2>
      {#if view.pairingCode}
        <p>Give this code to your partner. They choose "I have a code" on their phone.</p>
        <p class="code" data-testid="pairing-code">{formatCode(view.pairingCode)}</p>
        <div class="row">
          <button type="button" class="quiet" onclick={() => view.pairingCode && copy(view.pairingCode)}>{copied ? 'Copied' : 'Copy code'}</button>
        </div>
        <p class="note">The code works once. After your partner has moved in, the house is closed to everyone else.</p>
      {:else}
        <p>Waiting for the other half of this house.</p>
      {/if}
    {/if}

    <p class="note" role="status" data-testid="sync-status">{status}</p>
    {#if session.rejected > 0}
      <div class="row">
        <p class="note" data-testid="rejected-note">Something you did no longer fit and was left out.</p>
        <button type="button" class="quiet" onclick={dismissRejected}>OK</button>
      </div>
    {/if}
  </section>
{/if}

<style>
  .code {
    font-family: var(--font-title);
    font-size: 2.1rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--terracotta);
    font-variant-numeric: lining-nums;
  }

  .row {
    align-items: center;
  }
</style>
