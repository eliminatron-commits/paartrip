<script lang="ts">
  // Today: Hier erscheint mit dem Aufgabenablauf (Phase 4) die Tagesaufgabe. Bis dahin zeigt der Bildschirm
  // den Stand – und, solange der Server Test-Aufgaben annimmt, einen Knopf zum Ausprobieren.
  import type { Chapter } from '../../../shared/content-schema.ts';
  import { type HouseView, otherSlot } from '../../../shared/model.ts';
  import { playSound } from '../../lib/audio.ts';
  import { type Move } from '../../lib/house.ts';
  import { dispatch, session } from '../../lib/session.svelte.ts';
  import { go } from '../../lib/ui.svelte.ts';

  let { view, chapter, move }: { view: HouseView; chapter: Chapter; move: Move | null } = $props();

  const partner = $derived(view.players[otherSlot(view.you)]);
  const total = $derived(chapter.milestones.at(-1) ?? 0);
  const done = $derived(view.done.length);
  const testSent = $derived(session.queued.some((a) => a.type === 'test.completeTask'));

  async function finishTestTask(): Promise<void> {
    playSound('solve');
    await dispatch({ type: 'test.completeTask' });
  }
</script>

<div class="page">
  <h2>Today</h2>

  {#if !partner}
    <section class="panel">
      <p>Once your partner has moved in, a small task for the two of you waits here.</p>
    </section>
  {:else}
    <section class="panel" aria-labelledby="task-title">
      <h2 id="task-title">Daily tasks are on their way</h2>
      <p>Soon a small task for the two of you waits here: a puzzle to solve together, a question about each other, or a little something in real life.</p>
      <p class="note" data-testid="today-progress">{done} of {total} tasks done.</p>
    </section>

    {#if move}
      <section class="panel" aria-labelledby="build-title">
        <h2 id="build-title">Something waits at home</h2>
        <p>A finished task brings a new piece for the house.</p>
        <div class="row">
          <button type="button" class="quiet" onclick={() => go('home')}>Go to the house</button>
        </div>
      </section>
    {/if}

    {#if view.testActions}
      <section class="panel test" aria-labelledby="test-title">
        <p class="eyebrow">Test mode</p>
        <h2 id="test-title">Try it out</h2>
        <p>Until the real tasks arrive, a test task counts as done by both of you. It brings a build turn, and gifts open at the milestones.</p>
        <div class="row">
          <button type="button" data-testid="test-task" disabled={testSent || done >= total} onclick={finishTestTask}>Finish a test task</button>
        </div>
        {#if done >= total}
          <p class="note">All {total} tasks of this chapter are done.</p>
        {/if}
      </section>
    {/if}
  {/if}
</div>

<style>
  .test {
    background: transparent;
    box-shadow: inset 0 0 0 2px var(--sage-deep);
  }
</style>
