<script lang="ts">
  // Hinweis statt Zwang: erscheint, sobald eine neue Version wartet; übernommen wird erst auf Tippen.
  import { applyUpdate, updates } from '../lib/update.svelte.ts';
</script>

{#if updates.available}
  <div class="banner" role="status" data-testid="update-banner">
    <span>New version</span>
    <button type="button" onclick={applyUpdate}>Update</button>
  </div>
{/if}

<style>
  .banner {
    position: fixed;
    left: calc(var(--safe-left) + 16px);
    right: calc(var(--safe-right) + 16px);
    bottom: calc(var(--safe-bottom) + 16px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 10px 10px 20px;
    border-radius: 999px;
    background: var(--petrol);
    color: var(--cream);
    font-weight: 700;
    box-shadow: 0 6px 20px rgb(35 55 60 / 0.3);
  }

  .banner button:focus-visible {
    outline-color: var(--cream);
  }
</style>
