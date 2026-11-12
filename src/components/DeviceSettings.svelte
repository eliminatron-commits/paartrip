<script lang="ts">
  // Einstellungen dieses Geräts: Kopplungsstatus, Mitteilungen, Sichern und Wiederherstellen.
  // Teil des Bildschirms "Settings".
  import { otherSlot } from '../../shared/model.ts';
  import { disablePush, enablePush, push, sendTestPush } from '../lib/push.svelte.ts';
  import { exportDevice, session } from '../lib/session.svelte.ts';
  import RestoreBackup from './RestoreBackup.svelte';

  const view = $derived(session.view);
  const me = $derived(view?.players[view.you] ?? null);
  const partner = $derived(view ? view.players[otherSlot(view.you)] : null);

  let saving = $state(false);
  let saveProblem = $state('');

  async function save(): Promise<void> {
    saving = true;
    saveProblem = '';
    try {
      await exportDevice();
    } catch (error) {
      console.error(error);
      saveProblem = "The backup couldn't be created. Please try again.";
    } finally {
      saving = false;
    }
  }
</script>

{#if view && me}
  <section class="panel" aria-labelledby="phone-title">
    <h2 id="phone-title">This phone</h2>
    <p data-testid="pairing-status">
      Linked as {me.name}.
      {partner ? `You share the house with ${partner.name}.` : 'Your partner has not moved in yet.'}
    </p>

    <h3>Notifications</h3>
    {#if !push.supported}
      <p class="note" data-testid="push-unsupported">Notifications work once the app is on your Home Screen and opened from there.</p>
    {:else if session.settings.push}
      <p>You get a note when it's your turn or a gift opens.</p>
      <div class="row">
        <button type="button" class="quiet" disabled={push.busy} onclick={sendTestPush}>Send a test</button>
        <button type="button" class="quiet" disabled={push.busy} onclick={disablePush}>Turn off</button>
      </div>
    {:else}
      <p>Get a note when it's your turn or a gift opens. No reminders, no nagging.</p>
      <div class="row">
        <button type="button" disabled={push.busy} onclick={enablePush}>Turn on notifications</button>
      </div>
    {/if}
    <p class="note" role="status" data-testid="push-message">{push.message}</p>

    <h3>Backup</h3>
    <p>Save your place in the house as a file, for a new phone or just in case.</p>
    <p class="note">Keep the file to yourself. Whoever has it can act as you in this house.</p>
    <div class="row">
      <button type="button" class="quiet" disabled={saving} onclick={save}>Save a backup file</button>
    </div>
    <p class="problem" role="alert">{saveProblem}</p>
    <RestoreBackup confirm />
  </section>
{/if}

<style>
  .note:empty,
  .problem:empty {
    display: none;
  }
</style>
