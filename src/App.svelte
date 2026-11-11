<script lang="ts">
  import AboutUpdates from './components/AboutUpdates.svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';
  import { content } from './lib/content.ts';

  // Phase 1: leere Hülle. Navigation, Haus und Einstellungen folgen in Phase 3.
  const chapter = content.chapters[0];
</script>

<div class="app">
  <header class="top">
    <h1>Nhà Mình</h1>
    <p class="sub">PaarTrip</p>
  </header>

  <main>
    {#if chapter}
      <section class="card">
        <p class="eyebrow">Chapter {chapter.number}</p>
        <h2>{chapter.title}</h2>
        <p class="vi" lang="vi">{chapter.titleVi}</p>
        <p class="lead">The house is still empty. Soon the two of you will fill it, one small task at a time.</p>
      </section>
    {/if}
    <AboutUpdates />
  </main>

  <UpdateBanner />
</div>

<style>
  .app {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  .top {
    /* Die dunkle Leiste liegt unter Uhr und Dynamic Island; der Text beginnt erst unterhalb der Safe Area. */
    padding: calc(var(--safe-top) + 10px) calc(var(--safe-right) + 20px) 14px calc(var(--safe-left) + 20px);
    background: var(--petrol);
  }

  .top h1 {
    color: var(--cream);
    font-size: 1.6rem;
  }

  .sub {
    color: var(--cream-deep);
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 24px calc(var(--safe-right) + 20px) calc(var(--safe-bottom) + 96px) calc(var(--safe-left) + 20px);
  }

  .card {
    padding: 24px 20px;
    border-radius: var(--radius);
    background: var(--cream-deep);
  }

  .eyebrow {
    color: var(--sage-deep);
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .card h2 {
    margin-top: 4px;
    font-size: 1.9rem;
  }

  .vi {
    font-family: var(--font-title);
    color: var(--terracotta);
  }

  .lead {
    margin-top: 14px;
  }
</style>
