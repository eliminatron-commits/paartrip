<script lang="ts">
  // Gerüst der App: Kopfleiste, der Bildschirm des gewählten Reiters, untere Leiste. Über allem liegen
  // der Update-Hinweis und – wenn ein Meilenstein erreicht ist – dessen Szene.
  import Pairing from './components/Pairing.svelte';
  import SyncNotice from './components/SyncNotice.svelte';
  import TabBar from './components/TabBar.svelte';
  import TopBar from './components/TopBar.svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';
  import { content } from './lib/content.ts';
  import { awaitsMyConfirm, chapterFor, myTurn, nextMove, openMoves, unseenMilestone } from './lib/house.ts';
  import { session } from './lib/session.svelte.ts';
  import { todayWaits } from './lib/tasks.ts';
  import { arrive } from './lib/motion.ts';
  import { setMusicScreen } from './lib/audio.ts';
  import { ui } from './lib/ui.svelte.ts';
  import GiftsScreen from './screens/gifts/GiftsScreen.svelte';
  import HomeScreen from './screens/home/HomeScreen.svelte';
  import MilestoneScene from './screens/milestone/MilestoneScene.svelte';
  import SettingsScreen from './screens/settings/SettingsScreen.svelte';
  import TodayScreen from './screens/today/TodayScreen.svelte';

  const view = $derived(session.status === 'paired' ? session.view : null);
  const chapter = $derived(view ? chapterFor(view, content) : null);
  /** Das Dach des ersten Kapitels: Dort beginnt jedes Haus. */
  const roof = content.chapters[0]?.roof;
  const moves = $derived(view ? openMoves(view, session.queued) : []);
  const move = $derived(nextMove(moves));
  const milestone = $derived(view ? unseenMilestone(view, session.queued) : null);
  const waiting = $derived({
    home: myTurn(moves),
    today: view && chapter ? todayWaits(view, chapter, session.queued) : false,
    gifts: view ? view.coupons.some((c) => awaitsMyConfirm(c, view.you)) : false,
  });

  // Die Musik folgt dem Bildschirm: bei den Aufgaben ein anderes Lied als im Haus.
  $effect(() => {
    setMusicScreen(ui.settings ? 'settings' : view ? ui.tab : 'welcome');
  });

  // Ein neuer Bildschirm beginnt oben.
  let main = $state<HTMLElement | null>(null);
  $effect(() => {
    void ui.tab;
    void ui.settings;
    main?.scrollTo(0, 0);
  });
</script>

<div class="app">
  <TopBar />
  <SyncNotice />

  <main bind:this={main}>
    <!-- Beim Wechsel des Bildschirms blendet der neue weich auf. -->
    {#key ui.settings ? 'settings' : ui.tab}
      <div class="screen" in:arrive>
        {#if ui.settings}
          <SettingsScreen />
        {:else if session.status === 'unpaired'}
          <!-- Willkommen: Über dem Blatt steht schon das Dach des Hauses, in das die beiden einziehen. -->
          <div class="dusk welcome" aria-hidden="true">
            {#if roof}<svg viewBox={roof.viewBox}>{@html roof.body}</svg>{/if}
          </div>
          <div class="page"><Pairing /></div>
        {:else if view && chapter}
          {#if ui.tab === 'home'}
            <HomeScreen {view} {chapter} {move} />
          {:else if ui.tab === 'today'}
            <TodayScreen {view} {chapter} {move} />
          {:else}
            <GiftsScreen {view} {chapter} />
          {/if}
        {:else if view}
          <div class="page">
            <p>This house is further along than this version of the app. Please update it in the settings.</p>
          </div>
        {/if}
      </div>
    {/key}
  </main>

  {#if view && !ui.settings}
    <TabBar {waiting} />
  {:else}
    <!-- Ohne untere Leiste endet der Inhalt über dem Home-Indikator. -->
    <div class="floor"></div>
  {/if}
  <UpdateBanner raised={view !== null && !ui.settings} />

  {#if view && chapter && milestone && view.players.b}
    {#key milestone.at}
      <MilestoneScene {view} {chapter} {milestone} />
    {/key}
  {/if}
</div>

<style>
  .app {
    height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  main {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }

  .floor {
    flex: none;
    height: var(--safe-bottom);
  }

  /* Das Dach steht mittig im Himmel; sein unterer Rand verschwindet hinter dem Blatt. */
  .welcome {
    align-items: center;
    padding-top: 10px;
    padding-bottom: 0;
  }

  .welcome svg {
    display: block;
    width: min(100%, 420px);
    margin-bottom: 10px;
  }
</style>
