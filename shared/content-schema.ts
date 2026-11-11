// Schema der Inhaltsdateien unter content/. Einzige Quelle für die Inhalts-Typen:
// scripts/build-content.ts prüft damit jede Datei und baut generated/content.json,
// App und Worker lesen nur dieses geprüfte Bündel.
//
// Diese Datei läuft auch direkt in Node (ohne Bundler): keine relativen Importe ohne .ts-Endung.
import { z } from 'zod';

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'nur a-z, 0-9 und Bindestriche');
const text = z.string().trim().min(1);
/** a legt das Haus an, b tritt bei. */
const slot = z.enum(['a', 'b']);

// ---------------------------------------------------------------- Aufgaben

export const PUZZLE_KINDS = [
  'map-legend', // Karte und Legende
  'split-code', // Geteilter Code
  'describe-arrange', // Beschreiben und Anordnen
  'spot-difference', // Zwei Bilder vergleichen
  'sequence', // Reihenfolge
  'blind-maze', // Wegweiser
] as const;
export type PuzzleKind = (typeof PUZZLE_KINDS)[number];

// Gemeinsame Felder aller Rätsel. `lead` übernimmt Rolle 1 der Rätselart, der andere Rolle 2;
// Variante 2 tauscht die Rollen und ist schwerer.
const puzzleBase = {
  id,
  type: z.literal('puzzle'),
  variant: z.union([z.literal(1), z.literal(2)]),
  title: text,
  lead: slot,
};

// Geteilter Code: `lead` gibt den Code ein und sieht seine Hinweise, der Partner sieht die anderen.
const splitCodePuzzle = z.strictObject({
  ...puzzleBase,
  kind: z.literal('split-code'),
  data: z
    .strictObject({
      symbols: z.array(text).min(4),
      hints: z.strictObject({ lead: z.array(text).min(1), partner: z.array(text).min(1) }),
      solution: z.array(text).min(3),
    })
    .refine((d) => d.solution.every((s) => d.symbols.includes(s)), 'solution enthält ein Symbol, das nicht in symbols steht'),
});

// Phase 4 ergänzt hier die Datenschemata der übrigen fünf Rätselarten.
const puzzleTask = z.discriminatedUnion('kind', [splitCodePuzzle]);

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

// ---------------------------------------------------------------- Haus und Katalog

/** Inline-SVG aus einer .svg-Datei: viewBox und Inhalt des Wurzelelements. */
export const svgArtSchema = z.strictObject({ viewBox: text, body: text });
export type SvgArt = z.infer<typeof svgArtSchema>;

const spot = z.strictObject({
  id,
  /** Frei benannte Platzart (z. B. floor, wall, surface, ground); ein Stück passt, wenn sie in dessen `fits` steht. */
  kind: id,
  /** Position im Koordinatensystem der Raum-SVG. */
  x: z.number(),
  y: z.number(),
});

export const roomFileSchema = z.strictObject({ id, name: text, spots: z.array(spot).min(1) });
export const roomSchema = roomFileSchema.extend({ art: svgArtSchema });
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
export type RulesChapter = Omit<Chapter, 'rooms' | 'pieces' | 'story'> & {
  rooms: Omit<Room, 'art'>[];
  pieces: Omit<Piece, 'art'>[];
};
export interface RulesContent {
  chapters: RulesChapter[];
}

export function toRulesContent(content: Content): RulesContent {
  return {
    chapters: content.chapters.map(({ story: _story, rooms, pieces, ...chapter }) => ({
      ...chapter,
      rooms: rooms.map(({ art: _art, ...room }) => room),
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

/**
 * Bezüge zwischen den Inhaltsdateien. Liefert eine Liste von Problemen (leer = in Ordnung).
 * Ob ein Kapitel vollständig ist (Anzahl Aufgaben, Szene je Meilenstein …), prüft Phase 5 getrennt.
 */
export function checkContent(content: Content): string[] {
  const problems: string[] = [];
  const terms = new Set(content.viTerms.map((t) => t.term));
  const needTerm = (term: string, where: string) => {
    if (!terms.has(term)) problems.push(`${where}: "${term}" fehlt in vi-terms.json`);
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
    }
  }
  return problems;
}
