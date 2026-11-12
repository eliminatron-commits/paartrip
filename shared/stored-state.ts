// Bringt einen gespeicherten Stand auf die heutige Form. Der Worker ruft das bei jedem Laden auf: Was eine
// frühere Version geschrieben hat, darf keinen Abgleich scheitern lassen. Gespeichert wird die neue Form mit
// der nächsten Änderung am Haus. Reine Funktion ohne Datenbank.
import type { ActiveTask, DoneTask, HouseState, Slot, TaskProgress } from './model.ts';

/** Fortschritt, wie ihn auch ältere Versionen geschrieben haben: Bis Phase 3 fehlte bei Fragen `judged`. */
type StoredProgress = Exclude<TaskProgress, { type: 'knowme' }> | (Omit<Extract<TaskProgress, { type: 'knowme' }>, 'judged'> & { judged?: Slot[] });

export type StoredHouseState = Omit<HouseState, 'task' | 'done'> & {
  task: (Omit<ActiveTask, 'progress'> & { progress: StoredProgress }) | null;
  done: (Omit<DoneTask, 'progress'> & { progress: StoredProgress })[];
};

function currentProgress(progress: StoredProgress): TaskProgress {
  return progress.type === 'knowme' ? { ...progress, judged: progress.judged ?? [] } : progress;
}

export function upgradeState(stored: StoredHouseState): HouseState {
  return {
    ...stored,
    task: stored.task ? { ...stored.task, progress: currentProgress(stored.task.progress) } : null,
    done: stored.done.map((done) => ({ ...done, progress: currentProgress(done.progress) })),
  };
}
