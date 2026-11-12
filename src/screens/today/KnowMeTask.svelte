<script lang="ts">
  // Kennst-du-mich als Tagesaufgabe: Jeder beantwortet die Frage für sich und tippt, was der andere sagt.
  // Aufgedeckt wird erst, wenn beide abgegeben haben (Reveal.svelte) – bis dahin erfährt dieses Gerät vom
  // anderen nur, dass er abgegeben hat.
  import type { KnowMeTask } from '../../../shared/content-schema.ts';
  import type { ActiveTaskView, KnowMeAnswer } from '../../../shared/model.ts';
  import { answerText } from '../../lib/house.ts';
  import { dispatch, session, updateSettings } from '../../lib/session.svelte.ts';
  import { taskSent } from '../../lib/tasks.ts';

  let { task, spec, partner }: { task: ActiveTaskView; spec: KnowMeTask; partner: string } = $props();

  const progress = $derived(task.progress.type === 'knowme' ? task.progress : null);
  const sent = $derived(taskSent(session.queued, 'knowme.submit', spec.id));
  const options = $derived(spec.answer.kind === 'choice' ? spec.answer.options : null);
  const maxLength = $derived(spec.answer.kind === 'text' ? spec.answer.maxLength : 0);

  // Zwischenstand: was schon gewählt oder getippt ist, übersteht einen Wechsel in den Messenger.
  interface Entered {
    own: number | string | null;
    guess: number | string | null;
  }
  function restored(): Entered {
    const draft = session.settings.draft;
    const value = draft?.taskId === spec.id ? (draft.value as Partial<Entered> | null) : null;
    const fits = (entry: unknown) => (options ? typeof entry === 'number' && entry < options.length : typeof entry === 'string');
    return { own: fits(value?.own) ? (value?.own ?? null) : null, guess: fits(value?.guess) ? (value?.guess ?? null) : null };
  }
  let entered = $state(restored());
  const keep = (): void => void updateSettings({ draft: { taskId: spec.id, value: { ...entered } } });

  function answer(entry: number | string | null): KnowMeAnswer | null {
    if (typeof entry === 'number') return { kind: 'choice', option: entry };
    const text = (entry ?? '').trim();
    return text ? { kind: 'text', text } : null;
  }
  const own = $derived(answer(entered.own));
  const guess = $derived(answer(entered.guess));

  async function submit(): Promise<void> {
    if (!own || !guess) return;
    await dispatch({ type: 'knowme.submit', taskId: spec.id, own, guess });
  }
</script>

{#snippet field(which: 'own' | 'guess', legend: string)}
  {#if options}
    <fieldset data-testid="knowme-{which}">
      <legend>{legend}</legend>
      {#each options as option, index (index)}
        <button
          type="button"
          class="plain option"
          class:picked={entered[which] === index}
          role="radio"
          aria-checked={entered[which] === index}
          onclick={() => {
            entered[which] = index;
            keep();
          }}
        >
          {option}
        </button>
      {/each}
    </fieldset>
  {:else}
    <label data-testid="knowme-{which}">
      {legend}
      <!-- Gesichert wird bei jedem Zeichen, nicht erst beim Verlassen des Felds: Wechselt man mitten im Tippen in den
           Messenger, beendet iOS die App, ohne dass das Feld je verlassen wurde. -->
      <input
        type="text"
        maxlength={maxLength}
        autocomplete="off"
        value={entered[which] ?? ''}
        oninput={(event) => {
          entered[which] = event.currentTarget.value;
          keep();
        }}
      />
    </label>
  {/if}
{/snippet}

<section class="panel" aria-labelledby="task-title" data-testid="task" data-task={spec.id} data-type="knowme">
  <p class="eyebrow">Know me?</p>
  <h2 id="task-title">{spec.question}</h2>

  {#if progress?.mine}
    <p>
      You said <strong>{answerText(spec, progress.mine.own)}</strong> and guessed <strong>{answerText(spec, progress.mine.guess)}</strong> for {partner}.
    </p>
    <p class="note" data-testid="task-waiting">Now it's {partner}'s turn. Both answers are unveiled once {partner} is in.</p>
  {:else if sent}
    <p class="note" data-testid="task-sent">Your answers are saved on this phone. They're on their way.</p>
  {:else}
    <p>Answer for yourself, then guess what {partner} will say. Your answers stay hidden until both of you are in.</p>
    {#if progress?.theirsSubmitted}<p class="note" data-testid="partner-in">{partner} has already answered.</p>{/if}
    {@render field('own', 'Your answer')}
    {@render field('guess', `What will ${partner} say?`)}
    <div class="row">
      <button type="button" disabled={!own || !guess} onclick={submit}>Lock it in</button>
    </div>
  {/if}
</section>

<style>
  fieldset {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    margin-bottom: 6px;
    padding: 0;
    font-weight: 700;
  }

  .option {
    padding: 10px 16px;
    border-radius: 12px;
    background: var(--cream);
    box-shadow: inset 0 0 0 2px var(--ink-soft);
  }

  .option.picked {
    box-shadow: inset 0 0 0 3px var(--petrol);
    color: var(--petrol);
    font-weight: 700;
  }
</style>
