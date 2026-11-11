<script lang="ts">
  // Versionszeile und "Check for updates". Zieht in Phase 3 in die Einstellungen um.
  import { CHECK_MESSAGES } from '../lib/update-logic.ts';
  import { checkForUpdate, updates } from '../lib/update.svelte.ts';
  import { versionLine } from '../lib/version.ts';
</script>

<section class="about" aria-label="App version">
  <p class="version" data-testid="version-line">{versionLine}</p>
  <button type="button" disabled={updates.checking} onclick={() => void checkForUpdate()}>
    {updates.checking ? 'Checking…' : 'Check for updates'}
  </button>
  <p class="result" role="status" data-testid="update-result">
    {updates.result ? CHECK_MESSAGES[updates.result] : ''}
  </p>
</section>

<style>
  .about {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .version {
    color: var(--ink-soft);
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }

  .result {
    min-height: 1.45em;
    color: var(--ink-soft);
  }
</style>
