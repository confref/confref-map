#!/usr/bin/env python3
"""Build the confref map (labs.confref.org/map/): a static page, its script and style, the base map, and the data of
the events with a place, made from the index of the platform (confref-platform, apps/graph/index.py).

    python3 build.py <index.sqlite> [dist]

The data (dist/data/map.json) is columnar, to keep it small:
- places: id (Wikidata QID), label, lon, lat, country (ISO), level (1 city, 2 region);
- events: id, label (acronym and year where there is an acronym), year, place (index), series (index or -1), fields
  (bit set of the 6 major fields), field (index of the first of the 42 fields or -1), disciplines (indices);
- series: id, label; fields: code, label; disciplines: QID, label (those of at least MIN_DISCIPLINE events).
Events placed only by country are counted (not drawn). Standard library only.
"""

import json
import os
import shutil
import sqlite3
import sys
import time
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
B = "https://id.confref.org/"
MIN_DISCIPLINE = 20
ID_BASE = os.environ.get("CR_ID_BASE", "https://id.confref.org")   # where the links of the events go (local tests)


def label_of(db, iri, default=""):
    r = db.execute("SELECT label FROM label WHERE iri = ?", (iri,)).fetchone()
    return r[0] if r else default


def build(index, dist):
    db = sqlite3.connect(f"file:{index}?mode=ro", uri=True)
    rows = db.execute("""SELECT id, label, alt, year, place, lat, lon, level, country, series, fields, disciplines, mode
                         FROM entity WHERE kind = 'event' AND lat IS NOT NULL AND level < 3 AND year IS NOT NULL
                         ORDER BY year, id""").fetchall()
    country_only = db.execute("SELECT COUNT(*) FROM entity WHERE kind = 'event' AND level = 3").fetchone()[0]
    no_place = db.execute("SELECT COUNT(*) FROM entity WHERE kind = 'event' AND place IS NULL").fetchone()[0]
    places, pidx = [], {}
    series, sidx = [], {}
    disc_count = Counter(d for r in rows for d in json.loads(r[11]))
    discs = sorted((d for d, n in disc_count.items() if n >= MIN_DISCIPLINE), key=lambda d: -disc_count[d])
    didx = {d: i for i, d in enumerate(discs)}
    fos = [(r[0].rsplit("/", 1)[1], r[1]) for r in db.execute(
        "SELECT iri, label FROM label WHERE iri LIKE ? ORDER BY iri", (B + "data/oecd-fos/%",))]
    fos.sort(key=lambda x: [int(p) for p in x[0].split(".")])
    fidx = {c: i for i, (c, _l) in enumerate(fos)}
    ev = {k: [] for k in ("id", "label", "year", "place", "series", "majors", "field", "disc")}
    for (ident, lab, alt, year, place, lat, lon, level, country, ser, fields, disc, mode) in rows:
        if place not in pidx:
            pidx[place] = len(places)
            places.append([place.rsplit("/", 1)[1], label_of(db, place, place.rsplit("/", 1)[1]), lon, lat, country or "", level])
        sers = json.loads(ser)
        s = -1
        if sers:
            if sers[0] not in sidx:
                sidx[sers[0]] = len(series)
                series.append([sers[0], label_of(db, B + "series/" + sers[0], sers[0])])
            s = sidx[sers[0]]
        alts = json.loads(alt)
        short = f"{alts[0]} {year}" if alts and str(year) not in alts[0] else (alts[0] if alts else lab)
        fl = json.loads(fields)
        majors = sum(1 << (int(c) - 1) for c in {c.split(".")[0] for c in fl})
        sub = [c for c in fl if "." in c]
        ev["id"].append(ident)
        ev["label"].append(short[:120])
        ev["year"].append(year)
        ev["place"].append(pidx[place])
        ev["series"].append(s)
        ev["majors"].append(majors)
        ev["field"].append(fidx.get(sub[0], -1) if sub else -1)
        ev["disc"].append([didx[d] for d in json.loads(disc) if d in didx])
    build_info = json.loads(db.execute("SELECT value FROM meta WHERE key = 'build'").fetchone()[0])
    data = {"built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "index": build_info["built"],
            "versions": {k: v for k, v in build_info["versions"].items() if k in ("ids", "ls-places", "wikidata-places", "ls-fields")},
            "counts": {"drawn": len(rows), "country only": country_only, "no place": no_place},
            "places": places, "series": series, "fields": fos,
            "disciplines": [[d.rsplit("/", 1)[1], label_of(db, d, d.rsplit("/", 1)[1])] for d in discs],
            "events": ev}
    dist.mkdir(parents=True, exist_ok=True)
    (dist / "data").mkdir(exist_ok=True)
    (dist / "data" / "map.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for f in ("map.js", "map.css"):
        shutil.copyfile(HERE / "assets" / f, dist / f)
    page = (HERE / "assets" / "index.html").read_text(encoding="utf-8")
    page = page.replace('data-id-base="https://id.confref.org"', f'data-id-base="{ID_BASE}"')
    (dist / "index.html").write_text(page, encoding="utf-8")
    shutil.copyfile(HERE / "assets" / "basemap.json", dist / "data" / "basemap.json")
    print(f"{len(rows):,} events at {len(places):,} places, {len(series):,} series; "
          f"{(dist / 'data' / 'map.json').stat().st_size / 1e6:.1f} MB -> {dist}")


if __name__ == "__main__":
    build(Path(sys.argv[1]), Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / "dist")
