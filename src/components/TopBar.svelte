<script lang="ts">
  // Kopfleiste: liegt dunkel unter Uhr und Dynamic Island (die Uhr ist dort immer weiß) und trägt das Einstellungs-Symbol.
  import { ui } from '../lib/ui.svelte.ts';
</script>

<header class="top">
  <div>
    <h1>Nhà Mình</h1>
    <p class="sub">PaarTrip</p>
  </div>
  <button type="button" class="plain icon" aria-label={ui.settings ? 'Close settings' : 'Settings'} onclick={() => (ui.settings = !ui.settings)}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {#if ui.settings}
        <path d="M6.4 4.6 12 10.2l5.6-5.6 1.8 1.8L13.8 12l5.6 5.6-1.8 1.8L12 13.8l-5.6 5.6-1.8-1.8L10.2 12 4.6 6.4z" />
      {:else}
        <path
          d="M10.3 2h3.4l.5 2.6c.6.2 1.2.5 1.7.8l2.5-.9 1.7 3-2 1.7a7 7 0 0 1 0 1.9l2 1.7-1.7 3-2.5-.9c-.5.3-1.1.6-1.7.8l-.5 2.6h-3.4l-.5-2.6a7 7 0 0 1-1.7-.8l-2.5.9-1.7-3 2-1.7a7 7 0 0 1 0-1.9l-2-1.7 1.7-3 2.5.9c.5-.3 1.1-.6 1.7-.8zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"
          fill-rule="evenodd"
        />
      {/if}
    </svg>
  </button>
</header>

<style>
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    /* Der Hintergrund reicht bis an den oberen Rand; Text und Knopf beginnen erst unterhalb der Safe Area. */
    padding: calc(var(--safe-top) + 8px) calc(var(--safe-right) + 12px) 10px calc(var(--safe-left) + 20px);
    background: var(--petrol);
  }

  h1 {
    color: var(--cream);
    font-size: 1.4rem;
  }

  .sub {
    color: var(--cream-deep);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .icon {
    display: grid;
    place-items: center;
    width: var(--tap);
    height: var(--tap);
    border-radius: 50%;
    color: var(--cream);
  }

  .icon svg {
    width: 26px;
    height: 26px;
    fill: currentColor;
  }

  .icon:focus-visible {
    outline-color: var(--cream);
  }
</style>
