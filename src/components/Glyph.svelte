<script lang="ts">
  // Ein Symbol aus dem Zeichenvorrat der Rätsel (shared/puzzles/tiles.ts), flächig gezeichnet.
  // Die Farbe gehört fest zum Symbol und ist nur Schmuck: Erkannt wird es an seiner Form.
  import type { Glyph } from '../../shared/puzzles/tiles.ts';

  /** `label`: für Vorlesehilfen, wenn das Symbol für sich steht; sonst gilt es als Schmuck. */
  let { glyph, label = null }: { glyph: Glyph; label?: string | null } = $props();

  type Tone = 'warm' | 'green' | 'deep';
  interface Shape {
    d: string;
    /** Als Linie gezeichnet statt als Fläche. */
    line?: boolean;
    /** Flächen mit Loch. */
    hole?: boolean;
  }

  const ART: Record<Glyph, { tone: Tone; shapes: Shape[] }> = {
    sun: {
      tone: 'warm',
      shapes: [
        { d: 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z' },
        { d: 'M11 1.5h2V5h-2zM11 19h2v3.5h-2zM1.5 11H5v2H1.5zM19 11h3.5v2H19z' },
        { d: 'M4.2 5.6l1.4-1.4 2.5 2.5-1.4 1.4zM18.4 4.2l1.4 1.4-2.5 2.5-1.4-1.4zM6.7 15.9l1.4 1.4-2.5 2.5-1.4-1.4zM17.3 15.9l2.5 2.5-1.4 1.4-2.5-2.5z' },
      ],
    },
    moon: { tone: 'deep', shapes: [{ d: 'M14 2.6A9.5 9.5 0 1 0 21.4 13 7.5 7.5 0 0 1 14 2.6z' }] },
    star: { tone: 'warm', shapes: [{ d: 'M12 2.5l2.47 6.6 7.04.31-5.52 4.39 1.89 6.79L12 16.7l-5.88 3.89 1.89-6.79-5.52-4.39 7.04-.31z' }] },
    leaf: { tone: 'green', shapes: [{ d: 'M20.5 3.5C10 3.5 4 8.5 4 15.5c0 1.1.2 2.2.6 3.1L3 20.2l1.3 1.3 1.6-1.6c.9.4 2 .6 3.1.6 7 0 11.5-6 11.5-17z' }] },
    wave: {
      tone: 'deep',
      shapes: [
        { d: 'M2.5 9c2.4-3 4.6-3 7 0s4.6 3 7 0c1.6-2 3.2-2.6 5-2', line: true },
        { d: 'M2.5 16c2.4-3 4.6-3 7 0s4.6 3 7 0c1.6-2 3.2-2.6 5-2', line: true },
      ],
    },
    heart: { tone: 'warm', shapes: [{ d: 'M12 20.5C4.5 15.2 2.5 11.5 4.3 8.3 6 5.4 9.9 5.5 12 8.4c2.1-2.9 6-3 7.7-.1 1.8 3.2-.2 6.900-7.700 12.200z' }] },
    drop: { tone: 'deep', shapes: [{ d: 'M12 2.5c4 5 6.5 8.5 6.5 12a6.5 6.5 0 0 1-13 0c0-3.500 2.500-7 6.500-12z' }] },
    cloud: { tone: 'deep', shapes: [{ d: 'M7 19a4.5 4.5 0 0 1-.6-8.960A6 6 0 0 1 18 9.500a4.750 4.750 0 0 1-.5 9.500z' }] },
    flower: {
      tone: 'warm',
      shapes: [
        { d: 'M12 13c-3.300 0-5.500-2.500-5.500-6V3.500l3 2.300L12 2.500l2.500 3.300 3-2.300V7c0 3.500-2.200 6-5.500 6z' },
        { d: 'M11 13h2v8.500h-2zM13 19c0-3 2-4.500 5-4.500 0 3-2 4.500-5 4.500z' },
      ],
    },
    fish: { tone: 'deep', shapes: [{ d: 'M21.5 12c-2-3.700-5.200-5.500-8.500-5.500-2.800 0-5.200 1.200-7 3.200L2.500 6.500v11L6 14.300c1.800 2 4.200 3.200 7 3.200 3.300 0 6.500-1.800 8.500-5.500z' }] },
    key: {
      tone: 'warm',
      shapes: [{ d: 'M7.500 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4z', hole: true }, { d: 'M12 10.750h10v2.500h-2v3h-2.500v-3H12z' }],
    },
    bell: {
      tone: 'warm',
      shapes: [{ d: 'M12 2.500A1.500 1.500 0 0 1 13.500 4v.6c3 .7 5 3.300 5 6.400v4l2 3h-17l2-3v-4c0-3.100 2-5.700 5-6.400V4A1.500 1.500 0 0 1 12 2.500zM9.500 19.500h5a2.500 2.500 0 0 1-5 0z' }],
    },
    house: { tone: 'deep', shapes: [{ d: 'M12 3 2.500 11.200h2.700V20h5.300v-5.200h3V20h5.300v-8.800h2.700z' }] },
    tree: {
      tone: 'green',
      shapes: [{ d: 'M12 2.500A6.500 6.500 0 0 1 18.500 9c0 3.100-2.200 5.700-5.200 6.400v6.100h-2.600v-6.100C7.700 14.700 5.500 12.100 5.500 9A6.500 6.500 0 0 1 12 2.500z' }],
    },
    cup: {
      tone: 'warm',
      shapes: [{ d: 'M4 6h13v2h1.500a3 3 0 0 1 0 6h-1.700A6.500 6.500 0 0 1 4 12.500zm13 4v2h1.500a1 1 0 0 0 0-2z', hole: true }, { d: 'M3 19.500h15v2H3z' }],
    },
    boat: { tone: 'deep', shapes: [{ d: 'M12.800 2.500v11h7zM11.200 5v8.500H5zM2.500 15.500h19l-2.500 5H5z' }] },
  };

  const art = $derived(ART[glyph]);
</script>

<svg viewBox="0 0 24 24" class={art.tone} data-glyph={glyph} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}>
  {#each art.shapes as shape (shape.d)}
    {#if shape.line}
      <path d={shape.d} fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
    {:else}
      <path d={shape.d} fill="currentColor" fill-rule={shape.hole ? 'evenodd' : 'nonzero'} />
    {/if}
  {/each}
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .warm {
    color: var(--terracotta);
  }

  .green {
    color: var(--sage-deep);
  }

  .deep {
    color: var(--petrol);
  }
</style>
