<script lang="ts">
  // Platzhalter – der Baustein folgt.
  import type { PuzzleRole } from '../../../../shared/puzzles/kinds.ts';
  import type { MapLegendData } from '../../../../shared/puzzles/map-legend.ts';

  let {
    data,
    role,
    saved,
    onchange,
    onsolved,
  }: {
    data: MapLegendData;
    role: PuzzleRole;
    /** Zuletzt gesicherter Zwischenstand dieses Rätsels auf diesem Gerät, sonst null. */
    saved: unknown;
    /** Zwischenstand sichern. */
    onchange: (value: unknown) => void;
    /** Die Eingabe stimmt. */
    onsolved: () => void;
  } = $props();

  void [data, role, saved, onchange, onsolved];
</script>

<p class="note">This puzzle is not ready yet.</p>
