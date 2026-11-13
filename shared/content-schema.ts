// Schema der Inhaltsdateien unter content/. Einzige Quelle für die Inhalts-Typen:
// scripts/build-content.ts prüft damit jede Datei und baut generated/content.json,
// App und Worker lesen nur dieses geprüfte Bündel.
//
// Diese Datei läuft auch direkt in Node (ohne Bundler): keine relativen Importe ohne .ts-Endung.
import { z } from 'zod';
import * as blindMaze from './puzzles/blind-maze.ts';
import * as describeArrange from './puzzles/describe-arrange.ts';
import { PUZZLE_KINDS, type PuzzleKind } from './puzzles/kinds.ts';
import * as mapLegend from './puzzles/map-legend.ts';
import * as sequence from './puzzles/sequence.ts';
import * as splitCode from './puzzles/split-code.ts';
import * as spotDifference from './puzzles/spot-difference.ts';
import { GLYPHS } from './puzzles/tiles.ts';

export { PUZZLE_KINDS, type PuzzleKind };

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'nur a-z, 0-9 und Bindestriche');
const text = z.string().trim().min(1);
/** a legt das Haus an, b tritt bei. */
const slot = z.enum(['a', 'b']);

// ---------------------------------------------------------------- Aufgaben

// Rätseldaten je Art. Die Form steht hier; ob die Daten in sich stimmen und sich nur zu zweit lösen lassen,
// prüft die Logik der Art (shared/puzzles/) – ihre Befunde brechen den Bau genauso ab wie ein Formfehler.
function checked<S extends z.ZodType>(schema: S, validate: (data: z.output<S>) => string[]) {
  return schema.superRefine((data, ctx) => {
    for (const message of validate(data)) ctx.addIssue({ code: 'custom', message });
  });
}

const glyph = z.enum(GLYPHS);
/** Raster aus Zeichen, eine Zeile je Reihe, höchstens `width` breit. */
const charGrid = (width: number) => z.array(z.string().min(4).max(width)).min(4).max(9);
const gridSide = z.int().min(2).max(5);

const puzzleData = {
  'map-legend': checked(
    z.strictObject({
      // Verstecke werden angetippt: Bei mehr als 6 Spalten wären die Felder auf einem schmalen iPhone (375 px) kleiner als 44 px.
      plan: charGrid(6),
      landmarks: z.array(z.strictObject({ key: z.string().regex(/^[a-z]$/), glyph, name: text })).min(3),
      clues: z.array(text).min(2).max(5),
      treasures: z.array(z.string().regex(/^[1-9]$/)).min(2).max(5),
    }),
    mapLegend.validate,
  ),
  'split-code': checked(
    z.strictObject({
      row: z.array(glyph).min(4).max(8),
      code: z
        .array(
          z.discriminatedUnion('pick', [
            z.strictObject({ pick: z.literal('place'), n: z.int().min(1) }),
            z.strictObject({ pick: z.literal('from-end'), n: z.int().min(1) }),
            z.strictObject({ pick: z.literal('left-of'), of: glyph }),
            z.strictObject({ pick: z.literal('right-of'), of: glyph }),
            z.strictObject({ pick: z.literal('between'), a: glyph, b: glyph }),
          ]),
        )
        .min(3)
        .max(6),
    }),
    splitCode.validate,
  ),
  'describe-arrange': checked(
    z.strictObject({
      cols: gridSide,
      rows: gridSide,
      tiles: z.array(glyph).min(3).max(12),
      target: z.array(z.union([z.int().min(0), z.null()])),
    }),
    describeArrange.validate,
  ),
  'spot-difference': checked(
    z.strictObject({
      cols: gridSide,
      rows: gridSide,
      scene: z.array(z.union([glyph, z.null()])),
      changes: z.array(z.strictObject({ cell: z.int().min(0), glyph: z.union([glyph, z.null()]) })),
    }),
    spotDifference.validate,
  ),
  sequence: checked(z.strictObject({ steps: z.array(text).min(5).max(7), hints: z.array(text).min(2).max(6) }), sequence.validate),
  // Das Labyrinth wird nur angesehen, gesteuert wird über eigene Knöpfe: Hier dürfen es 8 Spalten sein.
  'blind-maze': checked(z.strictObject({ maze: charGrid(8) }), blindMaze.validate),
} satisfies Record<PuzzleKind, z.ZodType>;

// Gemeinsame Felder aller Rätsel. `lead` übernimmt Rolle 1 der Rätselart, der andere Rolle 2
// (welche Rolle was sieht und wer die Lösung eingibt: shared/puzzles/kinds.ts).
// Variante 2 tauscht die Rollen und ist schwerer.
const puzzleOf = <K extends PuzzleKind>(kind: K) =>
  z.strictObject({
    id,
    type: z.literal('puzzle'),
    variant: z.union([z.literal(1), z.literal(2)]),
    title: text,
    lead: slot,
    kind: z.literal(kind),
    data: puzzleData[kind],
  });

const puzzleTask = z.discriminatedUnion('kind', [
  puzzleOf('map-legend'),
  puzzleOf('split-code'),
  puzzleOf('describe-arrange'),
  puzzleOf('spot-difference'),
  puzzleOf('sequence'),
  puzzleOf('blind-maze'),
]);

const knowMeTask = z.strictObject({
  id,
  type: z.literal('knowme'),
  /** Jeder beantwortet die Frage für sich und tippt die Antwort des anderen. */
  question: text,
  answer: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('choice'), options: z.array(text).min(2).max(6) }),
    z.strictObject({ kind: z.literal('text'), maxLength: z.int().min(10).max(120) }),
  ]),
});

const realLifeTask = z.strictObject({
  id,
  type: z.literal('reallife'),
  title: text,
  text,
  /** Wer die Aufgabe ausführt; der jeweils andere bestätigt den Erhalt. */
  doer: z.enum(['a', 'b', 'both']),
});

export const taskSchema = z.union([puzzleTask, knowMeTask, realLifeTask]);
export type Task = z.infer<typeof taskSchema>;
export type PuzzleTask = Extract<Task, { type: 'puzzle' }>;
export type KnowMeTask = Extract<Task, { type: 'knowme' }>;
export type RealLifeTask = Extract<Task, { type: 'reallife' }>;

// ---------------------------------------------------------------- Haus und Katalog

/** Inline-SVG aus einer .svg-Datei: viewBox und Inhalt des Wurzelelements. */
export const svgArtSchema = z.strictObject({ viewBox: text, body: text });
export type SvgArt = z.infer<typeof svgArtSchema>;

const spot = z.strictObject({
  id,
  /** Frei benannte Platzart (z. B. floor, wall, surface, ground); ein Stück passt, wenn sie in dessen `fits` steht. */
  kind: id,
  /** Position im Koordinatensystem der Raum-SVG: Mitte der Unterkante des Stücks, das hier steht oder hängt. */
  x: z.number(),
  y: z.number(),
  /** Kantenlänge des Felds, in das ein Stück gezeichnet wird (seine SVG füllt ein Quadrat dieser Größe). */
  size: z.number().positive(),
});

export const roomFileSchema = z.strictObject({
  id,
  name: text,
  /** Draußen: Der Raum steht für sich, unterhalb des Hauses (z. B. der Garten). */
  outdoor: z.boolean().optional(),
  spots: z.array(spot).min(1),
});
/**
 * `art` ist die Zeichnung hinter den Stücken (rooms/<id>.svg). `front` (rooms/<id>.front.svg) liegt über ihnen:
 * Licht, Halbdunkel in den Ecken, was vorn im Raum hängt oder steht. Beide teilen sich die viewBox.
 */
export const roomSchema = roomFileSchema.extend({ art: svgArtSchema, front: svgArtSchema.optional() });
export type Room = z.infer<typeof roomSchema>;

export const pieceFileSchema = z.strictObject({
  id,
  name: text,
  /** Vietnamesischer Zweitname mit Diakritika; muss in vi-terms.json stehen. */
  nameVi: text.optional(),
  fits: z.array(id).min(1),
  /** Gesetzt: besonderes Dekostück im Geschenk dieses Meilensteins, nicht im normalen Angebot. */
  milestone: z.int().positive().optional(),
});
export const pieceSchema = pieceFileSchema.extend({ art: svgArtSchema });
export type Piece = z.infer<typeof pieceSchema>;

// ---------------------------------------------------------------- Geschichte und Gutscheine

const wordCount = (s: string) => s.trim().split(/\s+/).length;

export const storySceneSchema = z.strictObject({
  id,
  milestone: z.int().positive(),
  title: text,
  text: text.refine((s) => wordCount(s) >= 60 && wordCount(s) <= 100, 'Story-Szene braucht 60–100 Wörter'),
});
export type StoryScene = z.infer<typeof storySceneSchema>;

/** Feste Gutscheine: Inhalt bis zum Meilenstein verhüllt. */
export const fixedCouponSchema = z
  .strictObject({ id, milestone: z.int().positive(), from: slot, to: slot, text })
  .refine((c) => c.from !== c.to, 'from und to müssen verschieden sein');
export const couponsFileSchema = z.array(fixedCouponSchema);
export type FixedCoupon = z.infer<typeof fixedCouponSchema>;

// ---------------------------------------------------------------- Kapitel

export const chapterFileSchema = z.strictObject({
  number: z.int().positive(),
  title: text,
  titleVi: text,
  /** Raum-ids in Anzeigereihenfolge von oben nach unten. */
  rooms: z.array(id).min(1),
  /** Aufgaben-ids in fester Reihenfolge. */
  taskOrder: z.array(id).min(1),
  /** Meilensteine: Anzahl erledigter Aufgaben, aufsteigend. */
  milestones: z.array(z.int().positive()).min(1),
  /** Bauzug: einer wählt aus `offerSize` Stücken, der andere platziert; die Rollen wechseln je Zug. */
  build: z.strictObject({ offerSize: z.int().min(2).max(5), firstChooser: slot }),
});

export const chapterSchema = chapterFileSchema.omit({ rooms: true }).extend({
  rooms: z.array(roomSchema),
  /** In der Reihenfolge von taskOrder. */
  tasks: z.array(taskSchema),
  story: z.array(storySceneSchema),
  pieces: z.array(pieceSchema),
  coupons: z.array(fixedCouponSchema),
  /** Was über dem Haus steht (roof.svg): das Dach und was am Himmel zu sehen ist. Durchsichtig, wo der Himmel der App durchscheint. */
  roof: svgArtSchema.optional(),
});
export type Chapter = z.infer<typeof chapterSchema>;

// ---------------------------------------------------------------- Vietnamesische Begriffe

export const viTermsFileSchema = z.array(
  z.strictObject({
    term: text,
    /** Englische Bedeutung. */
    meaning: text,
    /** Fundstellen, damit ein Begriff korrigiert werden kann, ohne die Aufgaben zu lesen. */
    where: z.array(text).min(1),
  }),
);
export type ViTerm = z.infer<typeof viTermsFileSchema>[number];

export const contentSchema = z.strictObject({ chapters: z.array(chapterSchema).min(1), viTerms: viTermsFileSchema });
export type Content = z.infer<typeof contentSchema>;

// ---------------------------------------------------------------- Inhalte für die Spielregeln

/**
 * Inhalte ohne Zeichnungen, Story-Texte und Begriffsliste: alles, was die Spielregeln brauchen.
 * Der Worker bündelt nur das (generated/content-rules.json), die App das volle Bündel.
 */
export type RulesChapter = Omit<Chapter, 'rooms' | 'pieces' | 'story' | 'roof'> & {
  rooms: Omit<Room, 'art' | 'front'>[];
  pieces: Omit<Piece, 'art'>[];
};
export interface RulesContent {
  chapters: RulesChapter[];
}

export function toRulesContent(content: Content): RulesContent {
  return {
    chapters: content.chapters.map(({ story: _story, roof: _roof, rooms, pieces, ...chapter }) => ({
      ...chapter,
      rooms: rooms.map(({ art: _art, front: _front, ...room }) => room),
      pieces: pieces.map(({ art: _art, ...piece }) => piece),
    })),
  };
}

// ---------------------------------------------------------------- Prüfungen über Dateigrenzen

/** Zerlegt eine .svg-Datei in viewBox und Inhalt. Liefert bei Verstößen eine Fehlermeldung statt SvgArt. */
export function parseSvg(source: string): SvgArt | string {
  const match = /^\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/.exec(source);
  if (!match) return 'kein einzelnes <svg>-Wurzelelement';
  const viewBox = /\bviewBox="([^"]+)"/.exec(match[1] ?? '')?.[1];
  if (!viewBox) return 'viewBox fehlt';
  const body = (match[2] ?? '').trim();
  if (!body) return 'SVG ist leer';
  // Inhalte werden inline in die Seite gesetzt: kein Skript, nichts Externes, keine Rasterbilder.
  if (/<script|<foreignObject|<image|\son\w+\s*=|javascript:|https?:/i.test(body)) {
    return 'enthält Skript, externe Verweise oder Rasterbilder';
  }
  return { viewBox, body };
}

function duplicates(values: string[]): string[] {
  return [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];
}

/** Alle Texte in einem Stück Inhalt, wie tief sie auch liegen. */
function textsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(textsIn);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(textsIn);
  return [];
}

/** Die Wörter eines Texts, klein geschrieben und in einheitlicher Zeichenform. */
const wordsOf = (s: string) => s.normalize('NFC').toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];
/** Ein Wort mit Buchstaben außerhalb von a–z: In den englischen Texten sind das die vietnamesischen Einsprengsel. */
const isForeign = (word: string) => /[^a-z]/.test(word);

/**
 * Bezüge zwischen den Inhaltsdateien. Liefert eine Liste von Problemen (leer = in Ordnung).
 * Ob ein Kapitel vollständig ist, prüft `checkComplete`.
 */
export function checkContent(content: Content): string[] {
  const problems: string[] = [];
  const terms = new Set(content.viTerms.map((t) => t.term));
  const needTerm = (term: string, where: string) => {
    if (!terms.has(term)) problems.push(`${where}: "${term}" fehlt in vi-terms.json`);
  };
  // Vietnamesisches mitten im Text (ein Gericht in einer Frage, ein Wort in einer Szene): Jedes Wort mit
  // Sonderbuchstaben muss in einem Begriff der Liste vorkommen.
  const termWords = new Set(content.viTerms.flatMap((t) => wordsOf(t.term)));
  const needWords = (value: unknown, where: string) => {
    for (const word of new Set(textsIn(value).flatMap(wordsOf).filter(isForeign))) {
      if (!termWords.has(word)) problems.push(`${where}: das Wort "${word}" steht in keinem Begriff von vi-terms.json`);
    }
  };

  for (const dup of duplicates(content.chapters.map((c) => String(c.number)))) problems.push(`Kapitelnummer ${dup} doppelt`);

  for (const chapter of content.chapters) {
    const at = `Kapitel ${chapter.number}`;
    needTerm(chapter.titleVi, `${at} titleVi`);

    for (const dup of duplicates(chapter.taskOrder)) problems.push(`${at}: Aufgabe "${dup}" doppelt in taskOrder`);
    for (const dup of duplicates(chapter.rooms.flatMap((r) => r.spots.map((s) => s.id)))) {
      problems.push(`${at}: Platz "${dup}" doppelt`);
    }
    if (chapter.milestones.some((m, i) => i > 0 && m <= (chapter.milestones[i - 1] ?? 0))) {
      problems.push(`${at}: milestones nicht aufsteigend`);
    }

    const milestones = new Set(chapter.milestones);
    const needMilestone = (m: number, where: string) => {
      if (!milestones.has(m)) problems.push(`${at}: ${where} verweist auf unbekannten Meilenstein ${m}`);
    };
    for (const scene of chapter.story) needMilestone(scene.milestone, `Szene "${scene.id}"`);
    for (const coupon of chapter.coupons) needMilestone(coupon.milestone, `Gutschein "${coupon.id}"`);

    const spotKinds = new Set(chapter.rooms.flatMap((r) => r.spots.map((s) => s.kind)));
    for (const piece of chapter.pieces) {
      if (piece.milestone !== undefined) needMilestone(piece.milestone, `Stück "${piece.id}"`);
      if (piece.nameVi) needTerm(piece.nameVi, `${at} Stück "${piece.id}" nameVi`);
      if (!piece.fits.some((kind) => spotKinds.has(kind))) problems.push(`${at}: Stück "${piece.id}" passt auf keinen Platz`);
      needWords(piece.name, `${at} Stück "${piece.id}"`);
    }

    needWords(chapter.title, `${at} title`);
    for (const task of chapter.tasks) needWords(task, `${at} Aufgabe "${task.id}"`);
    for (const scene of chapter.story) needWords([scene.title, scene.text], `${at} Szene "${scene.id}"`);
    for (const coupon of chapter.coupons) needWords(coupon.text, `${at} Gutschein "${coupon.id}"`);
    for (const room of chapter.rooms) needWords(room.name, `${at} Raum "${room.id}"`);
  }
  return problems;
}

/**
 * Vollständigkeit eines Kapitels: Alles, was an einem Meilenstein hängt, muss erreichbar sein und dort etwas
 * bereithalten. Liefert eine Liste von Problemen (leer = in Ordnung). Wie viele Aufgaben, Plätze und Stücke
 * ein Kapitel haben soll, ist seine eigene Sache und steht nicht hier.
 */
export function checkComplete(content: Content): string[] {
  const problems: string[] = [];
  for (const chapter of content.chapters) {
    const at = `Kapitel ${chapter.number}`;
    for (const milestone of chapter.milestones) {
      const where = `${at}: Meilenstein ${milestone}`;
      // Gezählt werden erledigte Aufgaben: Was hinter der letzten liegt, erreicht kein Haus je.
      if (milestone > chapter.taskOrder.length) problems.push(`${where} liegt hinter der letzten Aufgabe (${chapter.taskOrder.length} Aufgaben)`);
      const scenes = chapter.story.filter((scene) => scene.milestone === milestone).length;
      if (scenes !== 1) problems.push(`${where} braucht genau eine Story-Szene, hat ${scenes}`);
      // Im Geschenk liegt ein fester Gutschein oder – wenn auch kein geheimer hinterlegt wurde – ein Dekostück.
      const decos = chapter.pieces.filter((piece) => piece.milestone === milestone).length;
      const fixed = chapter.coupons.some((coupon) => coupon.milestone === milestone);
      if (decos > 1) problems.push(`${where} hat ${decos} Dekostücke – nur eines käme je ins Geschenk`);
      if (decos > 0 && fixed) problems.push(`${where} hat einen festen Gutschein und ein Dekostück – das Dekostück käme nie ins Geschenk`);
      if (decos === 0 && !fixed) problems.push(`${where} hat weder einen festen Gutschein noch ein Dekostück – das Geschenk wäre leer`);
    }
  }
  return problems;
}
