<script lang="ts">
  // Ein Raum im Querschnitt: Zeichnung, darauf die platzierten Stücke, darüber Licht und Vordergrund des Raums
  // (room.front), ganz oben die Tippflächen.
  // (x, y) eines Platzes ist die Mitte der Unterkante des Felds, in dem das Stück steht oder hängt.
  import type { Piece, Room } from '../../../shared/content-schema.ts';
  import { puff, settle } from '../../lib/motion.ts';

  interface Props {
    room: Room;
    /** Platz-id → Stück, das dort steht. */
    placed: Map<string, Piece>;
    /** Plätze, die gerade zur Wahl stehen (ein Stück sucht seinen Platz). */
    targets: Set<string>;
    selected: string | null;
    onspot: (spotId: string) => void;
    onpiece: (pieceId: string) => void;
  }
  let { room, placed, targets, selected, onspot, onpiece }: Props = $props();

  const box = $derived.by(() => {
    const [, , width = 400, height = 300] = room.art.viewBox.split(/[\s,]+/).map(Number);
    return { width, height };
  });
  // Weiter hinten zuerst zeichnen, damit vordere Stücke hintere überdecken.
  const standing = $derived(
    room.spots
      .flatMap((spot) => {
        const piece = placed.get(spot.id);
        return piece ? [{ spot, piece }] : [];
      })
      .sort((x, y) => x.spot.y - y.spot.y),
  );

  /** Tippfläche über dem Feld des Platzes, in Prozent der Raumgröße. */
  function area(spot: Room['spots'][number]): string {
    const { width, height } = box;
    return `left:${(spot.x / width) * 100}%;top:${((spot.y - spot.size / 2) / height) * 100}%;width:${(spot.size / width) * 100}%;height:${(spot.size / height) * 100}%`;
  }

  /** "kitchen-counter-2" → "counter 2" (der Raumname steht schon davor). */
  const spotName = (spotId: string) => spotId.slice(room.id.length + 1).replaceAll('-', ' ');
</script>

<div class="room" style="aspect-ratio:{box.width}/{box.height}" data-room={room.id}>
  <svg viewBox={room.art.viewBox} role="img" aria-label={room.name}>
    {@html room.art.body}
    {#each standing as { spot, piece } (spot.id)}
      <!-- Nur ein Stück, das neu dazukommt (auch umgestellt), setzt sich ab; beim Öffnen des Hauses steht alles still da. -->
      <ellipse class="puff" cx={spot.x} cy={spot.y - 1} rx={spot.size * 0.42} ry={spot.size * 0.07} opacity="0" in:puff={spot} />
      <g in:settle={spot}>
        <!-- overflow: Der Lichtschein einer Lampe oder Kerze reicht über das Feld des Stücks hinaus. -->
        <svg x={spot.x - spot.size / 2} y={spot.y - spot.size} width={spot.size} height={spot.size} viewBox={piece.art.viewBox} overflow="visible" data-piece={piece.id} data-spot={spot.id}>
          {@html piece.art.body}
        </svg>
      </g>
    {/each}
    {#if room.front}{@html room.front.body}{/if}
  </svg>

  {#each room.spots as spot (spot.id)}
    {@const piece = placed.get(spot.id)}
    {#if targets.has(spot.id)}
      <button type="button" class="plain spot target" style={area(spot)} aria-label="Place it here: {room.name}, {spotName(spot.id)}" data-spot={spot.id} onclick={() => onspot(spot.id)}>
        <span class="glow"></span>
      </button>
    {:else if piece && targets.size === 0}
      <button
        type="button"
        class="plain spot piece"
        class:selected={selected === piece.id}
        style={area(spot)}
        aria-label="{piece.name} in the {room.name.toLowerCase()}"
        aria-pressed={selected === piece.id}
        data-spot={spot.id}
        onclick={() => onpiece(piece.id)}
      ></button>
    {/if}
  {/each}
</div>

<style>
  .room {
    position: relative;
    width: 100%;
  }

  .room > svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .puff {
    fill: var(--cream);
  }

  .spot {
    position: absolute;
    /* Mitte aufs Feld über die eigene Eigenschaft translate, nicht über transform: Das gehört dem Drücken
       (button:active in app.css) – sonst spränge der Platz unter dem Finger um eine halbe Breite weg. */
    translate: -50% -50%;
    /* Kleine Plätze bleiben trotzdem gut zu treffen. */
    min-width: var(--tap);
    min-height: var(--tap);
    border-radius: 14px;
  }

  .piece.selected {
    box-shadow: 0 0 0 3px var(--petrol);
    background: color-mix(in srgb, var(--cream) 25%, transparent);
  }

  .target {
    display: grid;
    place-items: center;
  }

  .glow {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--cream);
    box-shadow:
      0 0 0 3px var(--petrol),
      0 0 0 9px color-mix(in srgb, var(--petrol) 25%, transparent);
    animation: breathe 1.4s ease-in-out infinite alternate;
  }

  @keyframes breathe {
    from {
      transform: scale(0.85);
    }
    to {
      transform: scale(1.05);
    }
  }
</style>
