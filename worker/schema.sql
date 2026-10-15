CREATE TABLE IF NOT EXISTS entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT    NOT NULL,                -- YYYY-MM-DD
  description TEXT    NOT NULL,
  payer       TEXT    NOT NULL,                -- Santtu | Vili | Urpo | Tili | Vuokratulot
  kind        TEXT    NOT NULL CHECK (kind IN ('shared', 'deposit', 'account', 'income')),
  amount      REAL    NOT NULL,                -- account-rivit etumerkillä (kulu < 0)
  category    TEXT    NOT NULL DEFAULT 'Muut',
  note        TEXT,
  created_by  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_entries_date ON entries (date);
