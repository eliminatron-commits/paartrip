// Aktionen: die einzige Art, den Stand zu ändern. Das Gerät erzeugt sie, legt sie in die Warteschlange
// und reicht sie beim nächsten Abgleich nach. Der Server wendet jede id höchstens einmal an.
import type { IsoTime, KnowMeAnswer } from './model.ts';

export type ActionBody =
  // Aufgaben
  | { type: 'puzzle.solve'; taskId: string }
  | { type: 'knowme.submit'; taskId: string; own: KnowMeAnswer; guess: KnowMeAnswer }
  // Nur bei frei getippten Antworten, nach dem Aufdecken: Zählt der Tipp des anderen auf meine Antwort?
  | { type: 'knowme.judge'; taskId: string; counts: boolean }
  | { type: 'reallife.confirm'; taskId: string }
  // Bauen
  | { type: 'build.choose'; turn: number; pieceId: string }
  | { type: 'build.place'; turn: number; spotId: string }
  | { type: 'piece.move'; pieceId: string; spotId: string }
  // Meilensteine und Gutscheine
  // `milestone` = Anzahl erledigter Aufgaben, bei der er erreicht wurde (ReachedMilestone.at).
  | { type: 'milestone.seen'; milestone: number }
  // Geheimen Gutschein hinterlegen; die id der Aktion wird zur id des Gutscheins.
  | { type: 'coupon.deposit'; text: string }
  | { type: 'coupon.requestRedeem'; couponId: string }
  | { type: 'coupon.confirmRedeem'; couponId: string }
  // Aus der Bauphase vor dem Aufgabenablauf; der Server lehnt sie immer ab. Sie bleibt bekannt, damit eine
  // noch nicht aktualisierte App, die sie in der Warteschlange hat, eine Ablehnung bekommt statt eines
  // Fehlers – sonst hinge deren Abgleich fest.
  | { type: 'test.completeTask' };

export type Action = ActionBody & {
  /** Auf dem Gerät erzeugt (crypto.randomUUID). Macht die Aktion wiederholt anwendbar. */
  id: string;
  /** Gerätezeit, nur zur Information – Regeln rechnen mit der Serverzeit. */
  at: IsoTime;
};

/**
 * applied: angewendet. duplicate: diese id war schon da, Stand unverändert.
 * rejected: passt nicht (mehr) zum Stand. In allen drei Fällen verlässt die Aktion die Warteschlange –
 * eine abgelehnte Aktion wird nie wiederholt, damit kein Gerät festhängt.
 */
export type ActionOutcome = 'applied' | 'duplicate' | 'rejected';

/** stale: bezieht sich auf einen überholten Stand. invalid: verstößt gegen Regeln oder Inhalte. forbidden: nicht für diesen Spieler. */
export type RejectReason = 'stale' | 'invalid' | 'forbidden';

export interface ActionResult {
  id: string;
  outcome: ActionOutcome;
  reason?: RejectReason;
}
