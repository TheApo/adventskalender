/*
 * Dein Adventskalender – Baustein „Kalender“ (shared/kalender.js)
 *
 * Datum, gemeinsamer Speicher aller Ansichten und das Menü hinter der Schneeflocke (fest unten links).
 * Die Einstellungen kommen aus window.ADVENTSKALENDER – gesetzt vom Lader (index.html des eigenen Kalenders)
 * bzw. in der Demo von shared/start.js. Fehlt es (Ansicht direkt geöffnet), erscheint ein Hinweis und alles bleibt zu.
 *  - Gemeinsamer Speicher aller Ansichten unter ADVENTSKALENDER.speicher (z. B. 'adventskalender:2026'). Solange
 *    ein Testdatum aktiv ist, wird getrennt unter '<speicher>:test' gemerkt – Testläufe verfälschen nie den echten Stand.
 *  - Menü: Ansicht wechseln (bei mehr als einer Ansicht); im Testmodus zusätzlich Testdatum (Cookie
 *    adventskalender_testtag + Neuladen), „Alle wieder zu“, „Bis gestern öffnen“, „Echtes Datum“.
 *  - Bleibt die Seite über Mitternacht offen, lädt sie beim Zurückkehren neu.
 *
 * API (window.Kalender):
 *   init(id)                 Pflicht, einmal aufrufen (id = Name der Variante, z. B. 'tueren'); gibt Kalender zurück
 *   heute()                  0..25 (0 = vor Dezember, alles zu; 1..24 = Dezembertag; 25 = ab 25.12., alles offen)
 *   darfOeffnen(tag)         true, wenn der Tag schon dran ist
 *   istGeoeffnet(tag)        vom Nutzer bereits geöffnet (gemerkt, gemeinsam für alle Varianten)
 *   oeffne(tag)              als geöffnet merken (gibt false zurück, wenn gesperrt)
 *   geoeffnet()              Array der geöffneten Tage
 *   sperrText(tag)           kindgerechter Hinweis, z. B. "Noch 3× schlafen!"
 *   datumText(tag)           "Dienstag, 1. Dezember"
 *   wochentag(tag)           "Dienstag"
 *   istSonntag(tag)          true für Sonntage im Dezember (2026: 6., 13., 20.)
 *   adventsSonntag(tag)      1..4 (welcher Advent ist an diesem Tag der letzte)
 *   reihenfolge()            feste, gemischte Anordnung der Tage 1..24 (wie ein echter Adventskalender)
 *   zuruecksetzen()          alle Tage wieder zu (auch vergangene) + onChange auslösen
 *   onChange(fn)             fn(heute) bei neuem (Test-)Datum, Reset oder Änderung aus einem anderen Tab
 *   bewegungReduziert        true bei prefers-reduced-motion
 *   JAHR                     Kalenderjahr (aus ADVENTSKALENDER.jahr, sonst 2026)
 * Zusätzlich (nur lesend, neu):
 *   testmodus                true, wenn der Server Testwerkzeuge erlaubt
 *   echtHeute()              heute ohne Testdatum (0..25)
 *
 * Menü-Knopf: sitzt in ALLEN Varianten fest unten links (12 px vom Rand, Safe-Area beachtet) und wandert nicht –
 * die Position wird als Inline-Stil mit !important gesetzt, Varianten können sie nicht verschieben.
 * Varianten halten die Ecke unten links frei: Fläche --menue-knopf-zone (64 px × 64 px ab der Ecke, zzgl.
 * Safe-Area) – feste Leisten unten dort einrücken, am Seitenende genug Abstand lassen.
 * Ausblenden z. B. während der Bildansicht weiterhin mit  #kalender-reset { display: none; }
 * Nach „Alle wieder zu“ im Menü wird zusätzlich {kalender:'reset'} an window gemeldet (für Varianten mit
 * eigenem Zusatzspeicher, z. B. Herzen in den Stories).
 * Optional (nur die Werbeversion setzt sie; fehlen sie, bleibt das Menü exakt wie bisher):
 *   ADVENTSKALENDER.startUrl / startText   zusätzlicher Link im Menü (z. B. '../index.html', „Zur Startseite“)
 *   ADVENTSKALENDER.testTitel / testHinweis  eigene Überschrift und Hinweis für den Testbereich (statt „Testmodus“)
 *   ADVENTSKALENDER.fusszeile { text, url, link }  dezente Zeile ganz unten im Menü: „text · <a href=url>link</a>“
 *                                     (nur die öffentliche Version setzt sie; link fehlt → url ohne https://)
 * Mit nur einer Ansicht in ADVENTSKALENDER.varianten entfällt der Bereich „Ansicht wählen“ im Menü.
 */
(function () {
  'use strict';

  var TAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September',
    'Oktober', 'November', 'Dezember'];
  // Feste "durcheinander"-Reihenfolge wie bei einem echten Adventskalender.
  // Identisch mit der Handy-Anordnung des Kalenders 2025 (3 Spalten, zeilenweise gelesen).
  var REIHENFOLGE = [23, 20, 12, 2, 14, 4, 5, 22, 16, 1, 7, 9, 10, 11, 18, 13, 3, 15, 6, 17, 8, 19, 24, 21];
  var STANDARD_VARIANTEN = [
    { id: 'tueren', name: 'Türchenwand' }, { id: 'girlande', name: 'Kugel-Girlanden' },
    { id: 'kranz', name: 'Lichterkranz' }, { id: 'rubbellos', name: 'Weihnachtslotterie' },
    { id: 'fotoleine', name: 'Fotoleine' }, { id: 'stories', name: 'Advent-Stories' },
    { id: 'schneekugel', name: 'Schneekugel' }, { id: 'baum', name: 'Drehbaum' },
    { id: 'geschenk', name: 'Geschenke auspacken' }, { id: 'nuss', name: 'Nussknacker' },
    { id: 'sterne', name: 'Sternbilder' }, { id: 'schneemann', name: 'Schneefiguren bauen' }
  ];
  var COOKIE_TESTTAG = 'adventskalender_testtag';
  var ZEITZONE = 'Europe/Berlin';

  function ganzzahl(x) {
    var n = typeof x === 'number' ? x : parseInt(x, 10);
    return isFinite(n) ? Math.round(n) : NaN;
  }
  function klemmen(x) {
    var n = ganzzahl(x);
    return isNaN(n) ? 0 : Math.max(0, Math.min(25, n));
  }

  // ---------- Daten vom Server ----------
  var M = (window.ADVENTSKALENDER && typeof window.ADVENTSKALENDER === 'object') ? window.ADVENTSKALENDER : null;
  var OHNE_DATEN = !M;
  var JAHR = (M && ganzzahl(M.jahr) > 2000) ? ganzzahl(M.jahr) : 2026;
  var TESTMODUS = !!(M && M.testmodus === true);
  var STATISCH = !!(M && M.modus === 'statisch');
  var SERVER_HEUTE = M ? klemmen(M.heute) : 0;
  var ECHT_HEUTE = (M && M.echtHeute !== undefined && M.echtHeute !== null) ? klemmen(M.echtHeute) : SERVER_HEUTE;
  var TITEL = (M && typeof M.titel === 'string' && M.titel) ? M.titel : 'Dein Adventskalender';
  var VARIANTEN = (M && M.varianten && M.varianten.length) ? M.varianten : STANDARD_VARIANTEN;
  // Ohne Server liegen die Varianten-Dateien nebeneinander (varianten/<id>.html)
  var WECHSEL_URL = (M && typeof M.wechselUrl === 'string' && M.wechselUrl.indexOf('{id}') >= 0) ? M.wechselUrl
    : (OHNE_DATEN ? '{id}.html' : '?v={id}');
  // Optionale Zusätze (Werbeversion): Link zur Startseite, freundlichere Texte im Testbereich
  function textFeld(name) { return (M && typeof M[name] === 'string' && M[name]) ? M[name] : ''; }
  var START_URL = textFeld('startUrl');
  var START_TEXT = textFeld('startText') || 'Zur Startseite';
  var TEST_TITEL = textFeld('testTitel') || 'Testmodus';
  var TEST_HINWEIS = textFeld('testHinweis');
  // Optional (öffentliche Version): Fußzeile im Menü; ohne das Feld bleibt das Menü wie bisher
  var FUSS = (M && M.fusszeile && typeof M.fusszeile === 'object' && typeof M.fusszeile.text === 'string' && M.fusszeile.text) ? M.fusszeile : null;
  var FUSS_URL = (FUSS && typeof FUSS.url === 'string' && /^https?:\/\//.test(FUSS.url)) ? FUSS.url : '';
  // Nur eine Ansicht (z. B. eigener Kalender mit genau einer Ansicht): kein Bereich „Ansicht wählen“
  var MEHRERE = VARIANTEN.length > 1;

  function cookieLesen(name) {
    try {
      var teile = document.cookie ? document.cookie.split(';') : [];
      for (var i = 0; i < teile.length; i++) {
        var p = teile[i].replace(/^\s+/, '');
        if (p.indexOf(name + '=') === 0) return decodeURIComponent(p.slice(name.length + 1));
      }
    } catch (e) { /* Cookies gesperrt */ }
    return null;
  }
  function testtagGesetzt() {
    var w = cookieLesen(COOKIE_TESTTAG);
    if (w === null || !/^\d{1,2}$/.test(w)) return null;
    var n = parseInt(w, 10);
    return n <= 25 ? n : null;
  }
  var TESTTAG = TESTMODUS ? testtagGesetzt() : null;
  // Statische Version: der Lader kann das Testdatum auch aus dem localStorage nehmen → heute ≠ echtHeute
  var TESTDATUM_AKTIV = TESTMODUS && (TESTTAG !== null || SERVER_HEUTE !== ECHT_HEUTE);

  function ausHash() {
    var m = /tag-(\d{1,2})/.exec(window.location.hash || '');
    return m ? klemmen(m[1]) : null;
  }

  var id = 'demo';
  var heuteWert = SERVER_HEUTE;
  var hashGenutzt = false;
  if (TESTMODUS) { var hashTag = ausHash(); if (hashTag !== null) { heuteWert = hashTag; hashGenutzt = true; } }
  var hoerer = [];

  // ---------- Speicher (gemeinsam für alle Varianten) ----------
  // Echter Stand unter <speicher>; sobald irgendein Testwerkzeug benutzt wird (Testdatum-Cookie, #tag-N,
  // postMessage 'tag'/'reset'/'vorbelegen'), wird ausschließlich unter <speicher>:test gelesen und geschrieben.
  var SPEICHER_BASIS = (M && typeof M.speicher === 'string' && M.speicher) ? M.speicher : 'adventskalender:' + JAHR;
  var TEST_SCHLUESSEL = SPEICHER_BASIS + ':test';
  var SCHLUESSEL = (TESTDATUM_AKTIV || hashGenutzt) ? TEST_SCHLUESSEL : SPEICHER_BASIS;

  function laden() {
    var r = {};
    try {
      var roh = window.localStorage.getItem(SCHLUESSEL);
      var o = roh ? JSON.parse(roh) : null;
      if (o && typeof o === 'object') for (var t = 1; t <= 24; t++) if (o[t]) r[t] = 1;
    } catch (e) { /* localStorage evtl. gesperrt (privater Modus) – dann nur für diese Sitzung */ }
    return r;
  }
  function sichern() {
    try { window.localStorage.setItem(SCHLUESSEL, JSON.stringify(speicher)); } catch (e) { /* egal */ }
  }
  var speicher = laden();

  // Ab jetzt nur noch den Test-Speicher benutzen (Datum per #tag-N oder postMessage verstellt).
  function testSpeicherNutzen() {
    if (SCHLUESSEL === TEST_SCHLUESSEL) return;
    SCHLUESSEL = TEST_SCHLUESSEL;
    speicher = laden();
  }

  function melden() {
    punktAktualisieren();
    for (var i = 0; i < hoerer.length; i++) {
      try { hoerer[i](heuteWert); } catch (e) { if (window.console) console.error(e); }
    }
  }

  function bisGesternOeffnen() {
    speicher = {};
    var bis = heuteWert >= 25 ? 24 : heuteWert - 1;
    for (var t = 1; t <= bis; t++) speicher[t] = 1;
    sichern();
    return Math.max(0, bis);
  }

  function vorbelegen() { // wie im Prototyp (nur für die Test-Nachricht 'vorbelegen'): 1..heute-2
    speicher = {};
    var bis = heuteWert >= 25 ? 24 : heuteWert - 2;
    for (var t = 1; t <= bis; t++) speicher[t] = 1;
    sichern();
  }

  // 4. Advent = Sonntag zwischen 18. und 24. Dezember; die anderen jeweils 7 Tage davor
  var ADVENT4 = 24 - new Date(JAHR, 11, 24).getDay();

  var K = {
    JAHR: JAHR,
    testmodus: TESTMODUS,
    bewegungReduziert: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),

    init: function (variantenId) {
      id = variantenId || (M && M.variante) || 'demo';
      if (!oberflaecheGeplant) {
        oberflaecheGeplant = true;
        if (document.body) oberflaecheEinbauen();
        else document.addEventListener('DOMContentLoaded', oberflaecheEinbauen);
      }
      return K;
    },
    zuruecksetzen: function () { speicher = {}; sichern(); melden(); },
    heute: function () { return heuteWert; },
    echtHeute: function () { return ECHT_HEUTE; },
    darfOeffnen: function (tag) { return heuteWert >= 25 || tag <= heuteWert; },
    istGeoeffnet: function (tag) { return !!speicher[tag] && K.darfOeffnen(tag); },
    oeffne: function (tag) {
      if (!K.darfOeffnen(tag)) return false;
      tag = ganzzahl(tag);
      if (tag >= 1 && tag <= 24 && !speicher[tag]) { speicher[tag] = 1; sichern(); }
      return true;
    },
    geoeffnet: function () {
      var r = [];
      for (var t = 1; t <= 24; t++) if (K.istGeoeffnet(t)) r.push(t);
      return r;
    },
    sperrText: function (tag) {
      if (heuteWert === 0) return tag === 1 ? 'Ab 1. Dezember geht’s los!' : 'Noch ist November – Geduld!';
      var diff = tag - heuteWert;
      if (diff <= 0) return '';
      if (diff === 1) return 'Morgen ist es so weit!';
      return 'Noch ' + diff + '× schlafen!';
    },
    wochentag: function (tag) { return TAGE[new Date(JAHR, 11, tag).getDay()]; },
    datumText: function (tag) { return K.wochentag(tag) + ', ' + tag + '. Dezember'; },
    istSonntag: function (tag) { return new Date(JAHR, 11, tag).getDay() === 0; },
    adventsSonntag: function (tag) {
      // 2026: 1. Advent = 29. November; danach 6., 13., 20. Dezember
      if (tag >= ADVENT4) return 4;
      if (tag >= ADVENT4 - 7) return 3;
      if (tag >= ADVENT4 - 14) return 2;
      return 1;
    },
    reihenfolge: function () { return REIHENFOLGE.slice(); },
    onChange: function (fn) { if (typeof fn === 'function') hoerer.push(fn); },
    _setze: function (n) { testSpeicherNutzen(); heuteWert = klemmen(n); melden(); }
  };

  // ---------- Test-Steuerung (nur im Testmodus) ----------
  if (TESTMODUS) {
    window.addEventListener('hashchange', function () {
      var h = ausHash();
      if (h !== null && h !== heuteWert) K._setze(h);
    });
    window.addEventListener('message', function (ev) {
      var d = ev && ev.data;
      if (!d || typeof d !== 'object' || !d.kalender || d.ausMenue) return;
      if (d.kalender === 'tag' && typeof d.tag === 'number') K._setze(d.tag);
      else if (d.kalender === 'reset') { testSpeicherNutzen(); K.zuruecksetzen(); }
      else if (d.kalender === 'vorbelegen') { testSpeicherNutzen(); vorbelegen(); melden(); }
    });
  }

  // Änderungen aus einem anderen Tab (z. B. andere Variante) übernehmen
  window.addEventListener('storage', function (e) {
    if (e.key !== SCHLUESSEL) return;
    speicher = laden();
    melden();
  });

  // ---------- Neuer Tag, während die Seite offen ist → neu laden ----------
  function datumJetzt() {
    try {
      return new Intl.DateTimeFormat('de-DE', { timeZone: ZEITZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (e) {
      var d = new Date();
      return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
    }
  }
  var LADE_DATUM = datumJetzt();
  function neuLaden() {
    var ohneHash = window.location.href.replace(/#.*$/, '');
    if (ohneHash === window.location.href) window.location.reload();
    else window.location.replace(ohneHash);
  }
  function datumPruefen() {
    if (OHNE_DATEN || TESTDATUM_AKTIV || SCHLUESSEL === TEST_SCHLUESSEL || ECHT_HEUTE >= 25) return;
    if (document.visibilityState && document.visibilityState !== 'visible') return;
    if (datumJetzt() !== LADE_DATUM) neuLaden();
  }
  document.addEventListener('visibilitychange', datumPruefen);
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    // aus dem Zurück-Cache: Stand könnte sich in einer anderen Variante geändert haben
    var vorher = JSON.stringify(speicher);
    speicher = laden();
    if (JSON.stringify(speicher) !== vorher) melden();
    datumPruefen();
  });
  setInterval(datumPruefen, 5 * 60 * 1000);

  // ======================================================================================
  // Oberfläche: Menü-Knopf, Menü-Panel, Hinweis ohne Daten
  // ======================================================================================
  var oberflaecheGeplant = false;
  var menue = null;

  function svg(inhalt, klasse) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"' + (klasse ? ' class="' + klasse + '"' : '') + '>' + inhalt + '</svg>';
  }
  var ICON = {
    flocke: '<path d="M12 2.5v19M3.77 7.25l16.46 9.5M3.77 16.75l16.46-9.5"/>' +
      '<path d="M9.4 3.4 12 6l2.6-2.6M9.4 20.6 12 18l2.6 2.6M18.15 5.45 17.2 9l3.55.95M20.75 14.05 17.2 15l.95 3.55M3.25 14.05 6.8 15l-.95 3.55M5.85 5.45 6.8 9l-3.55.95"/>',
    zu: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    links: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    rechts: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
    haken: '<path d="M5.5 12.5l4 4L18.5 7.5"/>',
    tueren: '<rect x="5.5" y="3" width="13" height="18" rx="1.6"/><path d="M8.5 6h7v12h-7z"/><path d="M13.2 12.2v.1"/>',
    girlande: '<path d="M2.5 5.5c5 4.6 14 4.6 19 0"/><circle cx="8" cy="13.6" r="2.7"/><circle cx="16" cy="13.6" r="2.7"/><path d="M8 9v1.9M16 9v1.9"/>',
    kranz: '<circle cx="12" cy="14.5" r="6"/><path d="M12 8.5V6.4"/><path d="M12 2.4c1 1.1 1.1 2 0 2.7-1.1-.7-1-1.6 0-2.7z"/>',
    rubbellos: '<path d="M3.5 7h17v3.2a1.8 1.8 0 0 0 0 3.6V17h-17v-3.2a1.8 1.8 0 0 0 0-3.6z"/><path d="M14.5 8.2v1.4M14.5 11.3v1.4M14.5 14.4v1.4"/>',
    fotoleine: '<path d="M2.5 4.8c6 3.2 13 3.2 19 0"/><path d="M5 8.6l5.6-.7.9 7.2-5.6.7z"/><path d="M13.3 7.9l5.6.6-.8 7.2-5.6-.6z"/>',
    stories: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="11.2 2.15"/><circle cx="12" cy="12" r="4.4"/>',
    schneekugel: '<circle cx="12" cy="10.2" r="6.8"/><path d="M6.8 21h10.4l-1.5-4.1H8.3z"/><path d="M9.6 8.4v.1M13.9 7.4v.1M12.2 11.6v.1M15.2 11v.1M9.4 12.4v.1"/>',
    baum: '<path d="M12 2.8 7 9.4h2.6l-4 5.4h3.5L5 20h14l-4.1-5.2h3.5l-4-5.4H17z"/><path d="M12 20v2"/>',
    geschenk: '<path d="M3.5 8.5h17V12h-17z"/><path d="M5 12v8.5h14V12M12 8.5v12"/><path d="M12 8.5c-1.6-3.6-5-4-5-1.9 0 1.6 3.2 1.9 5 1.9 1.8 0 5-.3 5-1.9 0-2.1-3.4-1.7-5 1.9z"/>',
    nuss: '<path d="M12 5.6c3.9 0 6.5 3.3 6.5 7.5 0 4.2-3 7.4-6.5 7.4s-6.5-3.2-6.5-7.4c0-4.2 2.6-7.5 6.5-7.5z"/><path d="M6.6 9.4c3.4-1.6 7.4-1.6 10.8 0M12 5.6V3"/>',
    sterne: '<path d="M5 17.5 9 9.5l6 3 4-6.5"/><circle cx="5" cy="17.5" r="1.2"/><circle cx="9" cy="9.5" r="1.2"/><circle cx="15" cy="12.5" r="1.2"/><circle cx="19" cy="6" r="1.2"/>',
    schneemann: '<circle cx="12" cy="16.3" r="4.9"/><circle cx="12" cy="8.2" r="3.2"/><path d="M8.8 5h6.4M10.2 5V2.4h3.6V5"/>',
    haus: '<path d="M4 11.2 12 4.5l8 6.7"/><path d="M6.5 9.5v10h11v-10"/><path d="M10.2 19.5v-5h3.6v5"/>'
  };
  var ICON_ERSATZ = '<circle cx="12" cy="12" r="7"/><path d="M12 8.5v7M8.5 12h7"/>';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function weich(name) { // weiche Trennstellen für lange Namen in schmalen Kacheln
    return esc(name).replace(/^(Weihnachts|Advents|Lichter|Schnee|Türchen|Kugel)(?=[a-zäöü]{4,})/, '$1&shy;');
  }

  function tagKurz(n) {
    if (n <= 0) return 'vor Dezember';
    if (n >= 25) return 'ab 25. Dezember';
    return n + '. Dezember';
  }
  function tagLang(n) {
    if (n <= 0) return 'vor Dezember (alles zu)';
    if (n >= 25) return 'ab 25. Dezember (alles offen)';
    return K.datumText(n);
  }
  function testEndeText() {
    var m = M && typeof M.testBis === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(M.testBis) : null;
    if (!m) return 'Ein Testdatum wird getrennt vom echten Stand gemerkt.';
    var ende = new Date(+m[1], +m[2] - 1, +m[3] + 1);
    var jetzt = new Date();
    if (jetzt.getTime() > ende.getTime()) return 'Testmodus über Testschlüssel aktiv.';
    return 'Testmodus endet automatisch am ' + ende.getDate() + '. ' + MONATE[ende.getMonth()] + '.';
  }

  var KNOPF_STIL =
    ':root{--menue-knopf-zone:64px}' +
    '#kalender-reset{position:fixed;z-index:2147483000;box-sizing:border-box;' +
    'top:auto;right:auto;bottom:max(12px,env(safe-area-inset-bottom));left:max(12px,env(safe-area-inset-left));' +
    'display:-webkit-inline-box;display:inline-flex;align-items:center;justify-content:center;' +
    'width:40px;height:40px;min-width:0;min-height:0;max-width:none;padding:0;margin:0;overflow:visible;' +
    'border-radius:50%;border:1px solid rgba(255,255,255,.42);background:rgba(16,20,28,.55);color:#fff;' +
    'font:600 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:0;text-transform:none;cursor:pointer;' +
    'opacity:.5;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;' +
    '-webkit-backdrop-filter:blur(8px) saturate(140%);backdrop-filter:blur(8px) saturate(140%);' +
    'box-shadow:0 2px 10px rgba(0,0,0,.22);transition:opacity .2s,transform .2s}' +
    '#kalender-reset::before{content:"";position:absolute;top:-4px;right:-4px;bottom:-4px;left:-4px;border-radius:50%}' +
    '#kalender-reset:hover,#kalender-reset:focus-visible,#kalender-reset[aria-expanded="true"]{opacity:1}' +
    '#kalender-reset.kr-test{opacity:.85}' +
    '#kalender-reset:focus-visible{outline:3px solid #f4c35a;outline-offset:2px}' +
    '#kalender-reset svg{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}' +
    '#kalender-reset .kr-punkt{position:absolute;top:0;right:0;width:11px;height:11px;border-radius:50%;' +
    'background:#ff7a45;box-shadow:0 0 0 2px rgba(16,20,28,.9);pointer-events:none}' +
    '#kalender-reset:not(.kr-test) .kr-punkt{display:none}' +
    '@media (prefers-reduced-motion:no-preference){#kalender-reset:active{transform:scale(.93)}}' +
    '@media print{#kalender-reset,#kalender-menue,#kalender-hinweis{display:none!important}}';

  var MENUE_STIL =
    ':host{all:initial}' +
    '*{box-sizing:border-box}' +
    '.huelle{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483600;' +
    'font:400 15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#f4f1ea;-webkit-text-size-adjust:100%;text-align:left}' +
    '.huelle[hidden]{display:none}' +
    '.schleier{position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(6,9,16,.42);opacity:0;transition:opacity .22s;touch-action:none}' +
    '.panel{position:absolute;left:0;right:0;bottom:0;max-height:calc(100% - 16px);overflow-y:auto;overscroll-behavior:contain;' +
    '-webkit-overflow-scrolling:touch;padding:10px max(16px,env(safe-area-inset-right)) calc(18px + env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));' +
    'background:rgba(22,26,36,.88);-webkit-backdrop-filter:blur(22px) saturate(150%);backdrop-filter:blur(22px) saturate(150%);' +
    'border:1px solid rgba(255,255,255,.14);border-bottom:0;border-radius:22px 22px 0 0;box-shadow:0 -12px 40px rgba(0,0,0,.35);' +
    'transform:translateY(18px);opacity:0;transition:transform .26s cubic-bezier(.2,.8,.2,1),opacity .2s;outline:none}' +
    '@supports not ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.panel{background:rgba(22,26,36,.97)}}' +
    '.offen .schleier{opacity:1}.offen .panel{transform:none;opacity:1}' +
    '.griff{width:38px;height:4px;border-radius:2px;background:rgba(255,255,255,.24);margin:0 auto 8px}' +
    '@media (min-width:600px) and (min-height:480px){' +
    '.panel{right:auto;bottom:auto;width:396px;max-height:calc(100% - 24px);padding:14px 18px 18px;border-radius:20px;' +
    'border-bottom:1px solid rgba(255,255,255,.14);box-shadow:0 18px 50px rgba(0,0,0,.42);transform:translateY(8px) scale(.98)}' +
    '.griff{display:none}}' +
    '@media (prefers-reduced-motion:reduce){.panel,.schleier{transition:none}.panel{transform:none}}' +
    'button,a{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent}' +
    'button{margin:0;cursor:pointer;-webkit-appearance:none;appearance:none}' +
    'svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;flex:none;pointer-events:none}' +
    ':focus{outline:none}' +
    ':focus-visible{outline:3px solid #f4c35a;outline-offset:2px}' +
    '.kopf{display:flex;align-items:center;margin:0 0 14px}' +
    '.kopf-icon{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;margin-right:10px;flex:none;color:#f4c35a}' +
    '.kopf-icon svg{width:18px;height:18px}' +
    'h2{margin:0;flex:1;min-width:0;font-size:15px;font-weight:650;line-height:1.25}' +
    '.zu{width:44px;height:44px;margin:-6px -8px -6px 6px;border:0;border-radius:50%;background:transparent;display:flex;align-items:center;justify-content:center;flex:none}' +
    '.zu:hover{background:rgba(255,255,255,.1)}' +
    'h3{display:flex;align-items:center;margin:0 0 8px;font-size:13px;font-weight:600;line-height:1.3;color:rgba(244,241,234,.68)}' +
    '.marke{margin-left:8px;padding:2px 8px;border-radius:999px;background:rgba(255,122,69,.2);color:#ffb08f;font-size:11.5px;font-weight:600}' +
    '.varianten{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(146px,1fr));grid-gap:8px}' +
    '.v{display:flex;align-items:center;min-height:52px;height:100%;padding:8px 8px 8px 8px;border-radius:14px;background:rgba(255,255,255,.06);' +
    'border:1px solid rgba(255,255,255,.08);text-decoration:none;font-size:14px;font-weight:550;line-height:1.2;transition:background .15s,border-color .15s}' +
    '.v:hover{background:rgba(255,255,255,.12)}' +
    '.v:active{background:rgba(255,255,255,.16)}' +
    '.v-icon{position:relative;width:32px;height:32px;flex:none;margin-right:9px;border-radius:10px;background:rgba(255,255,255,.09);display:flex;align-items:center;justify-content:center}' +
    '.v-name{flex:1;min-width:0;-webkit-hyphens:manual;hyphens:manual;overflow-wrap:break-word}' +
    '.v[aria-current]{background:rgba(244,195,90,.15);border-color:rgba(244,195,90,.6)}' +
    '.v[aria-current] .v-icon{background:#f4c35a;color:#2a2210}' +
    '.v-haken{display:none;position:absolute;right:-6px;bottom:-6px;width:17px;height:17px;border-radius:50%;' +
    'background:#1f2431;border:1.5px solid #f4c35a;color:#f4c35a;align-items:center;justify-content:center}' +
    '.v[aria-current] .v-haken{display:flex}' +
    '.v-haken svg{width:11px;height:11px;stroke-width:3}' +
    '.fein{margin:10px 2px 0;font-size:12.5px;line-height:1.4;color:rgba(244,241,234,.6)}' +
    '.test{margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12)}' +
    '.test .fein{margin:-2px 2px 10px}' +
    '.stepper{display:flex;align-items:center;padding:4px;border-radius:16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1)}' +
    '.schritt{width:48px;height:48px;border:0;border-radius:12px;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;flex:none}' +
    '.schritt:hover{background:rgba(255,255,255,.15)}' +
    '.schritt:disabled{opacity:.3;cursor:default}' +
    '.wert{flex:1;min-width:0;text-align:center;display:block;padding:0 6px}' +
    '.wert strong{display:block;font-size:17px;font-weight:650;line-height:1.25}' +
    '.wert small{display:block;font-size:12.5px;line-height:1.3;color:rgba(244,241,234,.62)}' +
    '.knopf{display:flex;align-items:center;justify-content:center;width:100%;min-height:44px;padding:6px 12px;border-radius:12px;' +
    'border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.09);font-size:14px;font-weight:600;line-height:1.2;text-align:center}' +
    '.knopf:hover{background:rgba(255,255,255,.15)}' +
    '.knopf:active{background:rgba(255,255,255,.2)}' +
    '.haupt{margin-top:8px;background:#f4c35a;border-color:#f4c35a;color:#231b08}' +
    '.haupt:hover{background:#f7cf74}' +
    '.reihe{display:grid;grid-template-columns:1fr 1fr;grid-gap:8px;margin-top:8px}' +
    '.leise{margin-top:8px;background:transparent}' +
    '.stand{margin:10px 2px 0;font-size:12.5px;color:rgba(244,241,234,.6)}' +
    '.status{min-height:1.4em;margin:6px 2px 0;font-size:13px;color:#ffd98a}' +
    '.status:empty{display:none}' +
    '.heim{display:flex;align-items:center;min-height:44px;margin:-4px 0 14px;padding:6px 12px;border-radius:12px;' +
    'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);text-decoration:none;font-size:14px;font-weight:600;line-height:1.2}' +
    '.heim:hover{background:rgba(255,255,255,.12)}.heim svg{margin-right:9px;color:#f4c35a}' +
    '.fuss{margin:16px 2px 0;padding-top:12px;border-top:1px solid rgba(255,255,255,.1);font-size:12px;line-height:1.45;color:rgba(244,241,234,.5);text-align:center}' +
    '.fuss a{color:rgba(244,241,234,.74);text-decoration:underline;text-underline-offset:2px;white-space:nowrap}' +
    '.fuss a:hover{color:#f4c35a}';

  var HINWEIS_STIL =
    ':host{all:initial}' +
    '.hinweis{position:fixed;z-index:2147483500;top:max(12px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);' +
    'width:calc(100% - 24px);max-width:440px;box-sizing:border-box;padding:14px 16px;border-radius:16px;' +
    'background:rgba(22,26,36,.92);color:#f4f1ea;border:1px solid rgba(255,255,255,.16);box-shadow:0 12px 36px rgba(0,0,0,.35);' +
    'font:400 14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:left}' +
    '.hinweis strong{display:block;font-size:15px;margin-bottom:4px;color:#ffd98a}' +
    '.hinweis p{margin:0}' +
    '.hinweis button{margin-top:10px;min-height:40px;padding:0 16px;border-radius:10px;border:1px solid rgba(255,255,255,.2);' +
    'background:rgba(255,255,255,.1);color:inherit;font:inherit;font-weight:600;cursor:pointer}' +
    '.hinweis button:focus-visible{outline:3px solid #f4c35a;outline-offset:2px}';

  function oberflaecheEinbauen() {
    if (document.getElementById('kalender-reset')) return;
    var stil = document.createElement('style');
    stil.id = 'kalender-reset-stil';
    stil.textContent = KNOPF_STIL;
    (document.head || document.body).appendChild(stil);
    knopfEinbauen();
    if (OHNE_DATEN) hinweisEinbauen();
  }

  function schattenWirt(id, css) {
    var wirt = document.createElement('div');
    wirt.id = id;
    wirt.setAttribute('style', 'all:initial');
    var wurzel = wirt.attachShadow ? wirt.attachShadow({ mode: 'open' }) : wirt;
    var s = document.createElement('style');
    s.textContent = css;
    wurzel.appendChild(s);
    return { wirt: wirt, wurzel: wurzel };
  }

  function hinweisEinbauen() {
    var w = schattenWirt('kalender-hinweis', HINWEIS_STIL);
    var box = document.createElement('div');
    box.className = 'hinweis';
    box.setAttribute('role', 'status');
    box.setAttribute('lang', 'de');
    box.innerHTML = '<strong>Bitte über die Startseite öffnen</strong>' +
      '<p>Diese Seite wurde direkt geöffnet – so fehlen Datum und Fotos, und alle Tage bleiben zu. ' +
      'Bitte den Kalender über <b>index.html</b> (bzw. die Startseite der Demo) aufrufen.</p>' +
      '<button type="button">Verstanden</button>';
    box.querySelector('button').addEventListener('click', function () {
      if (w.wirt.parentNode) w.wirt.parentNode.removeChild(w.wirt);
    });
    w.wurzel.appendChild(box);
    document.body.appendChild(w.wirt);
    if (window.console) console.info('Kalender: window.ADVENTSKALENDER fehlt – bitte über index.html öffnen.');
  }

  // ---------- Knopf ----------
  function testdatumAnzeigen() { return TESTDATUM_AKTIV || (TESTMODUS && heuteWert !== SERVER_HEUTE); }

  function knopfBeschriften() {
    if (!menue) return;
    var b = menue.knopf, test = testdatumAnzeigen();
    var was = MEHRERE ? 'Ansicht wechseln und Einstellungen' : 'Menü';
    var kurz = MEHRERE ? 'Ansicht & Einstellungen' : 'Menü';
    var text = was + (test ? ' (Testdatum aktiv: ' + tagKurz(heuteWert) + ')' : '');
    b.setAttribute('aria-label', text);
    b.title = test ? kurz + ' – Testdatum: ' + tagKurz(heuteWert) : kurz;
    if (test) b.classList.add('kr-test'); else b.classList.remove('kr-test');
  }
  function punktAktualisieren() { knopfBeschriften(); }

  function knopfEinbauen() {
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'kalender-reset';
    b.setAttribute('aria-haspopup', 'dialog');
    b.setAttribute('aria-expanded', 'false');
    b.innerHTML = svg(ICON.flocke) + '<span class="kr-punkt" aria-hidden="true"></span>';
    // Immer unten links, in jeder Variante gleich (Inline + !important schlägt jede Varianten-Regel).
    var lage = { position: 'fixed', top: 'auto', right: 'auto', bottom: 'max(12px, env(safe-area-inset-bottom))',
      left: 'max(12px, env(safe-area-inset-left))', margin: '0', 'z-index': '2147483000' };
    for (var k in lage) b.style.setProperty(k, lage[k], 'important');
    document.body.appendChild(b);
    menue = { knopf: b, offen: false };
    knopfBeschriften();
    b.addEventListener('click', function (e) {
      e.preventDefault();
      if (menue.offen) menueSchliessen(); else menueOeffnen();
    });
  }

  // ---------- Panel ----------
  function panelBauen() {
    var w = schattenWirt('kalender-menue', MENUE_STIL);
    menue.wirt = w.wirt;
    menue.wurzel = w.wurzel;
    var huelle = document.createElement('div');
    huelle.className = 'huelle';
    huelle.hidden = true;
    huelle.setAttribute('lang', 'de');

    var aktuell = (M && M.variante) || id;
    var liste = '';
    for (var i = 0; i < VARIANTEN.length; i++) {
      var v = VARIANTEN[i];
      if (!v || !v.id) continue;
      var vid = String(v.id), istAktuell = vid === aktuell;
      liste += '<li><a class="v" href="' + esc(WECHSEL_URL.replace('{id}', encodeURIComponent(vid))) + '" data-id="' + esc(vid) + '"' +
        (istAktuell ? ' aria-current="page"' : '') + '>' +
        '<span class="v-icon">' + svg(ICON[vid] || ICON_ERSATZ) + '<span class="v-haken">' + svg(ICON.haken) + '</span></span>' +
        '<span class="v-name">' + weich(v.name || vid) + '</span></a></li>';
    }

    var test = '';
    if (TESTMODUS) {
      test = '<section class="test" aria-labelledby="km-test">' +
        '<h3 id="km-test">' + esc(TEST_TITEL) + (TESTDATUM_AKTIV ? '<span class="marke">Testdatum aktiv</span>' : '') + '</h3>' +
        '<p class="fein">' + esc(TEST_HINWEIS || testEndeText()) + '</p>' +
        '<div class="stepper" role="group" aria-label="Testdatum wählen">' +
        '<button type="button" class="schritt" data-schritt="-1" aria-label="Einen Tag früher">' + svg(ICON.links) + '</button>' +
        '<output class="wert" aria-live="polite"><strong></strong><small></small></output>' +
        '<button type="button" class="schritt" data-schritt="1" aria-label="Einen Tag später">' + svg(ICON.rechts) + '</button>' +
        '</div>' +
        '<button type="button" class="knopf haupt" data-aktion="setzen">Dieses Datum anzeigen</button>' +
        '<div class="reihe">' +
        '<button type="button" class="knopf" data-aktion="zu">Alle wieder zu</button>' +
        '<button type="button" class="knopf" data-aktion="gestern">Bis gestern öffnen</button>' +
        '</div>' +
        (TESTDATUM_AKTIV ? '<button type="button" class="knopf leise" data-aktion="echt">Echtes Datum (' + esc(tagKurz(ECHT_HEUTE)) + ')</button>' : '') +
        '<p class="stand"></p>' +
        '<p class="status" role="status" aria-live="polite"></p>' +
        '</section>';
    }

    huelle.innerHTML =
      '<div class="schleier"></div>' +
      '<div class="panel" role="dialog" aria-modal="true" aria-labelledby="km-titel" tabindex="-1">' +
      '<div class="griff" aria-hidden="true"></div>' +
      '<div class="kopf"><span class="kopf-icon" aria-hidden="true">' + svg(ICON.flocke) + '</span>' +
      '<h2 id="km-titel">' + esc(TITEL) + '</h2>' +
      '<button type="button" class="zu" aria-label="Menü schließen">' + svg(ICON.zu) + '</button></div>' +
      (START_URL ? '<a class="heim" href="' + esc(START_URL) + '">' + svg(ICON.haus) + '<span>' + esc(START_TEXT) + '</span></a>' : '') +
      (MEHRERE ? '<section aria-labelledby="km-ansicht"><h3 id="km-ansicht">Ansicht wählen</h3>' +
      '<ul class="varianten">' + liste + '</ul>' +
      '<p class="fein">Was schon geöffnet ist, bleibt beim Wechseln erhalten.</p></section>' : '') +
      test +
      (FUSS ? '<p class="fuss">' + esc(FUSS.text) + (FUSS_URL ? ' · <a href="' + esc(FUSS_URL) + '" target="_blank" rel="noopener">' +
        esc((typeof FUSS.link === 'string' && FUSS.link) ? FUSS.link : FUSS_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')) + '</a>' : '') + '</p>' : '') +
      '</div>';
    w.wurzel.appendChild(huelle);
    document.body.appendChild(w.wirt);

    menue.huelle = huelle;
    menue.panel = huelle.querySelector('.panel');
    menue.zuKnopf = huelle.querySelector('.zu');
    menue.wahl = heuteWert;

    huelle.querySelector('.schleier').addEventListener('click', function () { menueSchliessen(); });
    menue.zuKnopf.addEventListener('click', function () { menueSchliessen(); });
    huelle.addEventListener('click', function (e) {
      var ziel = e.target && e.target.closest ? e.target : null;
      if (!ziel) return;
      var a = ziel.closest('a.v');
      if (a) {
        if (a.hasAttribute('aria-current')) { e.preventDefault(); menueSchliessen(); }
        return; // sonst normal navigieren (Seite lädt neu, Stand bleibt im gemeinsamen Speicher)
      }
      var s = ziel.closest('[data-schritt]');
      if (s) { menue.wahl = klemmen(menue.wahl + parseInt(s.getAttribute('data-schritt'), 10)); testAnzeigen(); return; }
      var k = ziel.closest('[data-aktion]');
      if (k) aktion(k.getAttribute('data-aktion'));
    });
    // Klicks/Berührungen im Menü nicht an die Variante weiterreichen (deren Seiten-Handler)
    var typen = ['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'wheel'];
    for (var j = 0; j < typen.length; j++) {
      w.wirt.addEventListener(typen[j], function (e) { e.stopPropagation(); }, { passive: true });
    }
  }

  function status(text) {
    var s = menue.huelle.querySelector('.status');
    if (!s) return;
    s.textContent = '';
    setTimeout(function () { s.textContent = text; }, 30); // neu ansagen, auch bei gleichem Text
  }

  function testAnzeigen() {
    if (!TESTMODUS || !menue.huelle) return;
    var h = menue.huelle, n = menue.wahl;
    h.querySelector('.wert strong').textContent = tagKurz(n);
    h.querySelector('.wert small').textContent = n >= 1 && n <= 24 ? K.wochentag(n) : (n <= 0 ? 'alles noch zu' : 'alles offen');
    h.querySelector('[data-schritt="-1"]').disabled = n <= 0;
    h.querySelector('[data-schritt="1"]').disabled = n >= 25;
    h.querySelector('.stand').textContent = 'Angezeigt wird ' + (testdatumAnzeigen() ? 'das Testdatum ' : 'das echte Datum: ') + tagLang(heuteWert) + '.';
  }

  function aktion(was) {
    if (was === 'setzen') { testdatumSetzen(menue.wahl); return; }
    if (was === 'echt') { testdatumLoeschen(); return; }
    if (was === 'zu') {
      K.zuruecksetzen();
      try { window.dispatchEvent(new MessageEvent('message', { data: { kalender: 'reset', ausMenue: true } })); } catch (e) { /* alt */ }
      status('Alle Tage sind wieder zu.');
      return;
    }
    if (was === 'gestern') {
      var n = bisGesternOeffnen();
      melden();
      status(n > 0 ? (n === 24 ? 'Alle 24 Tage sind geöffnet.' : 'Tag 1 bis ' + n + ' sind geöffnet, heute ist noch zu.')
        : (heuteWert <= 0 ? 'Vor Dezember gibt es noch nichts zu öffnen.' : 'Heute ist der erste Tag – davor gibt es nichts.'));
    }
  }

  function testdatumSetzen(n) {
    n = klemmen(n);
    var sicher = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = COOKIE_TESTTAG + '=' + n + '; path=/; max-age=' + (30 * 24 * 3600) + '; SameSite=Lax' + sicher;
    if (STATISCH) { try { window.localStorage.setItem(COOKIE_TESTTAG, String(n)); } catch (e) { /* egal */ } }
    neuLaden();
  }
  function testdatumLoeschen() {
    document.cookie = COOKIE_TESTTAG + '=; path=/; max-age=0; SameSite=Lax';
    try { window.localStorage.removeItem(COOKIE_TESTTAG); } catch (e) { /* egal */ }
    neuLaden();
  }

  function fokussierbare() {
    var alle = menue.panel.querySelectorAll('a[href],button:not([disabled])'), r = [];
    for (var i = 0; i < alle.length; i++) if (alle[i].getClientRects().length) r.push(alle[i]);
    return r;
  }
  function aktivesElement() {
    return (menue.wurzel && menue.wurzel.activeElement) || document.activeElement;
  }
  function fokus(el) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }

  function panelPlatzieren() {
    var p = menue.panel;
    p.style.left = ''; p.style.top = '';
    var vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
    if (!(vw >= 600 && vh >= 480)) return; // Handy: Blatt von unten (per CSS)
    var r = menue.knopf.getBoundingClientRect(), breite = p.offsetWidth || 396, hoehe = p.offsetHeight, rand = 12;
    var links, oben;
    if (!r.width) { links = (vw - breite) / 2; oben = (vh - hoehe) / 2; }
    else {
      links = (r.left + r.width / 2 < vw / 2) ? r.left : r.right - breite;
      oben = (r.top + r.height / 2 > vh / 2) ? r.top - 10 - hoehe : r.bottom + 10;
    }
    links = Math.max(rand, Math.min(vw - rand - breite, links));
    oben = Math.max(rand, Math.min(vh - rand - hoehe, oben));
    p.style.left = Math.round(links) + 'px';
    p.style.top = Math.round(oben) + 'px';
  }

  function menueOeffnen() {
    if (!menue.huelle) panelBauen();
    if (menue.offen) return;
    clearTimeout(menue.uhr);
    menue.offen = true;
    menue.wahl = heuteWert;
    testAnzeigen();
    var s = menue.huelle.querySelector('.status');
    if (s) s.textContent = '';
    menue.huelle.hidden = false;
    panelPlatzieren();
    void menue.panel.offsetWidth; // Startzustand für die Einblendung
    menue.huelle.classList.add('offen');
    menue.knopf.setAttribute('aria-expanded', 'true');
    fokus(menue.huelle.querySelector('.v[aria-current]') || menue.zuKnopf);
    window.addEventListener('resize', panelPlatzieren);
  }

  function menueSchliessen(ohneFokus) {
    if (!menue || !menue.offen) return;
    menue.offen = false;
    menue.huelle.classList.remove('offen');
    menue.knopf.setAttribute('aria-expanded', 'false');
    window.removeEventListener('resize', panelPlatzieren);
    var h = menue.huelle;
    menue.uhr = setTimeout(function () { if (!menue.offen) h.hidden = true; }, K.bewegungReduziert ? 0 : 240);
    if (!ohneFokus) fokus(menue.knopf);
  }

  // Tastatur, solange das Menü offen ist: Esc schließt, Tab bleibt im Menü, Varianten bekommen keine Tasten
  function tasten(e) {
    if (!menue || !menue.offen) return;
    if (e.type === 'keydown') {
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); menueSchliessen(); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        var f = fokussierbare();
        if (f.length) {
          var i = f.indexOf(aktivesElement());
          var n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i < 0 || i >= f.length - 1 ? 0 : i + 1);
          fokus(f[n]);
        }
      }
    }
    // auch andere Hörer auf window (Varianten) sollen währenddessen nicht reagieren
    if (e.stopImmediatePropagation) e.stopImmediatePropagation(); else e.stopPropagation();
  }
  window.addEventListener('keydown', tasten, true);
  window.addEventListener('keyup', tasten, true);
  document.addEventListener('focusin', function (e) {
    if (!menue || !menue.offen || e.target === menue.wirt) return;
    var f = fokussierbare();
    fokus(menue.huelle.querySelector('.v[aria-current]') || f[0]);
  });

  window.Kalender = K;
})();
