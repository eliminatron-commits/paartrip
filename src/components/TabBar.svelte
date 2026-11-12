<script lang="ts">
  // Untere Leiste: Home, Today, Gifts. Ein Punkt zeigt, wo etwas auf diesen Spieler wartet.
  import { go, type Tab, ui } from '../lib/ui.svelte.ts';

  let { waiting }: { waiting: Record<Tab, boolean> } = $props();

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'home', label: 'Home', icon: 'M12 3 2.5 11.2h2.7V20h5.3v-5.2h3V20h5.3v-8.8h2.7z' },
    {
      id: 'today',
      label: 'Today',
      icon: 'M7 2.5h2V5h6V2.5h2V5h1.5A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.500v-12A1.5 1.5 0 0 1 5.500 5H7zM6 10v8h12v-8zm2.5 2.500h3v3h-3z',
    },
    {
      id: 'gifts',
      label: 'Gifts',
      icon: 'M12 6.800C10.800 3.600 6.500 3.300 6.500 6.200c0 .5.2 1 .5 1.300H3.500v4h17v-4H17c.3-.3.5-.8.5-1.300 0-2.900-4.300-2.600-5.500.6zM4.500 13h6.500v7.500H6A1.500 1.500 0 0 1 4.500 19zm8.500 0h6.500v6a1.500 1.500 0 0 1-1.500 1.500h-5z',
    },
  ];
</script>

<nav class="tabs" aria-label="Main">
  {#each TABS as tab (tab.id)}
    {@const active = ui.tab === tab.id}
    <button type="button" class="plain tab" class:active aria-current={active ? 'page' : undefined} onclick={() => go(tab.id)}>
      <span class="glyph">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={tab.icon} fill-rule="evenodd" /></svg>
        {#if waiting[tab.id]}<span class="dot" data-testid="waiting-{tab.id}"><span class="sr-only">Something is waiting for you</span></span>{/if}
      </span>
      <span>{tab.label}</span>
    </button>
  {/each}
</nav>

<style>
  .tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    /* Der Hintergrund läuft bis zum unteren Rand, die Knöpfe bleiben über dem Home-Indikator. */
    padding: 6px calc(var(--safe-right) + 10px) calc(var(--safe-bottom) + 6px) calc(var(--safe-left) + 10px);
    background: var(--cream-deep);
    box-shadow: 0 -1px 0 rgb(35 55 60 / 0.12);
  }

  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 52px;
    border-radius: 14px;
    color: var(--ink-soft);
    font-size: 0.8rem;
    font-weight: 700;
  }

  .tab.active {
    background: var(--cream);
    color: var(--terracotta);
  }

  .glyph {
    position: relative;
    display: block;
    width: 26px;
    height: 26px;
  }

  .glyph svg {
    width: 100%;
    height: 100%;
    fill: currentColor;
  }

  .dot {
    position: absolute;
    top: -2px;
    right: -6px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--terracotta);
    box-shadow: 0 0 0 2px var(--cream-deep);
  }

  .tab.active .dot {
    box-shadow: 0 0 0 2px var(--cream);
  }
</style>
