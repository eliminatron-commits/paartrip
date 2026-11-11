-- Ein Haus je Zeile. `state` ist der HouseState als JSON (Quelle der Wahrheit),
-- `rev` wechselt bei jeder Änderung und schützt vor gleichzeitigem Überschreiben.
CREATE TABLE houses (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  rev TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Je Haus genau ein Gerät für a und eines für b. Gespeichert wird nur der Hash des Tokens.
CREATE TABLE devices (
  token_hash TEXT PRIMARY KEY,
  house_id TEXT NOT NULL REFERENCES houses (id),
  slot TEXT NOT NULL CHECK (slot IN ('a', 'b')),
  created_at TEXT NOT NULL,
  UNIQUE (house_id, slot)
);

-- Jede schon gesehene Aktion, damit eine doppelt gesendete den Stand nicht zweimal ändert.
CREATE TABLE applied_actions (
  house_id TEXT NOT NULL REFERENCES houses (id),
  action_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  outcome TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  PRIMARY KEY (house_id, action_id)
) WITHOUT ROWID;

-- Push-Anmeldung je Gerät.
CREATE TABLE push_subscriptions (
  token_hash TEXT PRIMARY KEY REFERENCES devices (token_hash),
  house_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);
