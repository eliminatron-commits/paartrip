<script lang="ts">
  // Erinnerungsstücke: Jede beantwortete Kennst-du-mich-Frage hängt als gerahmte Notiz unter dem Dach
  // und bleibt dort lesbar.
  import type { Chapter } from '../../../shared/content-schema.ts';
  import type { HouseView } from '../../../shared/model.ts';
  import Sheet from '../../components/Sheet.svelte';
  import { memories, type Memory } from '../../lib/house.ts';

  let { view, chapter }: { view: HouseView; chapter: Chapter } = $props();

  const notes = $derived(memories(view, chapter));
  let open = $state<Memory | null>(null);
</script>

<section class="gallery" aria-label="Memories">
  {#if notes.length === 0}
    <p class="empty">Your answers about each other will hang here.</p>
  {:else}
    <ul>
      {#each notes as note (note.n)}
        <li>
          <button type="button" class="plain frame" aria-label="Memory: {note.question}" data-testid="memory" onclick={() => (open = note)}>
            <span class="paper">
              {#if note.hearts.length > 0}
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.500C4.500 15.200 2.500 11.500 4.300 8.300 6 5.400 9.900 5.500 12 8.400c2.100-2.900 6-3 7.700-.1 1.800 3.200-.2 6.900-7.700 12.200z" /></svg>
              {:else}
                <span class="lines"></span>
              {/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if open}
  <Sheet title="A memory" onclose={() => (open = null)}>
    <p class="eyebrow">A memory</p>
    <h3>{open.question}</h3>
    <dl>
      {#each ['a', 'b'] as const as slot (slot)}
        <div>
          <dt>{view.players[slot]?.name}</dt>
          <dd>{open.answers[slot]}</dd>
        </div>
      {/each}
    </dl>
    {#each open.hearts as slot (slot)}
      <p class="heart">{view.players[slot]?.name} guessed it right.</p>
    {/each}
  </Sheet>
{/if}

<style>
  /* Die Galerie gehört zum Haus: Wandfarbe wie die Räume, eingefasst von den Hauswänden. */
  .gallery {
    display: flex;
    align-items: center;
    min-height: 84px;
    padding: 10px 0;
    /* So breit wie die Hauswände in den Raum-Zeichnungen (10 von 400 Einheiten). */
    border-inline: 2.5cqw solid var(--petrol);
    background: var(--wall);
  }

  .empty {
    padding: 0 16px;
    color: var(--ink);
    font-size: 0.95rem;
  }

  ul {
    display: flex;
    gap: 6px;
    margin: 0;
    padding: 0 12px;
    overflow-x: auto;
    list-style: none;
  }

  .frame {
    display: grid;
    place-items: center;
    width: 56px;
    height: 60px;
  }

  /* Der Rahmen. */
  .paper {
    display: grid;
    place-items: center;
    width: 46px;
    height: 52px;
    border: 5px solid var(--wood);
    border-radius: 4px;
    background: var(--cream);
  }

  .paper svg {
    width: 22px;
    height: 22px;
    fill: var(--terracotta);
  }

  /* Ein paar Zeilen Schrift, angedeutet. */
  .lines {
    width: 22px;
    height: 14px;
    background: repeating-linear-gradient(to bottom, var(--ink-soft) 0 2px, transparent 2px 6px);
  }

  h3 {
    font-size: 1.35rem;
  }

  dl {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
  }

  dt {
    color: var(--ink-soft);
    font-size: 0.9rem;
    font-weight: 700;
  }

  dd {
    margin: 0;
    font-size: 1.1rem;
    overflow-wrap: anywhere;
  }

  .heart {
    color: var(--terracotta);
    font-weight: 700;
  }
</style>
