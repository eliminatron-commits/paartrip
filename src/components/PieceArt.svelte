<script lang="ts">
  // Zeichnung eines Stücks. Die SVG kommt aus content/ und ist beim Bauen geprüft (kein Skript, nichts Externes).
  import type { SvgArt } from '../../shared/content-schema.ts';

  let { art }: { art: SvgArt } = $props();
</script>

<svg class="art" viewBox={art.viewBox} aria-hidden="true">{@html art.body}</svg>

<style>
  .art {
    display: block;
    width: 100%;
    height: 100%;
    /* Der Lichtschein einer Lampe oder Kerze reicht über das Feld hinaus und soll nicht kantig abgeschnitten sein. */
    overflow: visible;
  }
</style>
