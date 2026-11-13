<script lang="ts">
  // Today: die eine aktuelle Aufgabe. Offen zeigt sie den Baustein ihrer Art; erledigt bleibt sie stehen, bis
  // die nächste erscheint – frühestens am folgenden Tag. Darunter: der Stand, der Weg zum Bauzug und die
  // aufgedeckten Antworten der letzten Frage.
  import type { Chapter } from '../../../shared/content-schema.ts';
  import { type HouseView, otherSlot } from '../../../shared/model.ts';
  import { type Move } from '../../lib/house.ts';
  import { session } from '../../lib/session.svelte.ts';
  import { reveals, today } from '../../lib/tasks.ts';
  import { go } from '../../lib/ui.svelte.ts';
  import KnowMeTask from './KnowMeTask.svelte';
  import PuzzleTask from './PuzzleTask.svelte';
  import RealLifeTask from './RealLifeTask.svelte';
  import Reveal from './Reveal.svelte';

  let { view, chapter, move }: { view: HouseView; chapter: Chapter; move: Move | null } = $props();

  const partner = $derived(view.players[otherSlot(view.you)]);
  const name = $derived(partner?.name ?? 'Your partner');
  const now = $derived(today(view, chapter));
  const unveiled = $derived(reveals(view, chapter, session.queued));
  const total = $derived(chapter.tasks.length);
  const done = $derived(view.done.length);
</script>

<header class="dusk">
  <h2>Today</h2>
  {#if partner}
    <p class="note" data-testid="today-progress">{done} of {total} tasks done.</p>
  {/if}
</header>
<div class="page">
  {#if !partner}
    <section class="panel">
      <p>Once your partner has moved in, a small task for the two of you waits here.</p>
    </section>
  {:else}
    {#if now && !now.done}
      <!-- Mit der Aufgabe wechselt der ganze Baustein, samt allem, was darin angefangen wurde. -->
      {#key now.task.taskId}
        {#if now.spec.type === 'puzzle'}
          <PuzzleTask spec={now.spec} you={view.you} partner={name} />
        {:else if now.spec.type === 'knowme'}
          <KnowMeTask task={now.task} spec={now.spec} partner={name} />
        {:else}
          <RealLifeTask task={now.task} spec={now.spec} you={view.you} partner={name} />
        {/if}
      {/key}
    {:else if now}
      <section class="panel" aria-labelledby="done-title" data-testid="task-done">
        {#if view.nextTaskOn}
          <h2 id="done-title">Done for today</h2>
          <p>You finished this one together. A new task arrives tomorrow.</p>
        {:else}
          <h2 id="done-title">That was the last one</h2>
          <p>You finished every task of this chapter together.</p>
        {/if}
      </section>
    {:else if view.task}
      <section class="panel">
        <p>This task is newer than this version of the app. Please update it in the settings.</p>
      </section>
    {:else}
      <section class="panel">
        <p>A small task for the two of you is on its way.</p>
      </section>
    {/if}

    {#if move}
      <section class="panel" aria-labelledby="build-title">
        <h2 id="build-title">Something waits at home</h2>
        <p>A finished task brings a new piece for the house.</p>
        <div class="row">
          <button type="button" class="quiet" onclick={() => go('home')}>Go to the house</button>
        </div>
      </section>
    {/if}

    {#each unveiled as reveal (reveal.taskId)}
      <Reveal {reveal} partner={name} />
    {/each}
  {/if}
</div>
