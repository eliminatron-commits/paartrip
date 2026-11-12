<script lang="ts">
  // Stand des Abgleichs. Solange alles stimmt, bleibt der Streifen unsichtbar (für Vorlesehilfen ist der
  // Text da); er erscheint, wenn etwas zu sagen ist: offline, Wartendes, ein Fehler, ein gelöstes Gerät.
  import { dismissRejected, session, startOver } from '../lib/session.svelte.ts';

  // Der Server kennt dieses Gerät oder sein Haus nicht mehr. Damit es nicht festhängt, lässt sich die
  // Kopplung hier lösen – erst nach einer Rückfrage, denn wartende Aktionen gehen dabei verloren.
  const unlinked = $derived(session.error === 'unauthorized' || session.error === 'not_found');
  let confirming = $state(false);
  let clearing = $state(false);

  async function clear(): Promise<void> {
    clearing = true;
    try {
      await startOver();
    } catch (error) {
      console.error(error);
    } finally {
      clearing = false;
      confirming = false;
    }
  }

  const waiting = $derived(`${session.pending} ${session.pending === 1 ? 'change' : 'changes'} waiting to be sent`);
  const status = $derived.by(() => {
    if (session.syncing) return 'Syncing…';
    if (unlinked) return "This phone isn't linked to the house anymore.";
    if (session.offline) return session.pending > 0 ? `Offline. ${waiting}.` : 'Offline. Showing what was saved last.';
    if (session.error) return "Couldn't sync just now. It will try again.";
    return session.pending > 0 ? `${waiting}.` : 'Up to date.';
  });
  // Während des Abgleichs bleibt stehen, was vorher galt – sonst blitzt der Streifen bei jeder Aktion auf.
  const calm = $derived(!unlinked && !session.offline && !session.error && (session.pending === 0 || session.syncing));
</script>

{#if session.status === 'paired'}
  <div class="notice" class:calm={calm && session.rejected === 0}>
    <p class:sr-only={calm} role="status" data-testid="sync-status">{status}</p>
    {#if unlinked}
      {#if confirming}
        <p>Forget the old house on this phone? Anything still waiting to be sent is lost.</p>
        <div class="row">
          <button type="button" disabled={clearing} onclick={clear}>Yes, start over</button>
          <button type="button" class="quiet" disabled={clearing} onclick={() => (confirming = false)}>Cancel</button>
        </div>
      {:else}
        <p class="note">You can start over here and open a new house, or move in again with a code.</p>
        <div class="row">
          <button type="button" class="quiet" onclick={() => (confirming = true)}>Start over</button>
        </div>
      {/if}
    {/if}
    {#if session.rejected > 0}
      <div class="row">
        <p data-testid="rejected-note">Something you did no longer fit and was left out.</p>
        <button type="button" class="quiet" onclick={dismissRejected}>OK</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .notice {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px calc(var(--safe-right) + 20px) 10px calc(var(--safe-left) + 20px);
    background: var(--cream-deep);
    box-shadow: 0 1px 0 rgb(35 55 60 / 0.12);
    font-size: 0.95rem;
  }

  .notice.calm {
    display: contents;
  }

  .row {
    align-items: center;
  }
</style>
