// Was die Oberfläche aus der Sicht über die Tagesaufgabe ableitet: die laufende Aufgabe samt Inhalt, was davon
// auf diesen Spieler wartet und welche beantworteten Fragen aufgedeckt zu zeigen sind. Reine Funktionen ohne
// Svelte. Wartende eigene Aktionen (`queued`) dienen nur dazu, schon Abgeschicktes nicht noch einmal anzubieten.
import type { Action } from '../../shared/actions.ts';
import type { Chapter, Task } from '../../shared/content-schema.ts';
import { type ActiveTaskView, type HouseView, otherSlot, type Slot } from '../../shared/model.ts';
import { receiversOf } from '../../shared/rules.ts';
import { answerText } from './house.ts';

export interface Today {
  task: ActiveTaskView;
  spec: Task;
  /** Von beiden erledigt; sie steht noch da, bis die nächste erscheint. */
  done: boolean;
}

/** Die Tagesaufgabe mit ihrem Inhalt. null: Es gibt (noch) keine, oder diese Version der App kennt sie nicht. */
export function today(view: HouseView, chapter: Chapter): Today | null {
  const task = view.task;
  const spec = task ? chapter.tasks.find((t) => t.id === task.taskId) : undefined;
  return task && spec ? { task, spec, done: task.completedAt !== null } : null;
}

type TaskAction = Extract<Action, { taskId: string }>;

/** Liegt eine eigene Aktion dieser Art zu dieser Aufgabe noch in der Warteschlange? */
export function taskSent(queued: Action[], type: TaskAction['type'], taskId: string): boolean {
  return queued.some((a) => a.type === type && a.taskId === taskId);
}

/** Bestätigt dieser Spieler bei einer Aufgabe im echten Leben den Erhalt? */
export function confirms(spec: Extract<Task, { type: 'reallife' }>, you: Slot): boolean {
  return receiversOf(spec).includes(you);
}

/** Kann dieser Spieler an der laufenden Aufgabe in der App gerade etwas tun? */
export function myStepOpen(now: Today | null, you: Slot, queued: Action[]): boolean {
  if (!now || now.done) return false;
  const { task, spec } = now;
  const progress = task.progress;
  switch (progress.type) {
    // Ein Rätsel lösen beide im Gespräch: Solange es offen ist, wartet es auf beide.
    case 'puzzle':
      return !taskSent(queued, 'puzzle.solve', task.taskId);
    case 'knowme':
      return progress.mine === null && !taskSent(queued, 'knowme.submit', task.taskId);
    case 'reallife':
      return spec.type === 'reallife' && confirms(spec, you) && !progress.confirmedBy.includes(you) && !taskSent(queued, 'reallife.confirm', task.taskId);
  }
}

// ---------------------------------------------------------------- Aufgedeckte Fragen

/** Eine von beiden beantwortete Kennst-du-mich-Frage aus Sicht dieses Spielers. */
export interface Reveal {
  taskId: string;
  /** Nummer der erledigten Aufgabe (ab 1). */
  n: number;
  question: string;
  /** Meine Antwort und was der andere dafür getippt hat. */
  mine: { answer: string; theirGuess: string };
  /** Die Antwort des anderen und was ich dafür getippt habe. */
  theirs: { answer: string; myGuess: string };
  /** Mein Tipp war ein Treffer. */
  myHeart: boolean;
  /** Der Tipp des anderen war ein Treffer. */
  theirHeart: boolean;
  /**
   * Nur bei frei getippten Antworten gibt es etwas zu entscheiden: `open` – ich muss noch sagen, ob der Tipp des
   * anderen zählt; `sent` – meine Entscheidung ist unterwegs; `done` – entschieden. `none` – Auswahlfrage.
   */
  myVerdict: 'none' | 'open' | 'sent' | 'done';
  /** Bei frei getippten Antworten: Der andere hat über meinen Tipp schon entschieden. */
  theirVerdict: boolean;
}

/**
 * Was "Today" aufgedeckt zeigt: die zuletzt erledigte Aufgabe, wenn sie eine Frage war – sie bleibt stehen,
 * bis die nächste Aufgabe erledigt ist, damit beide das Ergebnis sehen, auch wer erst am nächsten Tag
 * wiederkommt – und jede ältere Frage, bei der meine Entscheidung noch aussteht.
 */
export function reveals(view: HouseView, chapter: Chapter, queued: Action[]): Reveal[] {
  const you = view.you;
  const other = otherSlot(you);
  const result: Reveal[] = [];
  view.done.forEach((done, index) => {
    const progress = done.progress;
    if (progress.type !== 'knowme') return;
    const spec = chapter.tasks.find((t) => t.id === done.taskId);
    const mine = progress.submissions[you];
    const theirs = progress.submissions[other];
    if (!spec || spec.type !== 'knowme' || !mine || !theirs) return;

    const free = spec.answer.kind === 'text';
    const sent = queued.some((a) => a.type === 'knowme.judge' && a.taskId === done.taskId);
    // Eine Sicht, die das Gerät noch von einer früheren Version gespeichert hat, kennt `judged` nicht.
    const judged: Slot[] = progress.judged ?? [];
    const myVerdict = !free ? 'none' : judged.includes(you) ? 'done' : sent ? 'sent' : 'open';
    const latest = index === view.done.length - 1;
    if (!latest && myVerdict !== 'open' && myVerdict !== 'sent') return;

    result.push({
      taskId: done.taskId,
      n: index + 1,
      question: spec.question,
      mine: { answer: answerText(spec, mine.own), theirGuess: answerText(spec, theirs.guess) },
      theirs: { answer: answerText(spec, theirs.own), myGuess: answerText(spec, mine.guess) },
      myHeart: progress.hearts.includes(you),
      theirHeart: progress.hearts.includes(other),
      myVerdict,
      theirVerdict: free && judged.includes(other),
    });
  });
  // Das Neueste zuerst.
  return result.reverse();
}

/** Wartet auf "Today" etwas auf diesen Spieler? */
export function todayWaits(view: HouseView, chapter: Chapter, queued: Action[]): boolean {
  return myStepOpen(today(view, chapter), view.you, queued) || reveals(view, chapter, queued).some((r) => r.myVerdict === 'open');
}
