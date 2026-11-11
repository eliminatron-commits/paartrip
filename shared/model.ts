// Datenmodell. Der Server hält je Haus einen HouseState (Quelle der Wahrheit) und gibt an jedes Gerät
// nur die für diesen Spieler gefilterte HouseView heraus. Das Gerät speichert die letzte HouseView
// als lokale Kopie und verändert sie nie selbst – Änderungen laufen immer als Aktion über den Server.

/** Kalendertag für "höchstens eine neue Aufgabe pro Tag". */
export const DAY_TIMEZONE = 'Europe/Berlin';

/** a legt das Haus an, b tritt bei. Danach ist das Haus geschlossen. */
export type Slot = 'a' | 'b';

export function otherSlot(slot: Slot): Slot {
  return slot === 'a' ? 'b' : 'a';
}

/** Zeitpunkt als ISO-8601 in UTC, vom Server gesetzt. */
export type IsoTime = string;
/** Kalendertag "2026-11-11" in DAY_TIMEZONE. */
export type DayKey = string;

export interface Player {
  name: string;
  joinedAt: IsoTime;
}

// ---------------------------------------------------------------- Aufgaben

export type KnowMeAnswer = { kind: 'choice'; option: number } | { kind: 'text'; text: string };

/** Eigene Antwort und Tipp auf die Antwort des anderen. */
export interface KnowMeSubmission {
  own: KnowMeAnswer;
  guess: KnowMeAnswer;
}

/** Fortschritt je Aufgabentyp; daraus ergibt sich, wann die Aufgabe für beide erledigt ist. */
export type TaskProgress =
  | { type: 'puzzle'; solvedBy: Slot | null }
  | {
      type: 'knowme';
      submissions: Partial<Record<Slot, KnowMeSubmission>>;
      /** Wer richtig getippt hat (Herz-Abzeichen); steht erst nach dem Aufdecken fest. */
      hearts: Slot[];
    }
  | {
      type: 'reallife';
      /** Empfänger, die den Erhalt bestätigt haben. */
      confirmedBy: Slot[];
    };

/** Die eine aktuelle Aufgabe. Bleibt nach dem Erledigen stehen, bis die nächste erscheint. */
export interface ActiveTask {
  taskId: string;
  /** Tag, an dem die Aufgabe erschienen ist. */
  availableOn: DayKey;
  progress: TaskProgress;
  completedAt: IsoTime | null;
}

/** Erledigte Aufgabe. Kennst-du-mich-Antworten bleiben hier als Erinnerungsstücke lesbar. */
export interface DoneTask {
  taskId: string;
  completedAt: IsoTime;
  progress: TaskProgress;
}

// ---------------------------------------------------------------- Bauen

/** Bauzug n gehört zur n-ten erledigten Aufgabe. `chooser` wählt, der andere platziert. */
export interface BuildTurn {
  n: number;
  chooser: Slot;
  /** Angebotene Stück-ids. */
  offer: string[];
  chosen: string | null;
  /** Platz-id; gesetzt = Zug abgeschlossen. */
  placedAt: string | null;
}

export interface Placement {
  pieceId: string;
  spotId: string;
}

// ---------------------------------------------------------------- Meilensteine und Gutscheine

export interface ReachedMilestone {
  /** Anzahl erledigter Aufgaben, bei der der Meilenstein erreicht wurde. */
  at: number;
  reachedAt: IsoTime;
  /** Dekostück im Geschenk, wenn kein Gutschein hinterlegt war. */
  decoPiece: string | null;
  /** Wer Story-Szene und Geschenk schon gesehen hat. */
  seenBy: Slot[];
}

/** verhüllt → freigeschaltet (Meilenstein erreicht) → eingelöst (Schenkender hat bestätigt). */
export type CouponState = 'veiled' | 'unlocked' | 'redeemed';

interface CouponBase {
  id: string;
  from: Slot;
  to: Slot;
  /** Meilenstein, an dem der Gutschein enthüllt wird. */
  milestone: number;
  state: CouponState;
  /** Empfänger hat "Redeem" getippt und wartet auf die Bestätigung. */
  redeemRequestedAt: IsoTime | null;
  redeemedAt: IsoTime | null;
}

/** Feste Gutscheine tragen die id aus content/ (Text von dort), geheime ihren Text im Stand. */
export type Coupon = CouponBase & ({ kind: 'fixed' } | { kind: 'secret'; text: string });

// ---------------------------------------------------------------- Stand auf dem Server

export interface HouseState {
  id: string;
  chapter: number;
  createdAt: IsoTime;
  players: { a: Player; b: Player | null };
  /** null, solange der zweite Spieler fehlt. */
  task: ActiveTask | null;
  /** Erledigte Aufgaben in Reihenfolge; die Länge zählt für die Meilensteine. */
  done: DoneTask[];
  buildTurns: BuildTurn[];
  placements: Placement[];
  milestones: ReachedMilestone[];
  coupons: Coupon[];
}

// ---------------------------------------------------------------- Sicht eines Spielers

/** Kennst-du-mich aus Sicht eines Spielers: die Antwort des anderen fehlt, bis beide abgegeben haben. */
export type TaskProgressView =
  | Exclude<TaskProgress, { type: 'knowme' }>
  | {
      type: 'knowme';
      mine: KnowMeSubmission | null;
      theirsSubmitted: boolean;
      theirs: KnowMeSubmission | null;
      hearts: Slot[];
    };

export interface ActiveTaskView extends Omit<ActiveTask, 'progress'> {
  progress: TaskProgressView;
}

/** Text ist null, solange der Gutschein für diesen Spieler verhüllt ist. */
export type CouponView = CouponBase & { kind: Coupon['kind']; text: string | null };

/** Einzige Form, in der Stand an ein Gerät geht. Enthält nichts, was für `you` noch verborgen ist. */
export interface HouseView {
  houseId: string;
  you: Slot;
  players: { a: Player; b: Player | null };
  /** Nur für a und nur, solange b fehlt. */
  pairingCode: string | null;
  /** Heutiger Tag aus Sicht des Servers. */
  today: DayKey;
  chapter: number;
  task: ActiveTaskView | null;
  /** Aktuelle Aufgabe erledigt: Tag, an dem die nächste frühestens erscheint. Sonst null. */
  nextTaskOn: DayKey | null;
  done: DoneTask[];
  buildTurns: BuildTurn[];
  placements: Placement[];
  milestones: ReachedMilestone[];
  coupons: CouponView[];
}
