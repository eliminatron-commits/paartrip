<script lang="ts">
  // Reihenfolge. Rolle 1 (lead) sieht die Schritte durcheinander und schiebt sie mit den Pfeilen an ihren Platz,
  // Rolle 2 liest die Hinweise vor. Geprüft wird hier auf dem Gerät.
  import type { PuzzleRole } from '../../../../shared/puzzles/kinds.ts';
  import { isSolved, type SequenceData, startOrder } from '../../../../shared/puzzles/sequence.ts';

  let {
    data,
    role,
    saved,
    onchange,
    onsolved,
  }: {
    data: SequenceData;
    role: PuzzleRole;
    /** Zuletzt gesicherter Zwischenstand dieses Rätsels auf diesem Gerät, sonst null. */
    saved: unknown;
    /** Zwischenstand sichern. */
    onchange: (value: unknown) => void;
    /** Die Eingabe stimmt. */
    onsolved: () => void;
  } = $props();

  // Ein gesicherter Stand zählt nur, wenn er jeden Schritt genau einmal enthält.
  const restored = (): number[] => {
    const fits =
      Array.isArray(saved) &&
      saved.length === data.steps.length &&
      data.steps.every((_, step) => saved.filter((entry) => entry === step).length === 1);
    return fits ? [...(saved as number[])] : startOrder(data);
  };

  let order = $state(restored());
  let feedback = $state('');

  function move(place: number, by: -1 | 1): void {
    const target = place + by;
    const here = order[place];
    const there = order[target];
    if (here === undefined || there === undefined) return;
    order[place] = there;
    order[target] = here;
    feedback = '';
    onchange([...order]);
  }

  function check(): void {
    if (isSolved(data, order)) onsolved();
    else feedback = "That's not the order yet. Listen to the hints once more.";
  }
</script>

{#if role === 'lead'}
  <ol class="steps" data-testid="puzzle-input">
    {#each order as step, place (step)}
      {@const text = data.steps[step]}
      <li class="step" data-testid="sequence-step" data-step={step}>
        <span class="text">{text}</span>
        <span class="moves">
          <button
            type="button"
            class="plain move"
            aria-label="Move up: {text}"
            disabled={place === 0}
            onclick={() => move(place, -1)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 15l7-7 7 7" /></svg>
          </button>
          <button
            type="button"
            class="plain move"
            aria-label="Move down: {text}"
            disabled={place === order.length - 1}
            onclick={() => move(place, 1)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 9l7 7 7-7" /></svg>
          </button>
        </span>
      </li>
    {/each}
  </ol>

  <p class="problem" role="status" data-testid="puzzle-feedback">{feedback}</p>
  <div class="row">
    <button type="button" data-testid="puzzle-check" onclick={check}>Check the order</button>
  </div>
{:else}
  <p class="note">Read these hints out to your partner:</p>
  <ul class="hints" data-testid="sequence-hints">
    {#each data.hints as hint, index (index)}
      <li>{hint}</li>
    {/each}
  </ul>
{/if}

<style>
  .steps,
  .hints {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Die Nummer ist die Stelle in der aktuellen Reihenfolge, nicht die richtige. */
  .steps {
    counter-reset: place;
  }

  .step {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
    padding: 4px 4px 4px 14px;
    border-radius: 12px;
    background: var(--cream);
    counter-increment: place;
  }

  .step::before {
    content: counter(place) '.';
    flex: none;
    min-width: 1.4em;
    color: var(--ink-soft);
    font-weight: 700;
  }

  .text {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .moves {
    display: flex;
    flex: none;
    gap: 2px;
  }

  .move {
    display: grid;
    place-items: center;
    width: var(--tap);
    height: var(--tap);
    color: var(--petrol);
  }

  .move svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .hints {
    gap: 10px;
    padding-left: 1.2em;
    list-style: disc;
  }
</style>
