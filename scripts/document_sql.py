#!/usr/bin/env python3
"""Tekee asiakirjasta (esim. sopimus-PDF) D1:n SQL-tiedoston.

D1 rajaa yksittäisen SQL-lauseen 100 kt:hen, joten tiedosto lisätään paloina:
ensin rivi tyhjällä datalla, sitten palat perään.

    python3 scripts/document_sql.py "Yhteisomistussopimus" sopimus.pdf > /tmp/doc.sql
    cd worker && npx wrangler d1 execute paapelin-kirjanpito --remote --file=/tmp/doc.sql
"""
import mimetypes
import os
import sys

CHUNK = 40_000  # tavua per lause, heksana 80 kt


def q(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    title, path = sys.argv[1], sys.argv[2]
    data = open(path, "rb").read()
    name = os.path.basename(path)
    mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
    print(f"INSERT INTO documents (title, filename, mime, size, data, created_by) "
          f"VALUES ({q(title)}, {q(name)}, {q(mime)}, {len(data)}, X'', 'import');")
    for i in range(0, len(data), CHUNK):
        print(f"UPDATE documents SET data = CAST(data || X'{data[i:i + CHUNK].hex()}' AS BLOB) "
              f"WHERE id = (SELECT MAX(id) FROM documents);")


if __name__ == "__main__":
    main()
