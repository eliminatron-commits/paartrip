<script lang="ts">
  // Ein geteiltes Rätsel als Tagesaufgabe: Titel, Erklärung der Rätselart vor dem ersten Start, dann die Hälfte
  // dieses Spielers. Die Rolle bestimmt die Ansicht; geprüft wird die Lösung auf dem Gerät dessen, der sie
  // eingibt, und sein "gelöst" schließt die Aufgabe für beide ab. Der Baustein je Rätselart liegt in puzzles/.
  import type { PuzzleTask } from '../../../shared/content-schema.ts';
  import type { Slot } from '../../../shared/model.ts';
  import { puzzleRole } from '../../../shared/rules.ts';
  import { playSound } from '../../lib/audio.ts';
  import { dispatch, session, updateSettings } from '../../lib/session.svelte.ts';
  import { taskSent } from '../../lib/tasks.ts';
  import { PUZZLE_TEXTS } from './puzzle-texts.ts';
  import BlindMaze from './puzzles/BlindMaze.svelte';
  import DescribeArrange from './puzzles/DescribeArrange.svelte';
  import MapLegend from './puzzles/MapLegend.svelte';
  import Sequence from './puzzles/Sequence.svelte';
  import SplitCode from './puzzles/SplitCode.svelte';
  import SpotDifference from './puzzles/SpotDifference.svelte';

  let { spec, you, partner }: { spec: PuzzleTask; you: Slot; partner: string } = $props();

  const role = $derived(puzzleRole(spec, you));
  const texts = $derived(PUZZLE_TEXTS[spec.kind]);
  const sent = $derived(taskSent(session.queued, 'puzzle.solve', spec.id));

  // Die Erklärung erscheint vor dem ersten Start jeder Rätselart und lässt sich später wieder aufschlagen.
  const seen = $derived(session.settings.introSeen.includes(spec.kind));
  let reopened = $state(false);
  const explaining = $derived(!seen || reopened);

  async function start(): Promise<void> {
    reopened = false;
    if (!seen) await updateSettings({ introSeen: [...session.settings.introSeen, spec.kind] });
  }

  // Zwischenstand: was auf diesem Gerät schon gelegt oder gewählt ist.
  const saved = $derived(session.settings.draft?.taskId === spec.id ? session.settings.draft.value : null);
  const keep = (value: unknown): void => void updateSettings({ draft: { taskId: spec.id, value } });

  async function solved(): Promise<void> {
    playSound('solve');
    await dispatch({ type: 'puzzle.solve', taskId: spec.id });
  }
</script>

<section class="panel" aria-labelledby="task-title" data-testid="task" data-task={spec.id} data-type="puzzle" data-kind={spec.kind} data-role={role}>
  <p class="eyebrow">Puzzle · {texts.name}</p>
  <h2 id="task-title">{spec.title}</h2>

  {#if explaining}
    <div class="intro" data-testid="puzzle-intro">
      <h3>How it works</h3>
      <p>{texts.idea}</p>
      <p>{texts.role[role](partner)}</p>
      <p class="note">Call or message each other – neither of you can solve this alone. Try as often as you like.</p>
      <div class="row">
        <button type="button" onclick={start}>{seen ? 'Back to the puzzle' : 'Got it'}</button>
      </div>
    </div>
  {:else if sent}
    <p class="note" data-testid="task-sent">Solved! Saved on this phone. It's on its way.</p>
  {:else}
    <p data-testid="puzzle-role">{texts.role[role](partner)}</p>
    <div class="board" data-testid="puzzle">
      {#if spec.kind === 'map-legend'}
        <MapLegend data={spec.data} {role} {saved} onchange={keep} onsolved={solved} />
      {:else if spec.kind === 'split-code'}
        <SplitCode data={spec.data} {role} {saved} onchange={keep} onsolved={solved} />
      {:else if spec.kind === 'describe-arrange'}
        <DescribeArrange data={spec.data} {role} {saved} onchange={keep} onsolved={solved} />
      {:else if spec.kind === 'spot-difference'}
        <SpotDifference data={spec.data} {role} {saved} onchange={keep} onsolved={solved} />
      {:else if spec.kind === 'sequence'}
        <Sequence data={spec.data} {role} {saved} onchange={keep} onsolved={solved} />
      {:else}
        <BlindMaze data={spec.data} {role} {saved} onchange={keep} onsolved={solved} />
      {/if}
    </div>
    <div class="row">
      <button type="button" class="quiet" onclick={() => (reopened = true)}>How it works</button>
    </div>
  {/if}
</section>

<style>
  .intro,
  .board {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
</style>
