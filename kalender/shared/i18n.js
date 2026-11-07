/*
 * Dein Adventskalender – Baustein „Sprache“ (shared/i18n.js): klassische i18n mit Schlüsseln (wie i18next)
 *
 * Einbinden in jeder Seite VOR shared/kalender.js (der Lader bzw. shared/start.js setzt window.ADVENTSKALENDER davor):
 *     <script src="../shared/sprachen.js"></script>   (alle Sprachpakete – erzeugt „npm run bauen“ bzw. „npm run demo“
 *     <script src="../shared/i18n.js"></script>        aus kalender/i18n/<sprache>.json)
 *
 * Texte stehen in kalender/i18n/de.json, en.json … – je Bereich verschachtelt, in allen Dateien mit denselben
 * Schlüsseln. Im Code: t('tueren.leiste.heute', 'Heute: Türchen {n}', { n: 12 }) – der zweite Wert ist der deutsche
 * Standardtext. Im HTML: <b data-i18n="tueren.titel">Text</b>.
 * Neue Sprache: kalender/i18n/en.json nach kalender/i18n/<code>.json kopieren, übersetzen und den Code in
 * einstellungen.json bei „sprachen“ eintragen.
 *
 * Einstellungen aus window.ADVENTSKALENDER (alle optional):
 *   sprachen       verfügbare Sprachen, z. B. ['de', 'en'] (Standard: nur ['de'])
 *   sprache        'auto' (Browsersprache beim ersten Besuch) | 'de' | 'en' … (fester Standard beim ersten Besuch)
 *   titel          Kalender-Titel (Text) – wird hier auf die aktive Sprache gesetzt, wenn titelJeSprache sie hat
 *   titelJeSprache { de: 'Dein Adventskalender', en: 'Your Advent Calendar' } (nur öffentliche Version)
 *   jahr           Kalenderjahr (für datum())
 *
 * Sprachwahl: ?lang=xx (wird gemerkt) → gemerkte Wahl (localStorage 'adventskalender_sprache') → bei sprache 'auto' die
 * erste passende Browsersprache (navigator.languages, en-GB → en) → sprache → erste der verfügbaren.
 *
 * API (window.I18N):
 *   t(schluessel, deutsch, werte)  Text in der aktiven Sprache. deutsch: Text oder Mehrzahl-Objekt { one, other }
 *                                  (Auswahl per Intl.PluralRules über werte.n). Platzhalter {name} aus werte;
 *                                  {titel} und {jahr} gibt es immer. Ergebnis ist reiner Text (für innerHTML escapen!).
 *   hat(schluessel)                true, wenn die aktive Sprache eine Übersetzung dafür hat
 *   sprache()                      aktive Sprache ('de', 'en', …)      sprachen()   verfügbare Sprachen
 *   standard()                     Quellsprache 'de'                    locale()     z. B. 'de-DE', 'en-US', 'en-GB'
 *   sprachName(code)               Name der Sprache in ihr selbst („Deutsch“, „English“)
 *   setzeSprache(code)             merkt die Wahl und lädt die Seite neu (ohne ?lang)
 *   titel()                        Kalender-Titel in der aktiven Sprache
 *   datum(tag, art)                tag = Dezembertag (1–31) oder Date; art: 'lang' („Samstag, 12. Dezember“ /
 *                                  „Saturday, December 12“, Standard), 'kurz' („12. Dezember“ / „December 12“),
 *                                  'wochentag' („Samstag“), 'wochentagKurz' („Sa“), 'monat' („Dezember“),
 *                                  oder ein Optionen-Objekt für Intl.DateTimeFormat
 *   zahl(n, optionen)              Zahl im Format der Sprache (Intl.NumberFormat)
 *   uebersetzen(wurzel)            data-i18n-Attribute in wurzel (Standard: document) übersetzen – für HTML, das
 *                                  ein Skript nach dem Laden einsetzt
 * Statisches HTML (wird beim Laden automatisch übersetzt, schon während des Parsens – ohne Flackern):
 *   <h2 data-i18n="tueren.hilfe.titel">So geht’s</h2>                      Textinhalt = deutscher Standard
 *   <p data-i18n-html="start.hinweis">Text mit <strong>Auszeichnung</strong></p>   innerHTML (nur eigene Texte!)
 *   <button data-i18n-attr="aria-label:tueren.zu;title:tueren.zuTipp" aria-label="Schließen" title="Zu">
 *   <img src="bild.webp" data-src-en="bild-en.webp">                      Bild je Sprache
 *   Kalender-Titel (setzt das Export-Werkzeug, nicht von Hand): data-titel="ganz|a|b|a1|a-rest",
 *   data-titel-bunt="a|b" (Buchstaben als <span class="c-…">), data-titel-attr="aria-label" (Attribut statt Text).
 * <html lang> wird auf die aktive Sprache gesetzt.
 */
(function () {
  'use strict';

  var QUELLE = 'de';
  var SPEICHER = 'adventskalender_sprache';
  var LOCALE_STANDARD = { de: 'de-DE', en: 'en-US' };
  var NAMEN = { de: 'Deutsch', en: 'English' };
  var TAGE_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var MONATE_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  var BUNT = ['c-k', 'c-s', 'c-p', 'c-t'];

  var M = (window.ADVENTSKALENDER && typeof window.ADVENTSKALENDER === 'object') ? window.ADVENTSKALENDER : null;
  var JAHR = (M && +M.jahr > 2000) ? Math.round(+M.jahr) : 2026;

  function code(x) { return typeof x === 'string' ? x.trim().toLowerCase().replace(/_/g, '-') : ''; }

  // ---------- verfügbare Sprachen ----------
  var SPRACHEN = [];
  if (M && M.sprachen && M.sprachen.length) {
    for (var i = 0; i < M.sprachen.length; i++) {
      var c = code(M.sprachen[i]);
      if (/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(c) && SPRACHEN.indexOf(c) < 0) SPRACHEN.push(c);
    }
  }
  if (!SPRACHEN.length) SPRACHEN = [QUELLE];
  var VORGABE = M && typeof M.sprache === 'string' ? code(M.sprache) : 'auto';

  function passend(wunsch) {
    var w = code(wunsch);
    if (!w) return null;
    if (SPRACHEN.indexOf(w) >= 0) return w;
    var basis = w.split('-')[0];
    if (SPRACHEN.indexOf(basis) >= 0) return basis;
    return null;
  }
  function lesen() { try { return window.localStorage.getItem(SPEICHER); } catch (e) { return null; } }
  function merken(c) { try { window.localStorage.setItem(SPEICHER, c); } catch (e) { /* privater Modus */ } }
  function browserSprachen() {
    var n = window.navigator || {};
    var l = (n.languages && n.languages.length) ? n.languages : [n.language || n.userLanguage || ''];
    return Array.prototype.slice.call(l);
  }

  function ermitteln() {
    if (SPRACHEN.length === 1) return SPRACHEN[0];
    var p = null;
    try { p = new URLSearchParams(window.location.search).get('lang'); } catch (e) { p = null; }
    var c = passend(p);
    if (c) { merken(c); return c; }
    c = passend(lesen());
    if (c) return c;
    if (VORGABE === 'auto' || !passend(VORGABE)) {
      var b = browserSprachen();
      for (var j = 0; j < b.length; j++) { c = passend(b[j]); if (c) return c; }
    }
    return passend(VORGABE) || SPRACHEN[0];
  }
  var AKTIV = ermitteln();

  // Locale für Intl: passende Regionalvariante des Browsers (en-GB) oder die Standard-Region der Sprache
  var LOCALE = (function () {
    var b = browserSprachen();
    for (var j = 0; j < b.length; j++) {
      var x = String(b[j] || '');
      if (x.toLowerCase().split('-')[0] === AKTIV && /-/.test(x)) return x;
    }
    return LOCALE_STANDARD[AKTIV] || AKTIV;
  })();
  try { new Intl.DateTimeFormat(LOCALE); } catch (e) { LOCALE = LOCALE_STANDARD[AKTIV] || 'de-DE'; }

  // ---------- Sprachpaket ----------
  var ORDNER = (function () {
    var s = document.currentScript;
    var src = s && s.src ? s.src : '';
    return src ? src.replace(/[?#].*$/, '').replace(/[^\/]*$/, '') : 'shared/';
  })();
  var VERSION = (function () {
    var s = document.currentScript;
    var m = s && s.src ? /\?[^#]*/.exec(s.src) : null;
    return m ? m[0] : '';
  })();
  function paket(c) {
    var d = window.I18N_DATEN;
    return (d && typeof d === 'object' && d[c] && typeof d[c] === 'object') ? d[c] : null;
  }
  function daten() { return paket(AKTIV); }
  var nachgeladen = false;
  // Normalfall: shared/sprachen.js ist per <script> VOR i18n.js eingebunden. Fehlt es, hier synchron nachladen.
  if (!window.I18N_DATEN) {
    var url = ORDNER + 'sprachen.js' + VERSION;
    if (document.readyState === 'loading') {
      document.write('<script src="' + url.replace(/"/g, '&quot;') + '"><\/script>');
    } else {
      nachgeladen = true;
      var s = document.createElement('script');
      s.src = url;
      s.onload = function () { titelLokalisieren(); uebersetzen(document); };
      (document.head || document.documentElement).appendChild(s);
    }
  }

  // ---------- Titel ----------
  var TITEL_EINGEBAUT = (M && typeof M.titel === 'string') ? M.titel : '';
  function titel() {
    var j = M && M.titelJeSprache && typeof M.titelJeSprache === 'object' ? M.titelJeSprache : null;
    if (j) {
      if (typeof j[AKTIV] === 'string' && j[AKTIV]) return j[AKTIV];
      if (typeof j[QUELLE] === 'string' && j[QUELLE] && !TITEL_EINGEBAUT) return j[QUELLE];
    }
    return TITEL_EINGEBAUT;
  }
  function titelLokalisieren() { if (M && TITEL_EINGEBAUT) M.titel = titel(); }
  titelLokalisieren();
  var TITEL_TAUSCHEN = !!(TITEL_EINGEBAUT && titel() !== TITEL_EINGEBAUT);

  // ---------- t() ----------
  var regelCache = {};
  function mehrzahlForm(locale, n) {
    try {
      if (!regelCache[locale]) regelCache[locale] = new Intl.PluralRules(locale);
      return regelCache[locale].select(n);
    } catch (e) { return n === 1 ? 'one' : 'other'; }
  }
  function waehlen(wert, werte, locale) {
    if (wert && typeof wert === 'object') {
      var n = werte && typeof werte.n === 'number' ? werte.n : (werte ? parseFloat(werte.n) : NaN);
      if (isNaN(n)) return typeof wert.other === 'string' ? wert.other : '';
      if (n === 0 && typeof wert.zero === 'string') return wert.zero;
      var form = mehrzahlForm(locale, n);
      if (typeof wert[form] === 'string') return wert[form];
      return typeof wert.other === 'string' ? wert.other : (typeof wert.one === 'string' ? wert.one : '');
    }
    return wert === undefined || wert === null ? '' : String(wert);
  }
  function einsetzen(text, werte) {
    return text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, function (alles, name) {
      if (werte && Object.prototype.hasOwnProperty.call(werte, name) && werte[name] !== undefined && werte[name] !== null) return String(werte[name]);
      if (name === 'titel') return titel();
      if (name === 'jahr') return String(JAHR);
      return alles;
    });
  }
  function hat(schluessel) {
    var d = daten();
    return !!(d && Object.prototype.hasOwnProperty.call(d, schluessel) && d[schluessel] !== '' && d[schluessel] !== null);
  }
  // t(schluessel[, standard][, werte]) – wie i18next: Text der aktiven Sprache, sonst Deutsch aus i18n/de.json, sonst der
  // optionale Standardtext aus dem Code (defaultValue), sonst der Schlüssel. Kurzform ohne Standard: t('a.b', { n: 3 }).
  function t(schluessel, deutsch, werte) {
    if (werte === undefined && deutsch && typeof deutsch === 'object' && !('one' in deutsch) && !('other' in deutsch)) { werte = deutsch; deutsch = undefined; }
    var d = daten(), q = paket(QUELLE);
    if (d && Object.prototype.hasOwnProperty.call(d, schluessel) && d[schluessel] !== '') return einsetzen(waehlen(d[schluessel], werte, LOCALE), werte);
    if (q && Object.prototype.hasOwnProperty.call(q, schluessel) && q[schluessel] !== '') return einsetzen(waehlen(q[schluessel], werte, 'de-DE'), werte);
    if (deutsch !== undefined) return einsetzen(waehlen(deutsch, werte, 'de-DE'), werte);
    return schluessel;
  }

  // ---------- Datum, Zahlen ----------
  var ARTEN = {
    lang: { weekday: 'long', day: 'numeric', month: 'long' },
    kurz: { day: 'numeric', month: 'long' },
    wochentag: { weekday: 'long' },
    wochentagKurz: { weekday: 'short' },
    monat: { month: 'long' }
  };
  var formatCache = {};
  function datum(tag, art) {
    var d = tag instanceof Date ? tag : new Date(JAHR, 11, Math.round(+tag) || 1);
    var opt = (art && typeof art === 'object') ? art : (ARTEN[art || 'lang'] || ARTEN.lang);
    var schluessel = typeof art === 'string' ? art : (art ? JSON.stringify(art) : 'lang');
    try {
      if (!formatCache[schluessel]) formatCache[schluessel] = new Intl.DateTimeFormat(LOCALE, opt);
      return formatCache[schluessel].format(d);
    } catch (e) {
      var w = TAGE_DE[d.getDay()], m = MONATE_DE[d.getMonth()];
      if (art === 'wochentag') return w;
      if (art === 'wochentagKurz') return w.slice(0, 2);
      if (art === 'monat') return m;
      if (art === 'kurz') return d.getDate() + '. ' + m;
      return w + ', ' + d.getDate() + '. ' + m;
    }
  }
  function zahl(n, optionen) {
    try { return new Intl.NumberFormat(LOCALE, optionen || {}).format(n); } catch (e) { return String(n); }
  }
  function sprachName(c) {
    c = code(c);
    try {
      var n = new Intl.DisplayNames([c], { type: 'language' }).of(c);
      if (n && n.toLowerCase() !== c) return n.charAt(0).toLocaleUpperCase(c) + n.slice(1);
    } catch (e) { /* alte Browser */ }
    return NAMEN[c] || c.toUpperCase();
  }
  function setzeSprache(c) {
    c = passend(c);
    if (!c) return false;
    merken(c);
    var adresse = window.location.href.replace(/#.*$/, '');
    var ohne = adresse.replace(/([?&])lang=[^&#]*(&|$)/, function (a, vor, nach) { return nach ? vor : ''; }).replace(/[?&]$/, '');
    if (ohne === adresse) window.location.reload();
    else window.location.replace(ohne + window.location.hash);
    return true;
  }

  // ---------- statisches HTML übersetzen ----------
  var AUSWAHL = '[data-i18n],[data-i18n-html],[data-i18n-attr],[data-titel],[data-titel-bunt],[data-src-' + AKTIV + ']';
  function teile() {
    var woerter = titel().trim().split(/\s+/);
    var a = woerter[0] || '', b = woerter.slice(1).join(' ');
    var za = Array.from ? Array.from(a) : a.split('');
    return { ganz: titel().trim(), a: a, b: b, a1: za[0] || '', 'a-rest': za.slice(1).join(''), laengeA: za.length };
  }
  function bunt(wort, versatz) {
    var z = Array.from ? Array.from(wort) : wort.split(''), r = '';
    for (var k = 0; k < z.length; k++) {
      r += '<span class="' + BUNT[(k + versatz) % BUNT.length] + '">' + z[k].replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>';
    }
    return r;
  }
  function element(el) {
    var k = el.getAttribute('data-i18n');
    if (k && AKTIV !== QUELLE && hat(k)) {
      var neu = t(k, '');
      if (el.textContent !== neu) el.textContent = neu;
    }
    k = el.getAttribute('data-i18n-html');
    if (k && AKTIV !== QUELLE && hat(k)) {
      var h = t(k, '');
      if (el.innerHTML !== h) el.innerHTML = h;
    }
    var attr = el.getAttribute('data-i18n-attr');
    if (attr && AKTIV !== QUELLE) {
      var paare = attr.split(';');
      for (var p = 0; p < paare.length; p++) {
        var teil = paare[p].split(':');
        var name = (teil[0] || '').trim(), sk = (teil[1] || '').trim();
        if (name && sk && hat(sk)) el.setAttribute(name, t(sk, ''));
      }
    }
    // Bild je Sprache: <img src="a.webp" data-src-en="a-en.webp"> (vor dem Laden getauscht, wenn das Skript im <head> steht)
    var bild = AKTIV !== QUELLE ? el.getAttribute('data-src-' + AKTIV) : null;
    if (bild && el.getAttribute('src') !== bild) el.setAttribute('src', bild);
    if (TITEL_TAUSCHEN) {
      var was = el.getAttribute('data-titel'), tt = teile();
      if (was && Object.prototype.hasOwnProperty.call(tt, was)) {
        var ziel = el.getAttribute('data-titel-attr');
        if (ziel) el.setAttribute(ziel, tt[was]);
        else if (el.textContent !== tt[was]) el.textContent = tt[was];
      }
      var bw = el.getAttribute('data-titel-bunt');
      if (bw === 'a' || bw === 'b') {
        var html = bunt(tt[bw], bw === 'b' ? 1 : 0);
        if (el.innerHTML !== html) el.innerHTML = html;
        el.style.setProperty('--titel-laenge', String(Math.max(1, (Array.from ? Array.from(tt[bw]) : tt[bw].split('')).length)));
      }
    }
  }
  function uebersetzen(wurzel) {
    wurzel = wurzel || document;
    if (wurzel.nodeType === 1 && wurzel.matches && wurzel.matches(AUSWAHL)) element(wurzel);
    if (!wurzel.querySelectorAll) return;
    var liste = wurzel.querySelectorAll(AUSWAHL);
    for (var n = 0; n < liste.length; n++) element(liste[n]);
  }

  function htmlLang() { try { document.documentElement.setAttribute('lang', AKTIV); } catch (e) { /* egal */ } }
  htmlLang();

  var noetig = AKTIV !== QUELLE || TITEL_TAUSCHEN;
  if (noetig && !nachgeladen) {
    // Was schon geparst ist (Skripte stehen oft am Ende von <body>), sofort übersetzen – kein kurzes Aufblitzen
    uebersetzen(document);
    // Schon während des Parsens übersetzen: MutationObserver-Rückrufe laufen vor dem nächsten Zeichnen.
    var beobachter = null;
    if (window.MutationObserver && document.readyState === 'loading') {
      beobachter = new MutationObserver(function (aenderungen) {
        for (var a = 0; a < aenderungen.length; a++) {
          var ae = aenderungen[a];
          var z = ae.target && ae.target.nodeType === 1 ? ae.target : null;
          if (z && z.closest) { var ober = z.closest(AUSWAHL); if (ober) element(ober); }
          for (var b = 0; b < ae.addedNodes.length; b++) {
            var knoten = ae.addedNodes[b];
            if (knoten.nodeType === 1) uebersetzen(knoten);
          }
        }
      });
      beobachter.observe(document.documentElement, { childList: true, subtree: true });
    }
    var fertig = function () {
      if (beobachter) { beobachter.takeRecords(); beobachter.disconnect(); beobachter = null; }
      htmlLang();
      uebersetzen(document);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fertig);
    else fertig();
  }

  window.I18N = {
    t: t,
    hat: hat,
    sprache: function () { return AKTIV; },
    sprachen: function () { return SPRACHEN.slice(); },
    standard: function () { return QUELLE; },
    locale: function () { return LOCALE; },
    sprachName: sprachName,
    setzeSprache: setzeSprache,
    titel: titel,
    datum: datum,
    zahl: zahl,
    uebersetzen: uebersetzen
  };
})();
