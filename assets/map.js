// The confref map: the events of the confref identifiers at their places, filtered by field, discipline, series and
// years. Data: data/map.json (build.py), base map: data/basemap.json (Natural Earth, public domain). No libraries,
// no requests to other sites. State in the address: #e=<event id> (opens its place), #s=<series id> (its events and
// their path in time), #y=<from>-<to>.
(function () {
  "use strict";
  const app = document.querySelector(".map-app");
  const ID = app.dataset.idBase.replace(/\/$/, "");
  const cv = document.getElementById("map"), ctx = cv.getContext("2d");
  const hist = document.getElementById("hist"), hctx = hist.getContext("2d");
  const tip = document.getElementById("tip"), panel = document.getElementById("panel");
  const $ = (id) => document.getElementById(id);
  let D = null, BM = null, land = null, borders = null;
  let W = 0, H = 0, DPR = 1;
  const view = { cx: 10, cy: -30, z: 1 };            // centre in world units (lon, -mercator lat), zoom
  const st = { major: 0, field: -1, disc: -1, series: -1, from: 0, to: 0, place: -1, event: "" };
  let visible = [], perPlace = new Map(), drawn = [];

  const merc = (lat) => (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360));
  const scale = () => (W / 360) * Math.pow(2, view.z);
  const toScreen = (x, y) => [(x - view.cx) * scale() + W / 2, (y - view.cy) * scale() + H / 2];
  const toWorld = (sx, sy) => [(sx - W / 2) / scale() + view.cx, (sy - H / 2) / scale() + view.cy];
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function buildBase() {
    land = new Path2D(); borders = new Path2D();
    const q = BM.q;
    for (const c of BM.countries) for (const r of c.p) {
      let x = 0, y = 0;
      for (let i = 0; i < r.length; i += 2) {
        x += r[i]; y += r[i + 1];
        const wx = x / q, wy = -merc(y / q);
        if (i === 0) { land.moveTo(wx, wy); borders.moveTo(wx, wy); } else { land.lineTo(wx, wy); borders.lineTo(wx, wy); }
      }
      land.closePath(); borders.closePath();
    }
  }

  // --- filtering ---
  function seriesMatch() {
    const t = $("f-series").value.trim().toLowerCase();
    if (!t) return null;
    const exact = D.series.findIndex((s) => s[0] === t || s[1].toLowerCase() === t);
    if (exact >= 0) return new Set([exact]);
    const set = new Set();
    D.series.forEach((s, i) => { if (s[1].toLowerCase().includes(t)) set.add(i); });
    return set;
  }
  function passes(i, ignoreYears) {
    const e = D.events;
    if (st.major && !(e.majors[i] & (1 << (st.major - 1)))) return false;
    if (st.field >= 0 && e.field[i] !== st.field) return false;
    if (st.disc >= 0 && !e.disc[i].includes(st.disc)) return false;
    if (st.seriesSet && !st.seriesSet.has(e.series[i])) return false;
    if (!ignoreYears && (e.year[i] < st.from || e.year[i] > st.to)) return false;
    return true;
  }
  function filter() {
    st.seriesSet = seriesMatch();
    visible = []; perPlace = new Map();
    const n = D.events.id.length;
    for (let i = 0; i < n; i++) if (passes(i)) {
      visible.push(i);
      const p = D.events.place[i];
      perPlace.set(p, (perPlace.get(p) || 0) + 1);
    }
    $("map-count").textContent = `${visible.length.toLocaleString("en")} events at ${perPlace.size.toLocaleString("en")} places`;
    drawHist(); render();
    if (st.place >= 0) showPlace(st.place);
    writeHash();
  }

  // --- drawing ---
  let pending = false;
  function render() { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; draw(); }); } }
  function radius(n) { return Math.min(30, 2.2 + 1.6 * Math.sqrt(n) * Math.pow(1.25, view.z - 1)); }
  function draw() {
    if (!D || !land) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = css("--m-sea"); ctx.fillRect(0, 0, W, H);
    const s = scale();
    ctx.save();
    ctx.setTransform(DPR * s, 0, 0, DPR * s, DPR * (W / 2 - view.cx * s), DPR * (H / 2 - view.cy * s));
    ctx.fillStyle = css("--m-land"); ctx.fill(land, "evenodd");
    ctx.strokeStyle = css("--m-border"); ctx.lineWidth = 0.8 / s; ctx.stroke(borders);
    ctx.restore();
    // the path of a series through its events in time
    if (st.seriesSet && st.seriesSet.size === 1) {
      const pts = visible.slice().sort((a, b) => D.events.year[a] - D.events.year[b]).map((i) => D.places[D.events.place[i]]);
      ctx.strokeStyle = css("--m-line"); ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5; ctx.beginPath();
      pts.forEach((p, k) => { const [x, y] = toScreen(p[2], -merc(p[3])); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    drawn = [];
    const dot = css("--m-dot"), ring = css("--m-dot-ring"), hi = css("--m-hi");
    const items = [...perPlace.entries()].sort((a, b) => b[1] - a[1]);
    for (const [p, n] of items) {
      const pl = D.places[p];
      const [x, y] = toScreen(pl[2], -merc(pl[3]));
      if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
      const r = radius(n);
      ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = p === st.place ? hi : dot; ctx.globalAlpha = 0.72; ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = 1; ctx.strokeStyle = ring; ctx.stroke();
      drawn.push([p, x, y, r, n]);
    }
  }
  function drawHist() {
    const r = hist.getBoundingClientRect();
    hist.width = Math.round(r.width * DPR); hist.height = Math.round(r.height * DPR);
    hctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    hctx.clearRect(0, 0, r.width, r.height);
    const lo = D.years[0], hi = D.years[1], cnt = new Array(hi - lo + 1).fill(0);
    const n = D.events.id.length;
    for (let i = 0; i < n; i++) if (passes(i, true)) cnt[D.events.year[i] - lo]++;
    const mx = Math.max(1, ...cnt), bw = r.width / cnt.length;
    cnt.forEach((c, k) => {
      const y = lo + k, h = (r.height - 2) * (c / mx);
      hctx.fillStyle = y >= st.from && y <= st.to ? css("--teal-ink") : css("--line");
      hctx.fillRect(k * bw, r.height - h, Math.max(1, bw - 0.5), h);
    });
  }

  // --- the panel of a place ---
  function showPlace(p) {
    st.place = p;
    const pl = D.places[p];
    const evs = visible.filter((i) => D.events.place[i] === p).sort((a, b) => D.events.year[b] - D.events.year[a]);
    const items = evs.slice(0, 300).map((i) => {
      const id = D.events.id[i], s = D.events.series[i];
      const ser = s >= 0 ? `<div class="muted small">${esc(D.series[s][1])}</div>` : "";
      return `<li class="${id === st.event ? "hi" : ""}"><span class="y">${D.events.year[i]}</span>` +
        `<a href="${ID}/event/${id}">${esc(D.events.label[i])}</a>${ser}</li>`;
    }).join("");
    const more = evs.length > 300 ? `<p class="muted small">The first 300 of ${evs.length.toLocaleString("en")}.</p>` : "";
    panel.innerHTML = `<button class="close" type="button" aria-label="Close">×</button>` +
      `<p class="eyebrow">Place</p><h2>${esc(pl[1])}</h2>` +
      `<p class="muted small">${evs.length.toLocaleString("en")} events · <a href="https://www.wikidata.org/wiki/${pl[0]}">Wikidata ${pl[0]}</a></p>` +
      `<ol>${items}</ol>${more}`;
    panel.hidden = false;
    panel.querySelector(".close").onclick = () => { panel.hidden = true; st.place = -1; st.event = ""; render(); writeHash(); };
    render();
  }

  // --- interaction ---
  function hit(mx, my) {
    for (let k = drawn.length - 1; k >= 0; k--) {
      const [p, x, y, r, n] = drawn[k];
      if ((mx - x) ** 2 + (my - y) ** 2 <= (r + 3) ** 2) return [p, n, x, y];
    }
    return null;
  }
  const pointers = new Map();
  let dragged = false, last = null, pinch = 0;
  cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.offsetX, e.offsetY]); dragged = false; last = [e.offsetX, e.offsetY]; });
  cv.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.log2(d / pinch));
        pinch = d; dragged = true; return;
      }
      const dx = e.offsetX - last[0], dy = e.offsetY - last[1];
      if (Math.abs(dx) + Math.abs(dy) > 2) { dragged = true; cv.classList.add("dragging"); }
      view.cx -= dx / scale(); view.cy -= dy / scale(); last = [e.offsetX, e.offsetY]; clamp(); render(); return;
    }
    const h = hit(e.offsetX, e.offsetY);
    if (h) {
      tip.hidden = false; tip.textContent = `${D.places[h[0]][1]}: ${h[1].toLocaleString("en")}`;
      tip.style.left = Math.min(W - 160, e.offsetX + 12) + "px"; tip.style.top = (e.offsetY + 12) + "px";
      cv.style.cursor = "pointer";
    } else { tip.hidden = true; cv.style.cursor = ""; }
  });
  const up = (e) => {
    pointers.delete(e.pointerId); pinch = 0; cv.classList.remove("dragging");
    if (!dragged && e.type === "pointerup") { const h = hit(e.offsetX, e.offsetY); if (h) { st.event = ""; showPlace(h[0]); writeHash(); } }
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, -e.deltaY / 400); }, { passive: false });
  function zoomAt(sx, sy, dz) {
    const [wx, wy] = toWorld(sx, sy);
    view.z = Math.max(0, Math.min(10, view.z + dz));
    const [nx, ny] = toWorld(sx, sy);
    view.cx += wx - nx; view.cy += wy - ny; clamp(); render();
  }
  function clamp() { view.cx = Math.max(-180, Math.min(180, view.cx)); view.cy = Math.max(-180, Math.min(180, view.cy)); }
  function resize() {
    const r = cv.getBoundingClientRect();
    DPR = window.devicePixelRatio || 1; W = r.width; H = r.height;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    if (D) { drawHist(); render(); }
  }

  // --- the address ---
  function writeHash() {
    const parts = [];
    if (st.event) parts.push("e=" + st.event);
    if (st.seriesSet && st.seriesSet.size === 1 && $("f-series").dataset.sid) parts.push("s=" + $("f-series").dataset.sid);
    if (D && (st.from !== D.years[0] || st.to !== D.years[1])) parts.push(`y=${st.from}-${st.to}`);
    const h = parts.join("&");
    if (("#" + h) !== location.hash && !(h === "" && location.hash === "")) history.replaceState(null, "", h ? "#" + h : location.pathname);
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const y = (p.get("y") || "").match(/^(\d{4})-(\d{4})$/);
    if (y) { st.from = +y[1]; st.to = +y[2]; $("f-from").value = st.from; $("f-to").value = st.to; }
    const s = p.get("s");
    if (s) { const k = D.series.findIndex((x) => x[0] === s); if (k >= 0) { $("f-series").value = D.series[k][1]; $("f-series").dataset.sid = s; } }
    filter();
    const e = p.get("e");
    if (e) {
      const i = D.events.id.indexOf(e);
      if (i >= 0) {
        st.event = e;
        if (D.events.year[i] < st.from || D.events.year[i] > st.to) { st.from = D.years[0]; st.to = D.years[1]; filter(); }
        const pl = D.places[D.events.place[i]];
        view.cx = pl[2]; view.cy = -merc(pl[3]); view.z = 4; showPlace(D.events.place[i]);
      }
    } else if (s && visible.length) fit(visible);
  }
  function fit(evs) {
    let x0 = 180, x1 = -180, y0 = 180, y1 = -180;
    for (const i of evs) { const p = D.places[D.events.place[i]], y = -merc(p[3]); x0 = Math.min(x0, p[2]); x1 = Math.max(x1, p[2]); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    view.cx = (x0 + x1) / 2; view.cy = (y0 + y1) / 2;
    view.z = Math.max(0.5, Math.min(6, Math.log2(Math.min((W - 80) / Math.max(1, (x1 - x0) * W / 360), (H - 80) / Math.max(1, (y1 - y0) * W / 360)))));
    render();
  }

  // --- controls ---
  function controls() {
    const ys = D.events.year;
    D.years = [Math.min(...ys), Math.max(...ys)];
    st.from = D.years[0]; st.to = D.years[1];
    for (const id of ["f-from", "f-to"]) { $(id).min = D.years[0]; $(id).max = D.years[1]; }
    $("f-from").value = st.from; $("f-to").value = st.to;
    D.fields.forEach(([c, l], i) => {
      const o = new Option(`${c} ${l}`, c.includes(".") ? i : +c);
      (c.includes(".") ? $("f-field") : $("f-major")).add(o);
    });
    D.disciplines.forEach(([q, l], i) => $("f-disc").add(new Option(l, i)));
    $("series-list").innerHTML = D.series.slice().sort((a, b) => a[1].localeCompare(b[1])).slice(0, 4000)
      .map((s) => `<option value="${esc(s[1])}">`).join("");
    $("f-major").onchange = (e) => { st.major = +e.target.value; filter(); };
    $("f-field").onchange = (e) => { st.field = +e.target.value; filter(); };
    $("f-disc").onchange = (e) => { st.disc = +e.target.value; filter(); };
    let t = null;
    $("f-series").oninput = (e) => {
      clearTimeout(t);
      t = setTimeout(() => {
        const k = D.series.findIndex((s) => s[1] === e.target.value);
        e.target.dataset.sid = k >= 0 ? D.series[k][0] : "";
        filter(); if (k >= 0 && visible.length) fit(visible);
      }, 250);
    };
    const years = () => {
      st.from = Math.max(D.years[0], +$("f-from").value || D.years[0]);
      st.to = Math.min(D.years[1], +$("f-to").value || D.years[1]);
      if (st.from > st.to) [st.from, st.to] = [st.to, st.from];
      filter();
    };
    $("f-from").onchange = years; $("f-to").onchange = years;
    let timer = null;
    $("play").onclick = () => {
      if (timer) { clearInterval(timer); timer = null; $("play").textContent = "Play"; $("play").setAttribute("aria-pressed", "false"); return; }
      let y = st.from === st.to ? st.from : D.years[0];
      $("play").textContent = "Stop"; $("play").setAttribute("aria-pressed", "true");
      timer = setInterval(() => {
        st.from = st.to = y; $("f-from").value = $("f-to").value = y; filter();
        y = y >= D.years[1] ? D.years[0] : y + 1;
      }, 450);
    };
    $("reset").onclick = () => {
      st.major = 0; st.field = -1; st.disc = -1; st.place = -1; st.event = "";
      $("f-major").value = "0"; $("f-field").value = "-1"; $("f-disc").value = "-1"; $("f-series").value = ""; $("f-series").dataset.sid = "";
      st.from = D.years[0]; st.to = D.years[1]; $("f-from").value = st.from; $("f-to").value = st.to;
      panel.hidden = true; view.cx = 10; view.cy = -30; view.z = 1; filter();
    };
    hist.addEventListener("click", (e) => {
      const r = hist.getBoundingClientRect(), y = D.years[0] + Math.floor((e.clientX - r.left) / r.width * (D.years[1] - D.years[0] + 1));
      st.from = st.to = y; $("f-from").value = $("f-to").value = y; filter();
    });
    $("not-drawn").textContent = `${D.counts["country only"].toLocaleString("en")} by country only, ` +
      `${D.counts["no place"].toLocaleString("en")} without a place`;
  }

  window.addEventListener("resize", resize);
  window.addEventListener("hashchange", () => { if (D) readHash(); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
  resize();
  Promise.all([fetch("data/map.json").then((r) => r.json()), fetch("data/basemap.json").then((r) => r.json())])
    .then(([d, bm]) => { D = d; BM = bm; buildBase(); controls(); resize(); readHash(); })
    .catch((e) => { $("map-count").textContent = "The data could not be loaded (" + e.message + ")."; });
})();
