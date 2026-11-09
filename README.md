# confref-map

The events of the confref identifiers on a world map, over time: a showcase of
[confref labs](https://labs.confref.org/map/), static, without requests to other sites.

| Path | What |
|---|---|
| `build.py` | builds `dist/` from the index of the platform (confref-platform, `apps/graph/index.py`): `python3 build.py <confref.sqlite> [dist]`; `CR_ID_BASE` points the links of the events elsewhere (local tests) |
| `assets/index.html`, `map.js`, `map.css` | the page: canvas, filters (academic field, field, discipline, series, years), histogram, play through the years, the events of a place, the path of a series |
| `assets/basemap.json` | the base map: countries of Natural Earth 1:50m (public domain), simplified by `tools/make_basemap.py` |

On the VM the map is built after each load (`services/jobs.sh map` of confref-platform) into `/data/confref/www/map`
and served as `/map/`; the page includes the kit of the labs (header, footer, stylesheet) through nginx (SSI).

Addresses: `/map/#e=<event id>` opens the place of an event, `#s=<series id>` shows a series and its path in time,
`#y=<from>-<to>` sets the years.

Licence: code MIT; base map Natural Earth (public domain); data CC0.
