<script lang="ts">
  // Kopfleiste: liegt dunkel unter Uhr und Dynamic Island (die Uhr ist dort immer weiß) und trägt das
  // Einstellungs-Symbol – und, sobald das Gerät gekoppelt ist, den Knopf, der den Stand neu holt.
  import { session, syncNow } from '../lib/session.svelte.ts';
  import { ui } from '../lib/ui.svelte.ts';

  // Von selbst gleicht die App nur beim Öffnen, bei der Rückkehr und nach eigenen Aktionen ab. Wer mit
  // offener App auf den anderen wartet, holt dessen Schritt mit diesem Knopf.
  // Der Abgleich dauert oft nur einen Augenblick: Das Symbol dreht sich deshalb mindestens eine Umdrehung
  // lang, damit zu sehen ist, dass das Tippen angekommen ist.
  const TURN_MS = 700;
  let refreshing = $state(false);

  async function refresh(): Promise<void> {
    if (refreshing) return;
    refreshing = true;
    try {
      // Was dabei schiefgeht (kein Netz, Server nicht erreichbar), sagt der Streifen unter der Kopfleiste.
      await Promise.all([syncNow(), new Promise((done) => setTimeout(done, TURN_MS))]);
    } catch (error) {
      console.error(error);
    } finally {
      refreshing = false;
    }
  }
</script>

<!-- Drei Spalten wie die Statusleiste darüber: unter der Uhr "Refresh", unter der Dynamic Island der Name,
     unter Empfang und Akku die Einstellungen. -->
<header class="top">
  <div class="slot start">
    {#if session.status === 'paired'}
      <button type="button" class="plain icon" class:refreshing aria-label="Refresh" aria-busy={refreshing} onclick={refresh}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19.05 14.57A7.5 7.5 0 1 1 15.75 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
          <path d="M18.52 7.1 17.35 2.73 14.15 8.27z" />
        </svg>
      </button>
    {/if}
  </div>
  <div class="brand">
    <h1>Nhà Mình</h1>
    <p class="sub">PaarTrip</p>
  </div>
  <div class="slot end">
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
  </div>
</header>

<style>
  .top {
    /*
     * Eine einfarbige, am oberen Rand haftende Fläche: Dann malt iOS (ab 26) keinen milchigen Schleier über
     * Uhr und Kopf, sondern setzt die Statusleiste in ihrer Farbe fort. Die Uhr steht so im selben Petrol
     * wie der Name. sticky ändert hier nichts an der Lage – die App selbst rollt nicht, nur ihr Inhalt.
     */
    position: sticky;
    top: 0;
    z-index: 5;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 8px;
    /* Der Hintergrund reicht bis an den oberen Rand; Text und Knöpfe beginnen erst unterhalb der Safe Area. */
    padding: var(--safe-top) calc(var(--safe-right) + 12px) 4px calc(var(--safe-left) + 12px);
    background: var(--petrol);
  }

  /* Im Hochformat stehen die Knöpfe mittig unter Uhr bzw. Akku, im Querformat (ohne Statusleiste) am Rand. */
  .slot {
    display: flex;
    justify-content: center;
  }

  @media (orientation: landscape) {
    .start {
      justify-content: flex-start;
    }

    .end {
      justify-content: flex-end;
    }
  }

  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
  }

  h1 {
    color: var(--cream);
    font-size: 1.3rem;
    line-height: 1.1;
  }

  .sub {
    color: var(--cream-deep);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.22em;
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

  /* Blasser, solange geholt wird – das bleibt auch sichtbar, wenn Bewegung abgeschaltet ist. */
  .refreshing svg {
    opacity: 0.6;
    animation: turn 0.7s linear infinite;
  }

  @keyframes turn {
    to {
      transform: rotate(360deg);
    }
  }
</style>
