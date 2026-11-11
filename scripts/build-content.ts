// Baut generated/content.json (App) und generated/content-rules.json (Worker) aus den Datendateien
// unter content/ und prüft sie dabei gegen das Schema.
// Fehlerhafte Inhalte brechen den Lauf ab – so kommt nichts Ungeprüftes in App oder Worker.
// Neue Kapitel (content/chapter-N/) und neue Dateien werden ohne Codeänderung aufgenommen.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { z } from 'zod';
import {
  type Chapter,
  chapterFileSchema,
  checkContent,
  type Content,
  couponsFileSchema,
  parseSvg,
  pieceFileSchema,
  roomFileSchema,
  storySceneSchema,
  type SvgArt,
  taskSchema,
  toRulesContent,
  viTermsFileSchema,
} from '../shared/content-schema.ts';

const ROOT = 'content';
const OUT_DIR = 'generated';
const problems: string[] = [];

async function readJson<T>(schema: z.ZodType<T>, path: string): Promise<T | null> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    problems.push(`${path}: ${(error as Error).message}`);
    return null;
  }
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    problems.push(`${path}: ${issue.path.join('.') || '(Wurzel)'} – ${issue.message}`);
  }
  return null;
}

/** Alle *.json eines Ordners. Die id muss dem Dateinamen entsprechen, damit Einträge auffindbar bleiben. */
async function readItems<T extends { id: string }>(schema: z.ZodType<T>, dir: string): Promise<T[]> {
  const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith('.json')).sort();
  const items: T[] = [];
  for (const name of names) {
    const path = join(dir, name);
    const item = await readJson(schema, path);
    if (!item) continue;
    if (item.id !== basename(name, '.json')) problems.push(`${path}: id "${item.id}" passt nicht zum Dateinamen`);
    items.push(item);
  }
  return items;
}

/** Hängt jedem Eintrag die gleichnamige .svg-Datei als Inline-SVG an. */
async function withArt<T extends { id: string }>(items: T[], dir: string): Promise<(T & { art: SvgArt })[]> {
  const result: (T & { art: SvgArt })[] = [];
  for (const item of items) {
    const path = join(dir, `${item.id}.svg`);
    const source = await readFile(path, 'utf8').catch(() => null);
    const art = source === null ? 'Datei fehlt' : parseSvg(source);
    if (typeof art === 'string') problems.push(`${path}: ${art}`);
    else result.push({ ...item, art });
  }
  return result;
}

/** Löst eine id-Liste aus chapter.json gegen die vorhandenen Dateien auf, in Listenreihenfolge. */
function pick<T extends { id: string }>(ids: string[], items: T[], label: string, dir: string): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const picked: T[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (item) picked.push(item);
    else problems.push(`${dir}: ${label} "${id}" steht in chapter.json, aber die Datei fehlt oder ist fehlerhaft`);
  }
  for (const item of items) {
    if (!ids.includes(item.id)) problems.push(`${dir}: ${label} "${item.id}" liegt als Datei vor, steht aber nicht in chapter.json`);
  }
  return picked;
}

async function readChapter(dir: string): Promise<Chapter | null> {
  const file = await readJson(chapterFileSchema, join(dir, 'chapter.json'));
  const tasks = await readItems(taskSchema, join(dir, 'tasks'));
  const story = await readItems(storySceneSchema, join(dir, 'story'));
  const rooms = await withArt(await readItems(roomFileSchema, join(dir, 'rooms')), join(dir, 'rooms'));
  const pieces = await withArt(await readItems(pieceFileSchema, join(dir, 'pieces')), join(dir, 'pieces'));
  const coupons = (await readJson(couponsFileSchema, join(dir, 'coupons.json'))) ?? [];
  if (!file) return null;
  if (basename(dir) !== `chapter-${file.number}`) problems.push(`${dir}: number ${file.number} passt nicht zum Ordnernamen`);
  return {
    ...file,
    rooms: pick(file.rooms, rooms, 'Raum', dir),
    tasks: pick(file.taskOrder, tasks, 'Aufgabe', dir),
    story,
    pieces,
    coupons,
  };
}

const chapterDirs = (await readdir(ROOT, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^chapter-\d+$/.test(entry.name))
  .map((entry) => entry.name)
  .sort((x, y) => Number(x.slice(8)) - Number(y.slice(8)));

const chapters: Chapter[] = [];
for (const name of chapterDirs) {
  const chapter = await readChapter(join(ROOT, name));
  if (chapter) chapters.push(chapter);
}
const viTerms = (await readJson(viTermsFileSchema, join(ROOT, 'vi-terms.json'))) ?? [];
const content: Content = { chapters, viTerms };

if (chapters.length === 0) problems.push(`${ROOT}: kein Kapitel gefunden`);
// Bezüge zwischen den Dateien erst prüfen, wenn jede Datei für sich stimmt.
if (problems.length === 0) problems.push(...checkContent(content));

if (problems.length > 0) {
  console.error(`Inhalte fehlerhaft (${problems.length}):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, 'content.json'), JSON.stringify(content));
// Der Worker braucht nur, was die Spielregeln brauchen – ohne Zeichnungen und Story-Texte.
await writeFile(join(OUT_DIR, 'content-rules.json'), JSON.stringify(toRulesContent(content)));
const count = (select: (chapter: Chapter) => unknown[]) => chapters.reduce((sum, c) => sum + select(c).length, 0);
console.log(
  `Inhalte geprüft: ${chapters.length} Kapitel, ${count((c) => c.tasks)} Aufgaben, ${count((c) => c.pieces)} Stücke, ` +
    `${count((c) => c.story)} Szenen, ${viTerms.length} vietnamesische Begriffe.`,
);
