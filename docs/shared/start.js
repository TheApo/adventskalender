/*
 * Dein Adventskalender – Startbaustein der Demo (docs/shared/start.js)
 *
 * Rein statisch, ohne Server: rechnet das Datum im Browser aus und setzt window.ADVENTSKALENDER, bevor
 * shared/kalender.js geladen wird. Bilddaten gibt es keine – shared/fotos.js malt die Platzhalter-Fotos selbst.
 * Das Ausprobieren von Daten ist in der Demo immer eingeschaltet.
 *
 * Einbinden in jeder Ansicht VOR sprachen.js/i18n.js/kalender.js:  <script src="../shared/start.js" data-ansicht="tueren"></script>
 * Ohne data-ansicht (Startseite) stellt der Baustein Helfer bereit (window.DeinAdventskalender) und setzt nur Titel
 * und Sprachen in window.ADVENTSKALENDER.
 *
 * „Heute“ (0 = noch November, 1–24 = Dezembertag, 25 = ab dem 25. Dezember) kommt aus:
 *   1. ?tag=N in der Adresse (Link von der Startseite) → wird gemerkt, ?tag verschwindet aus der Adresse
 *   2. Cookie adventskalender_testtag (setzt auch das Menü „Dieses Datum anzeigen“), Rückfall localStorage
 *   3. nach „Echtes Datum“ im Menü: das echte Datum (Zeitzone Europe/Berlin)
 *   4. sonst (erster Besuch ohne Angabe): im Dezember das echte Datum, sonst der Standardtag (12)
 * Das Jahr ist immer das laufende (= der kommende bzw. laufende Advent); Elemente mit data-kalender-jahr
 * bekommen es als Text.
 *
 * Die Einstellungen setzt werkzeuge/demo-bauen.mjs ein.
 */
(function () {
  'use strict';

  var K = {"titel":"Dein Adventskalender","titelJeSprache":{"de":"Dein Adventskalender","en":"Your Advent Calendar"},"sprachen":["de","en"],"sprache":"auto","speicher":"dein-adventskalender","zeitzone":"Europe/Berlin","standardTag":12,"varianten":[{"id":"tueren","name":"Türchenwand"},{"id":"girlande","name":"Kugel-Girlanden"},{"id":"kranz","name":"Lichterkranz"},{"id":"rubbellos","name":"Weihnachtslotterie"},{"id":"fotoleine","name":"Fotoleine"},{"id":"stories","name":"Advent-Stories"},{"id":"schneekugel","name":"Schneekugel"},{"id":"baum","name":"Drehbaum"},{"id":"geschenk","name":"Geschenke auspacken"},{"id":"nuss","name":"Nussknacker"},{"id":"sterne","name":"Sternbilder"},{"id":"schneemann","name":"Schneefiguren bauen"}],"startUrl":"../index.html","startText":"Zur Startseite","testTitel":"Datum ausprobieren","testHinweis":"Stell ein beliebiges Datum ein – so siehst du, wie sich der Kalender bis Weihnachten füllt.","fusszeile":{"text":"Dein Adventskalender – made by Dirk Aporius","link":"www.apo-games.de","url":"https://www.apo-games.de"}};
  if (!K) return;

  var KEKS = 'adventskalender_testtag';     // gleicher Name wie in shared/kalender.js (Menü)
  var MARKE = K.speicher + ':datum';        // 'test' = ein Ausprobier-Datum war gewählt, 'echt' = echtes Datum
  var WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  // ---- Datum in der Kalender-Zeitzone --------------------------------------------------------------
  function datumInZone() {
    var jetzt = new Date();
    try {
      var teile = new Intl.DateTimeFormat('en-US', { timeZone: K.zeitzone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(jetzt);
      var w = {};
      for (var i = 0; i < teile.length; i++) w[teile[i].type] = parseInt(teile[i].value, 10);
      if (w.year && w.month && w.day) return { j: w.year, m: w.month, t: w.day };
    } catch (e) { /* alte Browser */ }
    return { j: jetzt.getFullYear(), m: jetzt.getMonth() + 1, t: jetzt.getDate() };
  }
  var D = datumInZone();
  var JAHR = D.j;                                   // der Advent dieses Jahres
  var ECHT = D.m < 12 ? 0 : Math.min(D.t, 25);

  // ---- kleine Helfer ---------------------------------------------------------------------------
  function gueltig(w) {
    if (typeof w === 'number') w = String(w);
    return (typeof w === 'string' && /^\d{1,2}$/.test(w) && parseInt(w, 10) <= 25) ? parseInt(w, 10) : null;
  }
  function keksLesen() {
    try {
      var teile = document.cookie ? document.cookie.split(';') : [];
      for (var i = 0; i < teile.length; i++) {
        var s = teile[i].replace(/^\s+/, '');
        if (s.indexOf(KEKS + '=') === 0) return decodeURIComponent(s.slice(KEKS.length + 1));
      }
    } catch (e) { /* Cookies gesperrt */ }
    return null;
  }
  function keksSetzen(n) {
    try {
      document.cookie = KEKS + '=' + n + '; path=/; max-age=' + (30 * 24 * 3600) + '; SameSite=Lax' +
        (location.protocol === 'https:' ? '; Secure' : '');
    } catch (e) { /* egal */ }
  }
  function keksLoeschen() {
    try { document.cookie = KEKS + '=; path=/; max-age=0; SameSite=Lax'; } catch (e) { /* egal */ }
  }
  function lesen(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function schreiben(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* privat-Modus o. ä. */ } }
  function loeschen(k) { try { window.localStorage.removeItem(k); } catch (e) { /* egal */ } }

  function standardTag() { return ECHT >= 1 ? ECHT : K.standardTag; }

  /** Gewähltes Datum merken – genau so, wie es das Menü in kalender.js tut (Cookie + localStorage). */
  function merken(n) {
    if (n === ECHT) {
      keksLoeschen(); loeschen(KEKS); schreiben(MARKE, 'echt');
    } else {
      keksSetzen(n); schreiben(KEKS, String(n)); schreiben(MARKE, 'test');
    }
  }

  /** Bisher gewähltes Datum oder null (noch nie etwas gewählt). Schreibt nichts außer der Marke. */
  function gemerkterTag() {
    var c = gueltig(keksLesen());
    if (c === null) c = gueltig(lesen(KEKS));
    if (c !== null) { if (lesen(MARKE) !== 'test') schreiben(MARKE, 'test'); return c; }
    var m = lesen(MARKE);
    // Cookie weg, obwohl eins gesetzt war → „Echtes Datum“ im Menü gedrückt (oder nach 30 Tagen abgelaufen)
    if (m === 'test') { schreiben(MARKE, 'echt'); return ECHT; }
    if (m === 'echt') return ECHT;
    return null;
  }

  // Texte in der aktiven Sprache (shared/i18n.js lädt auf der Startseite nach diesem Baustein – daher erst beim Aufruf)
  function datumText(n) {
    var I = window.I18N;
    if (n <= 0) return I ? I.t('start.datum.november', 'Noch November') : 'Noch November';
    if (n >= 25) return I ? I.t('start.datum.weihnachten', 'Ab dem 25. Dezember') : 'Ab dem 25. Dezember';
    return I ? I.datum(n, 'lang') : WOCHENTAGE[new Date(JAHR, 11, n).getDay()] + ', ' + n + '. Dezember';
  }

  // Jahreszahl in die Seite schreiben (Rubbellos-Siegel u. Ä.)
  function jahrEinsetzen() {
    var el = document.querySelectorAll('[data-kalender-jahr]');
    for (var i = 0; i < el.length; i++) el[i].textContent = String(JAHR);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', jahrEinsetzen);
  else jahrEinsetzen();

  window.DeinAdventskalender = {
    jahr: JAHR,
    echtHeute: ECHT,
    standardTag: standardTag,
    gemerkterTag: gemerkterTag,
    merken: merken,
    datumText: datumText,
    ansichten: K.varianten
  };

  // ---- Ansicht: window.ADVENTSKALENDER setzen ------------------------------------------------------
  var skript = document.currentScript;
  var ansicht = skript && skript.getAttribute('data-ansicht');
  if (!ansicht) {
    var datei = /([\w-]+)\.html?$/.exec(location.pathname);
    ansicht = datei ? datei[1] : '';
  }
  var bekannt = false;
  for (var i = 0; i < K.varianten.length; i++) if (K.varianten[i].id === ansicht) bekannt = true;
  if (!bekannt) {
    // Startseite: nur Titel und Sprachen für shared/i18n.js
    window.ADVENTSKALENDER = { jahr: JAHR, titel: K.titel, titelJeSprache: K.titelJeSprache, sprachen: K.sprachen, sprache: K.sprache };
    return;
  }

  var heute = null, ausAdresse = null;
  try { ausAdresse = new URLSearchParams(location.search).get('tag'); } catch (e) { ausAdresse = null; }
  if (ausAdresse !== null) {
    heute = gueltig(ausAdresse);
    if (heute !== null) merken(heute);
    // ?tag aus der Adresse entfernen (Lesezeichen und „Neu laden“ nutzen dann das gemerkte Datum)
    try {
      var rest = location.search.slice(1).split('&').filter(function (x) { return x && x.split('=')[0] !== 'tag'; }).join('&');
      history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    } catch (e) { /* egal */ }
  }
  if (heute === null) heute = gemerkterTag();
  if (heute === null) { heute = standardTag(); merken(heute); }

  window.ADVENTSKALENDER = {
    modus: 'statisch',
    jahr: JAHR,
    titel: K.titel,
    titelJeSprache: K.titelJeSprache,
    sprachen: K.sprachen,
    sprache: K.sprache,
    heute: heute,
    echtHeute: ECHT,
    testmodus: true,
    testBis: '',
    variante: ansicht,
    varianten: K.varianten,
    wechselUrl: '{id}.html',
    speicher: K.speicher,
    startUrl: K.startUrl,
    startText: K.startText,
    testTitel: K.testTitel,
    testHinweis: K.testHinweis,
    fusszeile: K.fusszeile,
    tage: {}                        // keine Bilddaten: shared/fotos.js malt die Fotos selbst
  };
})();
