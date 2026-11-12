<script lang="ts">
  // Geteilter Code. Rolle 1 (lead) sieht das Schloss und je Stelle eine Regel, Rolle 2 die Reihe der Symbole,
  // auf die die Regeln zeigen. Rolle 1 gibt den Code ein; geprüft wird hier auf dem Gerät.
  import type { PuzzleRole } from '../../../../shared/puzzles/kinds.ts';
  import { type CodeRule, isSolved, palette, type SplitCodeData } from '../../../../shared/puzzles/split-code.ts';
  import { type Glyph as GlyphName, GLYPHS } from '../../../../shared/puzzles/tiles.ts';
  import Glyph from '../../../components/Glyph.svelte';

  let {
    data,
    role,
    saved,
    onchange,
    onsolved,
  }: {
    data: SplitCodeData;
    role: PuzzleRole;
    /** Zuletzt gesicherter Zwischenstand dieses Rätsels auf diesem Gerät, sonst null. */
    saved: unknown;
    /** Zwischenstand sichern. */
    onchange: (value: unknown) => void;
    /** Die Eingabe stimmt. */
    onsolved: () => void;
  } = $props();

  const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
  const ordinal = (n: number) => ORDINALS[n - 1] ?? `${n}th`;

  /** Eine Regel als Satz; Symbole stehen als Bild mit Namen im Text. */
  function ruleParts(rule: CodeRule): (string | GlyphName)[] {
    switch (rule.pick) {
      case 'place':
        return [`The ${ordinal(rule.n)} symbol of the row.`];
      case 'from-end':
        return [rule.n === 1 ? 'The last symbol of the row.' : `The ${ordinal(rule.n)} symbol from the end of the row.`];
      case 'left-of':
        return ['The symbol just left of the', rule.of, '.'];
      case 'right-of':
        return ['The symbol just right of the', rule.of, '.'];
      case 'between':
        return ['The symbol between the', rule.a, 'and the', rule.b, '.'];
    }
  }
  const isGlyph = (part: string): part is GlyphName => (GLYPHS as readonly string[]).includes(part);

  const choices = $derived(palette(data));
  const empty = (): (GlyphName | null)[] => data.code.map(() => null);
  const restored = (): (GlyphName | null)[] => {
    const fits = Array.isArray(saved) && saved.length === data.code.length && saved.every((s) => s === null || choices.includes(s as GlyphName));
    return fits ? (saved as (GlyphName | null)[]) : empty();
  };

  let entered = $state(restored());
  /** Die Stelle, die das nächste angetippte Symbol bekommt. */
  let active = $state(0);
  let feedback = $state('');
  const complete = $derived(entered.every((glyph) => glyph !== null));

  function put(glyph: GlyphName): void {
    entered[active] = glyph;
    const next = entered.findIndex((g) => g === null);
    active = next === -1 ? active : next;
    feedback = '';
    onchange([...entered]);
  }

  function clear(): void {
    entered = empty();
    active = 0;
    feedback = '';
    onchange([...entered]);
  }

  function check(): void {
    if (isSolved(data, entered.flatMap((glyph) => glyph ?? []))) onsolved();
    else feedback = 'The lock stays shut. Go through the rules together and try again.';
  }
</script>

{#if role === 'lead'}
  <ol class="rules" data-testid="code-rules">
    {#each data.code as rule, index (index)}
      <li>
        {#each ruleParts(rule) as part, at (at)}
          {#if isGlyph(part)}<span class="inline"><Glyph glyph={part} /></span> <strong>{part}</strong>{:else}{part}{/if}{' '}
        {/each}
      </li>
    {/each}
  </ol>

  <div class="lock" role="group" aria-label="The code" data-testid="puzzle-input">
    {#each entered as glyph, index (index)}
      <button
        type="button"
        class="plain slot"
        class:active={active === index}
        aria-label="Place {index + 1}: {glyph ?? 'empty'}"
        aria-pressed={active === index}
        data-testid="code-slot"
        onclick={() => (active = index)}
      >
        {#if glyph}<Glyph {glyph} />{:else}<span class="number">{index + 1}</span>{/if}
      </button>
    {/each}
  </div>

  <div class="choices" role="group" aria-label="Symbols">
    {#each choices as glyph (glyph)}
      <button type="button" class="plain tile" aria-label={glyph} data-choice={glyph} onclick={() => put(glyph)}>
        <Glyph {glyph} />
      </button>
    {/each}
  </div>

  <p class="problem" role="status" data-testid="puzzle-feedback">{feedback}</p>
  <div class="row">
    <button type="button" data-testid="puzzle-check" disabled={!complete} onclick={check}>Try the lock</button>
    <button type="button" class="quiet" onclick={clear}>Clear</button>
  </div>
{:else}
  <p class="note">Your row, from left to right:</p>
  <ol class="shown" data-testid="code-row">
    {#each data.row as glyph (glyph)}
      <li class="tile" data-glyph-name={glyph}><Glyph {glyph} label={glyph} /></li>
    {/each}
  </ol>
{/if}

<style>
  .rules {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding-left: 1.4em;
  }

  .inline {
    display: inline-block;
    width: 1.3em;
    height: 1.3em;
    vertical-align: -0.28em;
  }

  .lock,
  .choices,
  .shown {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .slot,
  .tile {
    display: grid;
    place-items: center;
    width: 54px;
    height: 54px;
    padding: 9px;
    border-radius: 12px;
    background: var(--cream);
  }

  .slot {
    box-shadow: inset 0 0 0 2px var(--ink-soft);
  }

  .slot.active {
    box-shadow: inset 0 0 0 3px var(--petrol);
  }

  .number {
    color: var(--ink-soft);
    font-weight: 700;
  }
</style>
