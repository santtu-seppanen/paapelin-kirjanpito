#!/usr/bin/env python3
"""Lukee vanhan Excel-kirjanpidon ja tuottaa D1:lle seed-SQL:n.

Käyttö: python3 scripts/import_xlsx.py "Paapelin kirjanpito.xlsx" > worker/seed.sql

Excelin sarakkeet: pvm | Kulu | maksaja | saaja | Summa
Rivit muunnetaan tyyppeihin:
  shared  = henkilö maksoi yhteisen kulun (saaja "Yhteiset")
  deposit = henkilö siirsi rahaa yhteiselle tilille (saaja "Tili")
  account = tilin oma tapahtuma (maksaja "Tili"), summa etumerkillä
  income  = vuokratulo tilille
"""
import sys
import zipfile
import datetime as dt
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

# Avainsana -> kategoria. Ensimmäinen osuma voittaa, joten tarkemmat ensin.
CATEGORY_RULES = [
    ("Pankki", ["korko", "lähdevero", "alkusaldo"]),
    ("Sähkölaskut", ["sähkölasku"]),
    ("Sähkötyöt", ["sähkökeskus", "ryhmäkeskus", "sähkötyö", "sähkötöitä", "latausasema",
                   "loisteputk", "valaisin", "mittalaitteen", "jatkojohto"]),
    ("Sähkölaskut", ["sähkö", "kajave"]),
    ("Vesi ja lämpö", ["vesi ja lämpö", "vesiosuuskunta"]),
    ("Työpalkat", ["palkka", "maalaus ja patjan", "sänkyjen maalaus"]),
    ("Maalaus", ["maali", "pensseli", "puunsuoja", "puuöljy", "silikoni", "maalaustarvik"]),
    ("Piha ja ranta", ["ponttoon", "kantojyrsin", "pihakiv", "kaivinkone", "kaivur"]),
    ("Vakuutukset ja maksut", ["vakuutus", "jätemaksu"]),
    ("Rakentaminen ja korjaus", ["takka", "suihkuseinä", "putki", "putken", "lämminvesivaraaja", "peltityö",
                                 "ruuvit", "betoni", "laasti", "ovi", "liukuov", "naulauslevy",
                                 "naukauslevy", "tiiviste", "runkotolppa", "sääskiverkko"]),
    ("Kalusteet ja varusteet", ["jääkaappi", "palju", "sänky", "savustin", "kaappi", "hifi",
                                "veitsi", "thermacell", "ötökkäverho", "puukko", "veitsenteroitus",
                                "ikea", "juomasäilö", "avainkotelo", "kiuaskiv", "puutelista",
                                "pytyn kansi", "kerrossän"]),
]


def categorize(desc, kind):
    if kind == "deposit":
        return "Tilisiirto"
    if kind == "income":
        return "Vuokratulot"
    d = desc.lower()
    for cat, words in CATEGORY_RULES:
        if any(w in d for w in words):
            return cat
    return "Muut"


def parse_date(v):
    try:
        return (dt.date(1899, 12, 30) + dt.timedelta(days=int(float(v)))).isoformat()
    except ValueError:
        # Excelissä yksi kirjoitusvirhe: "20.4.0206" -> 2026-04-20
        d, m, y = v.split(".")
        y = "2026" if y == "0206" else y
        return dt.date(int(y), int(m), int(d)).isoformat()


def read_rows(path):
    z = zipfile.ZipFile(path)
    ss_root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    strings = ["".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t"))
               for si in ss_root.findall("m:si", NS)]
    sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    for row in sheet.iter(f"{{{NS['m']}}}row"):
        if int(row.get("r")) <= 3:
            continue
        cells = {}
        for c in row.findall("m:c", NS):
            col = "".join(ch for ch in c.get("r") if ch.isalpha())
            v = c.find("m:v", NS)
            if v is None or col not in "ABCDE":
                continue
            cells[col] = strings[int(v.text)] if c.get("t") == "s" else v.text
        if all(k in cells for k in "ABCDE"):
            yield cells


def to_entry(c):
    payer, recipient = c["C"].strip(), c["D"].strip().lower()
    amount = round(float(c["E"]), 2)
    if payer == "Tili":
        kind = "account"
    elif payer == "Vuokratulot" or recipient == "vuokratulot":
        kind, payer = "income", "Vuokratulot"
    elif recipient == "tili":
        kind = "deposit"
    else:
        kind = "shared"
    desc = " ".join(c["B"].split())
    return dict(date=parse_date(c["A"]), description=desc, payer=payer, kind=kind,
                amount=amount, category=categorize(desc, kind))


def sql(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    entries = sorted((to_entry(c) for c in read_rows(sys.argv[1])), key=lambda e: e["date"])
    print("DELETE FROM entries;")
    for e in entries:
        print("INSERT INTO entries (date, description, payer, kind, amount, category, created_by) "
              f"VALUES ({sql(e['date'])}, {sql(e['description'])}, {sql(e['payer'])}, "
              f"{sql(e['kind'])}, {e['amount']}, {sql(e['category'])}, 'excel-import');")
    print(f"-- {len(entries)} riviä", file=sys.stderr)


if __name__ == "__main__":
    main()
