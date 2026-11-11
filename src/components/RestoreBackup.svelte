<script lang="ts">
  // Gerätestand aus einer Exportdatei übernehmen. Ist das Gerät schon gekoppelt, fragt der Knopf erst nach,
  // weil der Import den bisherigen Stand dieses Geräts ersetzt.
  import { DeviceFileError } from '../lib/device-file.ts';
  import { importDevice } from '../lib/session.svelte.ts';

  let { confirm = false }: { confirm?: boolean } = $props();

  let input = $state<HTMLInputElement>();
  let waiting = $state<string | null>(null);
  let busy = $state(false);
  let message = $state('');

  async function restore(text: string): Promise<void> {
    busy = true;
    waiting = null;
    try {
      await importDevice(text);
      message = 'Restored. Welcome back.';
    } catch (error) {
      if (!(error instanceof DeviceFileError)) console.error(error);
      message = error instanceof DeviceFileError ? error.message : "That didn't work. Please try again.";
    } finally {
      busy = false;
    }
  }

  async function chosen(): Promise<void> {
    const file = input?.files?.[0];
    if (!file) return;
    message = '';
    const text = await file.text();
    // Dieselbe Datei soll sich ein zweites Mal wählen lassen.
    if (input) input.value = '';
    if (confirm) waiting = text;
    else await restore(text);
  }
</script>

<input bind:this={input} class="file" type="file" accept="application/json,.json" aria-label="Backup file" onchange={chosen} />

{#if waiting !== null}
  <p>Replace what's on this phone with the backup?</p>
  <div class="row">
    <button type="button" onclick={() => waiting !== null && restore(waiting)}>Replace</button>
    <button type="button" class="quiet" onclick={() => (waiting = null)}>Cancel</button>
  </div>
{:else}
  <button type="button" class="quiet" disabled={busy} onclick={() => input?.click()}>Restore from a backup file</button>
{/if}
<p class="note" role="status" data-testid="restore-result">{message}</p>

<style>
  /* Das Dateifeld bleibt für Tastatur und Tests erreichbar, zu sehen ist nur der Knopf. */
  .file {
    position: absolute;
    width: 1px;
    height: 1px;
    min-height: 0;
    padding: 0;
    border: 0;
    opacity: 0;
    pointer-events: none;
  }

  .note:empty {
    display: none;
  }
</style>
