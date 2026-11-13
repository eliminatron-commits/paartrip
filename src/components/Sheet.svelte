<script lang="ts">
  // Blatt, das sich von unten über den Bildschirm legt (Erinnerungsstück lesen). Schließt mit Knopf, Escape
  // oder Tippen daneben.
  import type { Snippet } from 'svelte';

  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } = $props();

  let closer = $state<HTMLButtonElement | null>(null);
  $effect(() => closer?.focus());
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && onclose()} />

<div class="veil" role="presentation" onclick={(event) => event.target === event.currentTarget && onclose()}>
  <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
    <div class="inner">
      {@render children()}
      <button type="button" class="quiet" bind:this={closer} onclick={onclose}>Close</button>
    </div>
  </div>
</div>

<style>
  .veil {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: flex-end;
    background: color-mix(in srgb, var(--ink) 45%, transparent);
  }

  /* Das Blatt reicht bis zum unteren Rand; sein Inhalt rollt nur oberhalb des Home-Indikators. */
  .sheet {
    width: 100%;
    padding-bottom: var(--safe-bottom);
    border-radius: var(--radius) var(--radius) 0 0;
    background: var(--cream);
  }

  .inner {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-height: 75dvh;
    overflow-y: auto;
    padding: 24px calc(var(--safe-right) + 20px) 20px calc(var(--safe-left) + 20px);
  }

  .inner button {
    align-self: flex-start;
  }
</style>
