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

-- Tositteet: kuitti/lasku (data) tai selite miksi tositetta ei ole (reason).
-- D1:n rivikoko on rajattu, joten kuvat pakataan selaimessa ennen lähetystä.
CREATE TABLE IF NOT EXISTS receipts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id    INTEGER NOT NULL,
  filename    TEXT,
  mime        TEXT,
  size        INTEGER,
  data        BLOB,
  reason      TEXT,
  created_by  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_receipts_entry ON receipts (entry_id);

-- Yhteiset asiakirjat (esim. yhteisomistussopimus). Repo on julkinen, joten
-- asiakirjat ovat tietokannassa salasanan takana eivätkä GitHub Pagesissa.
CREATE TABLE IF NOT EXISTS documents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  filename    TEXT    NOT NULL,
  mime        TEXT    NOT NULL,
  size        INTEGER NOT NULL,
  data        BLOB    NOT NULL,
  created_by  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Sopimuksen asetukset (kuluvastaavat, euromääräiset rajat) yhtenä JSON-arvona.
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_by  TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
