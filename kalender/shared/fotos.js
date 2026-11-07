/*
 * Dein Adventskalender – Baustein „Fotos“ (shared/fotos.js) für den eigenen Kalender
 *
 * Liefert die eigenen Bilder als URLs. werkzeuge/bauen.mjs verkleinert sie nach web/, die URL-Vorlagen und Angaben
 * stehen in window.ADVENTSKALENDER: bildUrl 'web/{t}-{g}-{v}.webp', einzelUrl 'web/{t}-e{i}-{g}-{v}.webp',
 * tage { '1': { bild, w, h, farbe, titel, v, einzel }, … } – nur freigegebene Tage.
 * Platzhalter: {t} Tag, {g} Größe (k|q|m|l), {v} zufälliger Namensteil, {i} Einzelfoto (1-basiert).
 * Bilder laden asynchron (onload/decode abwarten, bevor auf Canvas gezeichnet wird). Für gesperrte Tage wird nie eine
 * URL erzeugt; fehlt ein Bild, gibt es einen gemalten Platzhalter „Foto folgt“. Scheitert ein <img>, tauscht der
 * Baustein die Quelle gegen den Platzhalter (abschalten pro Bild mit dem Attribut data-kein-ersatz).
 *
 * API (window.Fotos):
 *   bild(tag)              Collage des Tages: URL in Größe 'l' (wenn innerWidth·devicePixelRatio ≥ 1100) sonst 'm';
 *                          startet zugleich das Vorladen (wie im Prototyp darf man bild(t) zum „Vorbereiten“ aufrufen)
 *   format(tag)            'quadrat' | 'hoch' (aus den Abmessungen; Querformat zählt als 'quadrat')
 *   vorschau(tag, px=320)  quadratische Vorschau: px ≤ 480 → Größe 'k' (480 px), sonst 'q' (960 px)
 *   einzelbilder(tag)      Array der Einzelfoto-URLs (Größe wie bild) oder [bild(tag)], wenn es keine gibt
 *   titel(tag)             Bildunterschrift ('' wenn keine)
 *   farbe(tag)             Leitfarbe des Tages als Hex (Durchschnittsfarbe des Bildes)
 * Zusätzlich (neu, optional):
 *   hatBild(tag)           true, wenn es für den Tag ein echtes Bild vom Server gibt
 *   masse(tag)             { w, h } des Originals (bzw. des Platzhalters)
 *   platzhalter(tag, px)   gemalter „Foto folgt“-Platzhalter als data:-URL (px angegeben → quadratische Vorschau)
 *   istPlatzhalter(url)    true für data:-URLs aus diesem Baustein
 *   laden(url[, tag])      Promise → fertig dekodiertes <img>; bei Fehler der passende Platzhalter (nie reject)
 */
(function () {
  'use strict';

  var M = (window.ADVENTSKALENDER && typeof window.ADVENTSKALENDER === 'object') ? window.ADVENTSKALENDER : null;
  var TAGE_DATEN = (M && M.tage && typeof M.tage === 'object') ? M.tage : {};
  var BILD_URL = (M && typeof M.bildUrl === 'string') ? M.bildUrl : '';
  var EINZEL_URL = (M && typeof M.einzelUrl === 'string') ? M.einzelUrl : '';

  function ganzzahl(x) {
    var n = typeof x === 'number' ? x : parseInt(x, 10);
    return isFinite(n) ? Math.round(n) : NaN;
  }

  // ---------- Daten & Freigabe ----------
  function daten(t) {
    if (!(t >= 1 && t <= 24)) return null;
    var d = TAGE_DATEN[String(t)];
    return (d && typeof d === 'object') ? d : null;
  }
  function freigegeben(t) {
    if (!(t >= 1 && t <= 24)) return false;
    var K = window.Kalender;
    if (K && typeof K.darfOeffnen === 'function') return !!K.darfOeffnen(t);
    var h = M ? ganzzahl(M.heute) : 0;
    return h >= 25 || t <= h;
  }
  // Daten nur, wenn der Tag (auch laut Kalender) freigegeben ist
  function freieDaten(t) { return freigegeben(t) ? daten(t) : null; }
  function mitBild(t) { var d = freieDaten(t); return (d && d.bild === true && BILD_URL) ? d : null; }
  function einzelAnzahl(d) { var n = d ? ganzzahl(d.einzel) : 0; return n > 0 ? Math.min(60, n) : 0; }

  function grossG() {
    return (window.innerWidth || 0) * (window.devicePixelRatio || 1) >= 1100 ? 'l' : 'm';
  }

  // {h}: nicht erratbarer Namensteil (statisch). Achtung: tage[t].h ist sonst die Bildhöhe (Zahl) –
  // Zahlen werden deshalb nie als Namensteil benutzt; Vorrang hat ein eigenes Feld „hash“.
  function namensteil(d, g, i) {
    var x = i ? (d.he && d.he.length ? d.he[i - 1] : null) : (d.hash !== undefined ? d.hash : d.h);
    if (x && typeof x === 'object') x = x[g];
    return (typeof x === 'string' && /^[A-Za-z0-9_-]+$/.test(x)) ? x : '';
  }

  function urlBauen(vorlage, t, g, i, d) {
    var h = '';
    if (vorlage.indexOf('{h}') >= 0) { h = namensteil(d, g, i); if (!h) return ''; }
    return vorlage
      .replace(/\{t\}/g, String(t))
      .replace(/\{g\}/g, g)
      .replace(/\{i\}/g, String(i || ''))
      .replace(/\{v\}/g, encodeURIComponent(d.v === undefined || d.v === null ? '' : String(d.v)))
      .replace(/\{h\}/g, encodeURIComponent(h));
  }

  // Erzeugte URLs merken (für den automatischen Ersatz bei Ladefehlern)
  var bekannt = {};
  var anker = document.createElement('a');
  function absolut(u) { anker.href = u; return anker.href; }
  function merken(u, info) { bekannt[absolut(u)] = info; return u; }

  // Vorladen (wie im Prototyp: bild(t) „bereitet vor“), Referenz halten bis geladen
  var imFlug = [];
  function vorladen(u) {
    for (var i = 0; i < imFlug.length; i++) if (imFlug[i].u === u) return;
    if (imFlug.length >= 6) return;
    var im = new Image(), eintrag = { u: u, im: im };
    im.decoding = 'async';
    im.onload = im.onerror = function () {
      var j = imFlug.indexOf(eintrag);
      if (j >= 0) imFlug.splice(j, 1);
    };
    imFlug.push(eintrag);
    im.src = u;
  }

  // ======================================================================================
  // Platzhalter-Maler (aus dem Prototyp übernommen): deterministische, gemalte Szenen per Canvas
  // ======================================================================================
  var SZENE = [
    '', 'schnee', 'schnee', 'innen', 'innen', 'fruehling', 'wiese', 'see', 'innen', 'see',
    'strand', 'strand', 'abend', 'stadt', 'wald', 'feld', 'herbst', 'herbst', 'nacht',
    'innen', 'markt', 'schnee', 'markt', 'innen', 'nacht'
  ];
  var FARBE = {
    schnee: '#7fb4d9', innen: '#e3a35a', fruehling: '#9fcf6a', wiese: '#6fbf4a', see: '#3f9fc6',
    strand: '#f2c76a', abend: '#f07a4a', stadt: '#d98c5f', wald: '#4f8f3a', feld: '#e0b84a',
    herbst: '#e0742c', nacht: '#f4c35a', markt: '#ffb347'
  };
  var JACKEN = ['#2f6fd0', '#e8557a', '#7ccf3a', '#f2a93b', '#d63a3a', '#3fb6a8', '#8b5cf6', '#f4f1e8'];

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function verlauf(g, x0, y0, x1, y1, stops) {
    var v = g.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i++) v.addColorStop(stops[i][0], stops[i][1]);
    return v;
  }
  function huegel(g, w, h, basis, amp, farbe, r, glatt) {
    g.fillStyle = farbe;
    g.beginPath();
    g.moveTo(0, h);
    var n = 7, phase = r() * 6.28, phase2 = r() * 6.28;
    for (var i = 0; i <= 60; i++) {
      var x = (i / 60) * w;
      var y = basis + Math.sin(i / 60 * n * (glatt || 0.6) + phase) * amp + Math.sin(i / 60 * 3.1 + phase2) * amp * 0.6;
      g.lineTo(x, y);
    }
    g.lineTo(w, h);
    g.closePath();
    g.fill();
  }
  function tanne(g, x, y, s, farbe, schnee) {
    g.fillStyle = '#4a3324';
    g.fillRect(x - s * 0.06, y - s * 0.12, s * 0.12, s * 0.14);
    for (var i = 0; i < 3; i++) {
      var ty = y - s * 0.1 - i * s * 0.28, b = s * (0.42 - i * 0.1);
      g.fillStyle = farbe;
      g.beginPath(); g.moveTo(x - b, ty); g.lineTo(x, ty - s * 0.42); g.lineTo(x + b, ty); g.closePath(); g.fill();
      if (schnee) {
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.beginPath(); g.moveTo(x - b * 0.45, ty - s * 0.22); g.lineTo(x, ty - s * 0.42); g.lineTo(x + b * 0.45, ty - s * 0.22); g.closePath(); g.fill();
      }
    }
  }
  function laubbaum(g, x, y, s, farbe) {
    g.fillStyle = '#5a3d29';
    g.fillRect(x - s * 0.05, y - s * 0.5, s * 0.1, s * 0.5);
    g.fillStyle = farbe;
    g.beginPath(); g.arc(x, y - s * 0.7, s * 0.34, 0, 6.29); g.fill();
    g.beginPath(); g.arc(x - s * 0.22, y - s * 0.55, s * 0.24, 0, 6.29); g.fill();
    g.beginPath(); g.arc(x + s * 0.22, y - s * 0.56, s * 0.25, 0, 6.29); g.fill();
  }
  function rundRechteck(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  // Eine Familie: 2–4 Figuren mit bunten Jacken und Mützen
  function familie(g, cx, boden, groesse, r, winter, nacht) {
    var n = 2 + Math.floor(r() * 3);
    var hoehen = [1, 0.92, 0.66, 0.58].slice(0, n);
    hoehen.sort(function () { return r() - 0.5; });
    var abstand = groesse * 0.36;
    var start = cx - (n - 1) * abstand / 2;
    for (var i = 0; i < n; i++) {
      var hh = groesse * hoehen[i];
      var x = start + i * abstand + (r() - 0.5) * abstand * 0.2;
      var jacke = JACKEN[Math.floor(r() * JACKEN.length)];
      var bw = hh * 0.34, bh = hh * 0.52;
      g.fillStyle = nacht ? '#1d2230' : '#2b3040';
      g.fillRect(x - bw * 0.32, boden - hh * 0.26, bw * 0.26, hh * 0.26);
      g.fillRect(x + bw * 0.06, boden - hh * 0.26, bw * 0.26, hh * 0.26);
      g.fillStyle = jacke;
      rundRechteck(g, x - bw / 2, boden - hh * 0.26 - bh, bw, bh, bw * 0.3); g.fill();
      var kr = hh * 0.13, ky = boden - hh * 0.26 - bh - kr * 0.85;
      g.fillStyle = '#e8c4a0';
      g.beginPath(); g.arc(x, ky, kr, 0, 6.29); g.fill();
      if (winter) {
        g.fillStyle = JACKEN[(i * 3 + 1) % JACKEN.length];
        g.beginPath(); g.arc(x, ky - kr * 0.15, kr * 1.02, Math.PI, 0); g.fill();
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(x, ky - kr * 1.2, kr * 0.32, 0, 6.29); g.fill();
      } else {
        g.fillStyle = ['#6b4a2b', '#d9b26a', '#3a2a1e', '#b07a3a'][i % 4];
        g.beginPath(); g.arc(x, ky - kr * 0.25, kr * 1.02, Math.PI * 1.05, -0.05 * Math.PI); g.fill();
      }
      if (nacht) {
        g.fillStyle = 'rgba(10,14,30,0.35)';
        rundRechteck(g, x - bw / 2, boden - hh, bw, hh, bw * 0.3); g.fill();
      }
    }
  }
  function bokeh(g, w, h, r, anzahl, farben, maxR) {
    for (var i = 0; i < anzahl; i++) {
      var x = r() * w, y = r() * h * 0.85, rad = (0.3 + r() * 0.7) * maxR;
      var f = farben[Math.floor(r() * farben.length)];
      var v = g.createRadialGradient(x, y, 0, x, y, rad);
      v.addColorStop(0, f); v.addColorStop(0.55, f.replace(/[\d.]+\)$/, '0.25)')); v.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = v;
      g.beginPath(); g.arc(x, y, rad, 0, 6.29); g.fill();
    }
  }
  function flocken(g, w, h, r, n) {
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (var i = 0; i < n; i++) {
      g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * Math.max(2, w / 260), 0, 6.29); g.fill();
    }
  }
  function sonne(g, x, y, rad, kern, schein) {
    var v = g.createRadialGradient(x, y, rad * 0.2, x, y, rad * 3.2);
    v.addColorStop(0, schein); v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v; g.beginPath(); g.arc(x, y, rad * 3.2, 0, 6.29); g.fill();
    g.fillStyle = kern; g.beginPath(); g.arc(x, y, rad, 0, 6.29); g.fill();
  }
  function wasser(g, w, y0, h, oben, unten, r) {
    g.fillStyle = verlauf(g, 0, y0, 0, h, [[0, oben], [1, unten]]);
    g.fillRect(0, y0, w, h - y0);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = Math.max(1, w / 400);
    for (var i = 0; i < 26; i++) {
      var y = y0 + 4 + r() * (h - y0) * 0.6, x = r() * w, l = 20 + r() * w * 0.15;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y); g.stroke();
    }
  }
  function lichterkette(g, w, y, r, durchhang) {
    g.strokeStyle = 'rgba(40,30,20,0.6)'; g.lineWidth = Math.max(1, w / 500);
    g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(w / 2, y + durchhang * 2, w, y); g.stroke();
    var farben = ['rgba(255,214,120,1)', 'rgba(255,120,110,1)', 'rgba(130,220,170,1)', 'rgba(120,180,255,1)'];
    for (var i = 1; i < 14; i++) {
      var t = i / 14, x = t * w, yy = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * (y + durchhang * 2) + t * t * y;
      var f = farben[i % 4], rad = w / 70;
      var v = g.createRadialGradient(x, yy + rad, 0, x, yy + rad, rad * 3);
      v.addColorStop(0, f); v.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = v; g.beginPath(); g.arc(x, yy + rad, rad * 3, 0, 6.29); g.fill();
    }
  }

  function szene(typ, w, h, seed) {
    var c = canvas(w, h), g = c.getContext('2d'), r = rng(seed);
    var m = Math.min(w, h), boden = h * (0.78 + r() * 0.08);
    var fig = m * (0.42 + r() * 0.2), fx = w * (0.3 + r() * 0.4);
    var i, j, k, s;
    switch (typ) {
      case 'schnee':
        g.fillStyle = verlauf(g, 0, 0, 0, h, [[0, '#9cc7ea'], [0.6, '#dcecf7'], [1, '#ffffff']]); g.fillRect(0, 0, w, h);
        sonne(g, w * (0.2 + r() * 0.6), h * 0.18, m * 0.05, '#fffbe8', 'rgba(255,255,240,0.6)');
        huegel(g, w, h, h * 0.55, h * 0.05, '#c9dbea', r);
        for (i = 0; i < 9; i++) tanne(g, r() * w, h * (0.6 + r() * 0.06), m * (0.14 + r() * 0.1), '#2f5a48', true);
        huegel(g, w, h, h * 0.72, h * 0.04, '#f4f8fc', r);
        familie(g, fx, boden, fig, r, true, false);
        flocken(g, w, h, r, 90);
        break;
      case 'innen':
        g.fillStyle = verlauf(g, 0, 0, 0, h, [[0, '#6b3f2a'], [0.7, '#a8653a'], [1, '#5a3420']]); g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,230,190,0.18)';
        g.fillRect(w * 0.62, h * 0.12, w * 0.28, h * 0.38);
        g.fillStyle = '#2a3a5c'; g.fillRect(w * 0.64, h * 0.14, w * 0.24, h * 0.34);
        flocken(g, w * 0.24, h * 0.34, r, 12);
        lichterkette(g, w, h * 0.08, r, h * 0.05);
        familie(g, fx * 0.85, boden, fig, r, false, false);
        g.fillStyle = '#4a2a18'; g.fillRect(0, h * 0.86, w, h * 0.14);
        g.fillStyle = '#f2ead8'; rundRechteck(g, w * 0.08, h * 0.8, w * 0.84, h * 0.08, h * 0.02); g.fill();
        var kv = g.createRadialGradient(w * 0.5, h * 0.4, m * 0.1, w * 0.5, h * 0.5, m * 0.9);
        kv.addColorStop(0, 'rgba(255,200,120,0.25)'); kv.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = kv; g.fillRect(0, 0, w, h);
        break;
      case 'fruehling':
      case 'wiese':
        g.fillStyle = verlauf(g, 0, 0, 0, h, [[0, '#6fb6f0'], [0.7, '#cfe9fb'], [1, '#e8f6ff']]); g.fillRect(0, 0, w, h);
        sonne(g, w * (0.65 + r() * 0.25), h * 0.15, m * 0.06, '#fff6c8', 'rgba(255,245,190,0.7)');
        huegel(g, w, h, h * 0.58, h * 0.05, '#8cc46a', r);
        for (j = 0; j < 5; j++) laubbaum(g, r() * w, h * 0.64, m * (0.2 + r() * 0.12), typ === 'fruehling' ? '#f3b6c9' : '#4f9a3a');
        huegel(g, w, h, h * 0.7, h * 0.03, '#6fb24a', r);
        for (k = 0; k < 70; k++) {
          g.fillStyle = ['#ffffff', '#ffd84a', '#ff7aa8', '#9fd7ff'][k % 4];
          g.beginPath(); g.arc(r() * w, h * (0.74 + r() * 0.26), m * 0.006 + r() * m * 0.006, 0, 6.29); g.fill();
        }
        familie(g, fx, boden, fig, r, false, false);
        break;
      case 'see':
      case 'strand':
        g.fillStyle = verlauf(g, 0, 0, 0, h, [[0, '#4aa3e0'], [0.55, '#bfe3f7'], [1, '#e9f6fc']]); g.fillRect(0, 0, w, h);
        for (var wo = 0; wo < 4; wo++) {
          g.fillStyle = 'rgba(255,255,255,0.85)';
          var wx = r() * w, wy = h * (0.08 + r() * 0.2), ws = m * (0.06 + r() * 0.05);
          g.beginPath(); g.arc(wx, wy, ws, 0, 6.29); g.arc(wx + ws, wy + ws * 0.2, ws * 0.8, 0, 6.29); g.arc(wx - ws, wy + ws * 0.25, ws * 0.7, 0, 6.29); g.fill();
        }
        if (typ === 'see') huegel(g, w, h, h * 0.48, h * 0.03, '#4f8f5a', r);
        wasser(g, w, h * 0.5, h, '#2f86c0', '#5fb7d9', r);
        if (typ === 'strand') {
          huegel(g, w, h, h * 0.74, h * 0.02, '#f1d79a', r, 0.3);
          for (s = 0; s < 4; s++) {
            g.fillStyle = ['#e94b3c', '#ffffff', '#2f6fd0', '#f2c400'][s];
            g.fillRect(w * (0.05 + s * 0.08), h * 0.66, w * 0.05, h * 0.07);
          }
        } else {
          huegel(g, w, h, h * 0.76, h * 0.02, '#9cbf6a', r, 0.3);
        }
        familie(g, fx, boden, fig, r, false, false);
        break;
      case 'abend':
        g.fillStyle = verlauf(g, 0, 0, 0, h, [[0, '#3a2a6a'], [0.35, '#c4557a'], [0.55, '#f59a4a'], [0.6, '#ffd27a'], [1, '#2a2a4a']]); g.fillRect(0, 0, w, h);
        sonne(g, w * 0.5, h * 0.56, m * 0.09, '#ffe2a0', 'rgba(255,190,110,0.8)');
        wasser(g, w, h * 0.58, h, '#e07a5a', '#3a2a5a', r);
        g.fillStyle = '#1f1a30'; g.fillRect(0, h * 0.82, w, h * 0.18);
        familie(g, fx, boden, fig, r, false, true);
        break;
      case 'stadt':
        g.fillStyle = verlauf(g, 0, 0, 0, h, [[0, '#8fc8f0'], [1, '#f2e8d8']]); g.fillRect(0, 0, w, h);
        for (var hs = 0; hs < 6; hs++) {
          var hx = hs * w / 6, hw = w / 6 - 4, hh2 = h * (0.3 + r() * 0.25);
          g.fillStyle = ['#d9a47a', '#e8c98a', '#c97a5a', '#b8c4cf', '#e2b8a0', '#cfa66a'][hs];
          g.fillRect(hx + 2, h * 0.75 - hh2, hw, hh2);
          g.fillStyle = 'rgba(40,60,90,0.55)';
          for (var fy = 0; fy < 4; fy++) for (var fx2 = 0; fx2 < 2; fx2++)
            g.fillRect(hx + 2 + hw * (0.18 + fx2 * 0.42), h * 0.75 - hh2 + hh2 * (0.12 + fy * 0.2), hw * 0.22, hh2 * 0.1);
        }
        g.fillStyle = '#b0aaa0'; g.fillRect(0, h * 0.75, w, h * 0.25);
        familie(g, fx, boden, fig, r, false, false);
        g.fillStyle = '#e94b3c'; rundRechteck(g, fx + fig * 0.35, boden - fig * 0.5, fig * 0.3, fig * 0.42, fig * 0.04); g.fill();
        break;
      case 'wald':
      case 'herbst':
        var herbst = typ === 'herbst';
        g.fillStyle = verlauf(g, 0, 0, 0, h, herbst ? [[0, '#f2d6a0'], [1, '#e8a05a']] : [[0, '#cfe8b0'], [1, '#6f9f4a']]); g.fillRect(0, 0, w, h);
        for (var b = 0; b < 12; b++) laubbaum(g, r() * w, h * (0.6 + r() * 0.15), m * (0.35 + r() * 0.25),
          herbst ? ['#e0742c', '#c94a24', '#f2b23a', '#a85a2a'][b % 4] : ['#4f8f3a', '#3a7a30', '#6aa84a'][b % 3]);
        huegel(g, w, h, h * 0.78, h * 0.02, herbst ? '#b5652a' : '#4a7a30', r);
        if (herbst) for (var bl = 0; bl < 60; bl++) {
          g.fillStyle = ['#e0742c', '#f2b23a', '#c94a24'][bl % 3];
          g.beginPath(); g.ellipse(r() * w, r() * h, m * 0.012, m * 0.006, r() * 3, 0, 6.29); g.fill();
        }
        familie(g, fx, boden, fig, r, false, false);
        if (herbst && r() > 0.3) {
          g.fillStyle = '#f08a24';
          g.beginPath(); g.ellipse(w * 0.82, boden - m * 0.05, m * 0.08, m * 0.06, 0, 0, 6.29); g.fill();
          g.fillStyle = '#4a7a30'; g.fillRect(w * 0.815, boden - m * 0.13, m * 0.015, m * 0.03);
        }
        break;
      case 'feld':
        g.fillStyle = verlauf(g, 0, 0, 0, h, [[0, '#5aa8e8'], [1, '#d8eefa']]); g.fillRect(0, 0, w, h);
        huegel(g, w, h, h * 0.62, h * 0.04, '#d9b84a', r, 0.4);
        huegel(g, w, h, h * 0.74, h * 0.03, '#c4a03a', r, 0.4);
        g.strokeStyle = 'rgba(40,40,40,0.5)'; g.lineWidth = Math.max(1, m / 400);
        var dx = w * (0.55 + r() * 0.3), dy = h * 0.18;
        g.beginPath(); g.moveTo(fx, boden - fig * 0.6); g.quadraticCurveTo(dx - w * 0.2, h * 0.5, dx, dy + m * 0.08); g.stroke();
        g.fillStyle = '#e94b3c';
        g.beginPath(); g.moveTo(dx, dy); g.lineTo(dx + m * 0.06, dy + m * 0.08); g.lineTo(dx, dy + m * 0.16); g.lineTo(dx - m * 0.06, dy + m * 0.08); g.closePath(); g.fill();
        g.fillStyle = '#f2c400';
        g.beginPath(); g.moveTo(dx, dy); g.lineTo(dx + m * 0.06, dy + m * 0.08); g.lineTo(dx, dy + m * 0.08); g.closePath(); g.fill();
        familie(g, fx, boden, fig, r, false, false);
        break;
      default: // 'nacht', 'markt'
        g.fillStyle = verlauf(g, 0, 0, 0, h, [[0, '#0b1430'], [0.7, '#1c2450'], [1, '#2a1f3a']]); g.fillRect(0, 0, w, h);
        bokeh(g, w, h, r, typ === 'markt' ? 60 : 40,
          ['rgba(255,200,110,0.9)', 'rgba(255,150,90,0.8)', 'rgba(140,220,190,0.7)', 'rgba(160,170,255,0.7)', 'rgba(255,120,170,0.7)'], m * 0.07);
        if (typ === 'markt') {
          for (var bu = 0; bu < 3; bu++) {
            var bx = w * (0.05 + bu * 0.33), bw2 = w * 0.28;
            g.fillStyle = '#5a3420'; g.fillRect(bx, h * 0.55, bw2, h * 0.2);
            g.fillStyle = '#c0392b';
            g.beginPath(); g.moveTo(bx - 6, h * 0.56); g.lineTo(bx + bw2 / 2, h * 0.44); g.lineTo(bx + bw2 + 6, h * 0.56); g.closePath(); g.fill();
            g.fillStyle = 'rgba(255,210,130,0.85)'; g.fillRect(bx + bw2 * 0.1, h * 0.58, bw2 * 0.8, h * 0.06);
          }
        } else {
          for (var t2 = 0; t2 < 5; t2++) tanne(g, r() * w, h * 0.8, m * (0.3 + r() * 0.2), '#12301f', false);
          lichterkette(g, w, h * 0.3, r, h * 0.06);
        }
        g.fillStyle = '#141828'; g.fillRect(0, h * 0.8, w, h * 0.2);
        familie(g, fx, boden, fig, r, true, true);
        if (typ === 'nacht') {
          var lx = fx + fig * 0.3, ly = boden - fig * 0.95;
          var lv = g.createRadialGradient(lx, ly, 0, lx, ly, m * 0.12);
          lv.addColorStop(0, 'rgba(255,220,140,0.95)'); lv.addColorStop(1, 'rgba(255,180,80,0)');
          g.fillStyle = lv; g.beginPath(); g.arc(lx, ly, m * 0.12, 0, 6.29); g.fill();
          g.fillStyle = '#ffcf6a'; g.beginPath(); g.arc(lx, ly, m * 0.025, 0, 6.29); g.fill();
        }
        flocken(g, w, h, r, 40);
        break;
    }
    // Foto-Anmutung: Vignette
    var vg = g.createRadialGradient(w / 2, h / 2, m * 0.35, w / 2, h / 2, m * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
    return c;
  }

  // Collage-Raster (Einheiten 0..1), angelehnt an die 2025er-Collagen (Platzhalter immer quadratisch)
  var RASTER_Q = [
    [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .5, .5], [.5, .5, .5, .5]],
    [[0, 0, .333, .333], [.333, 0, .334, .27], [.667, 0, .333, .333], [0, .333, .333, .334], [.333, .27, .334, .25],
      [.667, .333, .333, .3], [.333, .52, .334, .25], [0, .667, .333, .333], [.333, .77, .334, .23], [.667, .633, .333, .367]],
    [[0, 0, .667, .667], [.667, 0, .333, .333], [.667, .333, .333, .334], [0, .667, .333, .333], [.333, .667, .334, .333], [.667, .667, .333, .333]],
    [[0, 0, .5, .62], [.5, 0, .5, .38], [.5, .38, .5, .62], [0, .62, .5, .38]]
  ];
  function szenenTyp(tag, idx) {
    var basis = SZENE[tag] || 'innen';
    if (idx % 4 === 3 && tag > 1) return SZENE[tag - 1] || basis;
    return basis;
  }

  // dezente Beschriftung „Foto folgt“
  // anteil: Schriftgröße relativ zur Bildkante (Collage klein, Vorschau größer, damit es lesbar bleibt)
  function beschriften(g, w, h, anteil) {
    var m = Math.min(w, h), fs = Math.max(11, Math.round(m * (anteil || 0.038)));
    g.font = '600 ' + fs + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
    var text = 'Foto folgt', tw = g.measureText(text).width;
    var ph = Math.round(fs * 1.9), pw = Math.round(tw + fs * 1.7);
    var x = Math.round((w - pw) / 2), y = Math.round(h - ph - m * 0.05);
    g.fillStyle = 'rgba(14,18,26,0.55)';
    rundRechteck(g, x, y, pw, ph, ph / 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, y + ph / 2 + fs * 0.05);
  }

  var cache = {};
  var PLATZ = 1000; // Kantenlänge der Platzhalter-Collage

  function platzhalterBild(tag) {
    var t = ganzzahl(tag);
    if (!(t >= 1 && t <= 24)) t = 1;
    var key = 'b' + t;
    if (cache[key]) return cache[key];
    try {
      var W = PLATZ, H = PLATZ, rand = 6, raster = RASTER_Q[t % RASTER_Q.length];
      var c = canvas(W, H), g = c.getContext('2d');
      g.fillStyle = '#16181c'; g.fillRect(0, 0, W, H);
      for (var i = 0; i < raster.length; i++) {
        var q = raster[i];
        var x = Math.round(q[0] * W) + rand / 2, y = Math.round(q[1] * H) + rand / 2;
        var w = Math.round(q[2] * W) - rand, h = Math.round(q[3] * H) - rand;
        g.drawImage(szene(szenenTyp(t, i), w, h, t * 101 + i * 7), x, y);
      }
      beschriften(g, W, H);
      cache[key] = c.toDataURL('image/jpeg', 0.84);
    } catch (e) { cache[key] = leer(); }
    return cache[key];
  }

  function platzhalterVorschau(tag, px) {
    var t = ganzzahl(tag);
    if (!(t >= 1 && t <= 24)) t = 1;
    px = Math.max(16, Math.min(960, ganzzahl(px) || 320));
    var key = 'v' + t + '_' + px;
    if (cache[key]) return cache[key];
    try {
      var c = szene(SZENE[t], px, px, t * 101);
      if (px >= 120) beschriften(c.getContext('2d'), px, px, 0.075);
      cache[key] = c.toDataURL('image/jpeg', 0.86);
    } catch (e) { cache[key] = leer(); }
    return cache[key];
  }

  // Neutraler Platzhalter für gesperrte Tage: warmes Leuchten auf Nachtblau, kleiner Stern, für alle Tage gleich
  function neutral(px) {
    px = Math.max(16, Math.min(1000, ganzzahl(px) || 320));
    var key = 'n' + px;
    if (cache[key]) return cache[key];
    try {
      var c = canvas(px, px), g = c.getContext('2d'), r = rng(2026);
      g.fillStyle = verlauf(g, 0, 0, 0, px, [[0, '#2c3a55'], [1, '#1a2236']]); g.fillRect(0, 0, px, px);
      var v = g.createRadialGradient(px / 2, px * 0.46, 0, px / 2, px * 0.46, px * 0.62);
      v.addColorStop(0, 'rgba(244,195,90,0.30)'); v.addColorStop(1, 'rgba(244,195,90,0)');
      g.fillStyle = v; g.fillRect(0, 0, px, px);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      for (var i = 0; i < 26; i++) {
        g.globalAlpha = 0.25 + r() * 0.5;
        g.beginPath(); g.arc(r() * px, r() * px, Math.max(0.6, px / 260) * (0.6 + r()), 0, 6.29); g.fill();
      }
      g.globalAlpha = 1;
      if (px >= 48) { // Stern
        var cx = px / 2, cy = px * 0.46, ra = px * 0.085, ri = ra * 0.42;
        g.beginPath();
        for (var k = 0; k < 10; k++) {
          var w = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? ri : ra;
          g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(w) * rr, cy + Math.sin(w) * rr);
        }
        g.closePath();
        g.fillStyle = 'rgba(255,226,150,0.85)'; g.fill();
      }
      cache[key] = c.toDataURL('image/jpeg', 0.8);
    } catch (e) { cache[key] = leer(); }
    return cache[key];
  }

  // Notnagel, falls Canvas nicht geht: 1×1-GIF in Nachtblau
  function leer() { return 'data:image/gif;base64,R0lGODlhAQABAIAAACw6VQAAACwAAAAAAQABAAACAkQBADs='; }

  // ======================================================================================
  // Öffentliche Funktionen
  // ======================================================================================
  function bild(tag) {
    var t = ganzzahl(tag), d = mitBild(t);
    if (d) {
      var u = urlBauen(BILD_URL, t, grossG(), 0, d);
      if (u) { merken(u, { t: t, art: 'bild' }); vorladen(u); return u; }
    }
    return freigegeben(t) ? platzhalterBild(t) : neutral(800);
  }

  function vorschau(tag, px) {
    var t = ganzzahl(tag), groesse = ganzzahl(px) || 320, d = mitBild(t);
    if (d) {
      var u = urlBauen(BILD_URL, t, groesse <= 480 ? 'k' : 'q', 0, d);
      if (u) return merken(u, { t: t, art: 'vorschau', px: groesse });
    }
    return freigegeben(t) ? platzhalterVorschau(t, groesse) : neutral(groesse);
  }

  function einzelbilder(tag) {
    var t = ganzzahl(tag), d = freieDaten(t), n = einzelAnzahl(d), r = [];
    if (d && n && EINZEL_URL) {
      var g = grossG();
      for (var i = 1; i <= n; i++) {
        var u = urlBauen(EINZEL_URL, t, g, i, d);
        if (u) r.push(merken(u, { t: t, art: 'einzel' }));
      }
      if (r.length) { vorladen(r[0]); return r; }
    }
    return [bild(t)];
  }

  function format(tag) {
    var d = mitBild(ganzzahl(tag)), w = d ? +d.w : 0, h = d ? +d.h : 0;
    if (d && (d.format === 'hoch' || d.format === 'quadrat')) return d.format;
    return (w > 0 && h > 0 && h / w > 1.22) ? 'hoch' : 'quadrat';
  }

  function masse(tag) {
    var d = mitBild(ganzzahl(tag)), w = d ? +d.w : 0, h = d ? +d.h : 0;
    return (w > 0 && h > 0) ? { w: w, h: h } : { w: PLATZ, h: PLATZ };
  }

  function titel(tag) {
    var d = freieDaten(ganzzahl(tag));
    return (d && typeof d.titel === 'string') ? d.titel : '';
  }

  function farbe(tag) {
    var t = ganzzahl(tag), d = freieDaten(t);
    if (d && typeof d.farbe === 'string' && /^#[0-9a-f]{6}$/i.test(d.farbe)) return d.farbe;
    return FARBE[SZENE[t]] || '#f4c35a';
  }

  function ersatzFuer(info) {
    if (!info) return platzhalterBild(1);
    return info.art === 'vorschau' ? platzhalterVorschau(info.t, info.px) : platzhalterBild(info.t);
  }

  function laden(u, tag) {
    var info = bekannt[absolut(u)] || (tag ? { t: ganzzahl(tag), art: 'bild' } : null);
    return new Promise(function (ok) {
      var im = new Image();
      im.decoding = 'async';
      im.onload = function () {
        if (im.decode) im.decode().then(function () { ok(im); }, function () { ok(im); });
        else ok(im);
      };
      im.onerror = function () {
        if (/^data:/.test(u)) { ok(im); return; }
        var p = new Image();
        p.onload = p.onerror = function () { ok(p); };
        p.setAttribute('data-platzhalter', '1');
        p.src = ersatzFuer(info);
      };
      im.src = u;
    });
  }

  // Ladefehler bei <img> mit unseren URLs → Platzhalter statt kaputtem Bild
  window.addEventListener('error', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'IMG' || el.hasAttribute('data-kein-ersatz')) return;
    var info = bekannt[el.src];
    if (!info) return;
    el.setAttribute('data-platzhalter', '1');
    el.src = ersatzFuer(info);
  }, true);

  window.Fotos = {
    bild: bild,
    format: format,
    vorschau: vorschau,
    einzelbilder: einzelbilder,
    titel: titel,
    farbe: farbe,
    hatBild: function (tag) { return !!mitBild(ganzzahl(tag)); },
    masse: masse,
    platzhalter: function (tag, px) { return px ? platzhalterVorschau(tag, px) : platzhalterBild(tag); },
    istPlatzhalter: function (u) { return typeof u === 'string' && u.indexOf('data:') === 0; },
    laden: laden
  };
})();
