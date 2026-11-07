#!/usr/bin/env node
/*
 * Dein Adventskalender – Demo bauen (Ordner docs/ für GitHub Pages)
 * =================================================================
 * Baut aus kalender/ die Demo mit gemalten Platzhalter-Fotos: Startseite mit Datumswahl und Kalenderwahl,
 * alle Ansichten als eigene Seiten (docs/kalender/<id>.html), Datum zum Ausprobieren immer einstellbar.
 * Alle Pfade sind relativ – die Demo läuft auch unter einem Unterpfad wie https://<name>.github.io/<repo>/.
 *
 * Aufruf (keine Installation nötig):   npm run demo      (oder: node werkzeuge/demo-bauen.mjs [Optionen])
 *
 * Optionen:
 *   --ziel <ordner>        Ausgabeordner, wird ersetzt (Standard: docs/)
 *   --impressum <url>      Link „Impressum“ im Fuß der Startseite
 *   --datenschutz <url>    Link „Datenschutz“ im Fuß der Startseite
 *   --hilfe                diese Hilfe
 *
 * Exit-Code: 0 = fertig, 2 = abgebrochen (Ziel unverändert).
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  REPO_ORDNER, KALENDER_ORDNER, CREDIT, abbrechen, gruen, grau, fett, groesseText, nodePruefen, htmlText,
  jsonFuerScript, liegtIn, istOrdner, istDatei, lesen, schreiben, ordnerKopieren, alleDateien, ansichtenLaden,
  platzhalterEinsetzen, zielPruefen, bauordnerAnlegen, zielErsetzen, ausfuehren
} from './gemeinsam.mjs';

const KENNUNG = 'DEIN-ADVENTSKALENDER-DEMO';
const DEMO = path.join(KALENDER_ORDNER, 'demo');

const EINSTELLUNGEN = {
  titel: 'Dein Adventskalender',
  speicher: 'dein-adventskalender',       // localStorage-Schlüssel (gemeinsam für alle Ansichten der Demo)
  zeitzone: 'Europe/Berlin',
  standardTag: 12,                        // ohne gewähltes Datum (außerhalb des Dezembers)
  startText: 'Zur Startseite',
  testTitel: 'Datum ausprobieren',
  testHinweis: 'Stell ein beliebiges Datum ein – so siehst du, wie sich der Kalender bis Weihnachten füllt.'
};

// Adressen, die in der Demo vorkommen dürfen (Links, keine Anfragen); alles andere bricht den Bau ab
const alsMuster = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const ERLAUBTE_ADRESSEN = [new RegExp(`^${alsMuster(CREDIT.url)}/?$`), /^https:\/\/github\.com\/$/, /^http:\/\/www\.w3\.org\//];

const HILFE = `
Dein Adventskalender – Demo bauen (docs/)

  npm run demo        (oder: node werkzeuge/demo-bauen.mjs [Optionen])

  --ziel <ordner>        Ausgabeordner (Standard: docs/)
  --impressum <url>      Link „Impressum“ im Fuß der Startseite
  --datenschutz <url>    Link „Datenschutz“ im Fuß der Startseite
  --hilfe                diese Hilfe
`;

function argumenteLesen(argv) {
  const werte = { ziel: path.join(REPO_ORDNER, 'docs'), impressum: '', datenschutz: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--hilfe' || a === '--help' || a === '-h') { werte.hilfe = true; continue; }
    const m = /^--(ziel|impressum|datenschutz)(?:=(.*))?$/.exec(a);
    if (!m) abbrechen(`Unbekannte Angabe „${a}“. Hilfe: npm run demo -- --hilfe`);
    let wert = m[2];
    if (wert === undefined) {
      wert = argv[++i];
      if (wert === undefined || wert.startsWith('--')) abbrechen(`Nach --${m[1]} fehlt der Wert.`);
    }
    if (m[1] === 'ziel') {
      if (!wert.trim()) abbrechen('--ziel ist leer.');
      werte.ziel = path.resolve(process.cwd(), wert);
    } else {
      if (wert && !/^https:\/\/[\w.-]+\.[a-z]{2,}(\/[^\s"'<>]*)?$/i.test(wert.trim())) abbrechen(`--${m[1]} erwartet eine Adresse https://…, nicht „${wert}“.`);
      werte[m[1]] = wert.trim();
    }
  }
  return werte;
}

/** weiche Trennstelle für lange Namen in schmalen Karten (wie im Menü von kalender.js) */
function weich(name) {
  return htmlText(name).replace(/^(Weihnachts|Advents|Lichter|Schnee|Türchen|Kugel)(?=[a-zäöü]{4,})/, '$1&shy;');
}

function webpMasse(buf) {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const art = buf.toString('ascii', 12, 16);
  if (art === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (art === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (art === 'VP8L') { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
  return null;
}

function kartenHtml(ansichten, vorschauen) {
  return ansichten.map((a) => {
    const v = vorschauen[a.id];
    const bild = v
      ? `<img src="vorschau/${a.id}.webp" width="${v.w}" height="${v.h}" alt="" loading="lazy" decoding="async">`
      : '<span class="ohne-bild" aria-hidden="true"></span>';
    return `      <li class="karte">\n        <a class="karte-link" href="kalender/${a.id}.html?tag=${EINSTELLUNGEN.standardTag}" data-id="${a.id}">\n` +
      `          <span class="karte-bild">${bild}</span>\n` +
      `          <span class="karte-name">${weich(a.name)}</span>\n` +
      `          <span class="karte-satz">${htmlText(a.satz || '')}</span>\n        </a>\n      </li>`;
  }).join('\n');
}

function fremdeAdressen(name, text, liste) {
  const re = /\bhttps?:\/\/[^\s"'<>)\\]+|(?<=["'(=]\s*)\/\/[a-z0-9-]+\.[a-z]{2,}[^\s"'<>)]*/gi;
  let m;
  while ((m = re.exec(text))) {
    if (!ERLAUBTE_ADRESSEN.some((r) => r.test(m[0]))) liste.push(`${name}: fremde Adresse „${m[0]}“`);
  }
}

let bauOrdner = null;

async function bauen() {
  const start = performance.now();
  nodePruefen();
  const arg = argumenteLesen(process.argv.slice(2));
  if (arg.hilfe) { console.log(HILFE); return 0; }
  const ziel = arg.ziel;

  console.log(fett('Dein Adventskalender – Demo bauen'));
  console.log(`  Quelle: ${grau(KALENDER_ORDNER)}`);
  console.log(`  Ziel:   ${grau(ziel)}`);

  for (const p of ['index.html', 'start.js']) if (!istDatei(path.join(DEMO, p))) abbrechen(`Datei fehlt: kalender/demo/${p}`);
  for (const p of ['kalender.js', 'platzhalter-fotos.js']) if (!istDatei(path.join(KALENDER_ORDNER, 'shared', p))) abbrechen(`Datei fehlt: kalender/shared/${p}`);
  if (!istOrdner(path.join(KALENDER_ORDNER, 'fonts'))) abbrechen('Ordner fehlt: kalender/fonts/');
  if (liegtIn(KALENDER_ORDNER, ziel) || liegtIn(REPO_ORDNER, ziel) || liegtIn(ziel, KALENDER_ORDNER)) abbrechen('Das Ziel darf weder in kalender/ liegen noch den Projektordner enthalten.');
  zielPruefen(ziel, KENNUNG);

  const ansichten = ansichtenLaden();
  const jahr = new Date().getFullYear();        // Vorgabe; im Browser setzt start.js das laufende Jahr ein
  const bau = await bauordnerAnlegen(ziel);
  bauOrdner = bau;
  const ausgaben = {};

  // --- Ansichten: start.js vor kalender.js, Icons in den Kopf ---
  for (const a of ansichten) {
    let html = lesen(path.join(KALENDER_ORDNER, 'varianten', `${a.id}.html`));
    html = platzhalterEinsetzen(html, { titel: EINSTELLUNGEN.titel, jahr }, `varianten/${a.id}.html`);
    const kalenderTag = /<script\s+src="\.\.\/shared\/kalender\.js"><\/script>/g;
    if ((html.match(kalenderTag) || []).length !== 1) abbrechen(`varianten/${a.id}.html: erwartet genau ein <script src="../shared/kalender.js">.`);
    html = html.replace(kalenderTag, (t) => `<script src="../shared/start.js" data-ansicht="${a.id}"></script>\n${t}`);
    const ende = html.search(/<\/head\s*>/i);
    if (ende < 0) abbrechen(`varianten/${a.id}.html: kein </head>.`);
    html = html.slice(0, ende) + '<link rel="icon" href="../icon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="../apple-touch-icon.png">\n' + html.slice(ende);
    ausgaben[`kalender/${a.id}.html`] = html;
  }

  // --- Bausteine ---
  ausgaben['shared/kalender.js'] = lesen(path.join(KALENDER_ORDNER, 'shared', 'kalender.js'));
  ausgaben['shared/fotos.js'] = lesen(path.join(KALENDER_ORDNER, 'shared', 'platzhalter-fotos.js'));
  let startJs = lesen(path.join(DEMO, 'start.js'));
  if (!startJs.includes('/*@@KONFIG@@*/null')) abbrechen('kalender/demo/start.js ist beschädigt (Platzhalter fehlt).');
  startJs = startJs.replace('/*@@KONFIG@@*/null', () => jsonFuerScript({
    titel: EINSTELLUNGEN.titel, speicher: EINSTELLUNGEN.speicher, zeitzone: EINSTELLUNGEN.zeitzone,
    standardTag: EINSTELLUNGEN.standardTag, varianten: ansichten.map((a) => ({ id: a.id, name: a.name })),
    startUrl: '../index.html', startText: EINSTELLUNGEN.startText, testTitel: EINSTELLUNGEN.testTitel,
    testHinweis: EINSTELLUNGEN.testHinweis, fusszeile: { ...CREDIT }
  }));
  ausgaben['shared/start.js'] = startJs;

  // --- Vorschaubilder ---
  const vorschauen = {};
  const vorschauOrdner = path.join(DEMO, 'vorschau');
  if (istOrdner(vorschauOrdner)) {
    for (const n of fs.readdirSync(vorschauOrdner)) {
      if (!/^[\w-]+\.(webp|jpg|png)$/.test(n)) continue;
      const buf = fs.readFileSync(path.join(vorschauOrdner, n));
      await schreiben(path.join(bau, 'vorschau', n), buf);
      const id = n.replace(/\.\w+$/, '');
      if (n.endsWith('.webp')) { const m = webpMasse(buf); if (m) vorschauen[id] = m; }
    }
  }
  const ohneBild = ansichten.filter((a) => !vorschauen[a.id]).map((a) => a.id);

  // --- Startseite ---
  let index = lesen(path.join(DEMO, 'index.html'));
  for (const p of ['<!--@@KARTEN@@-->', '<!--@@FUSS@@-->', KENNUNG]) if (!index.includes(p)) abbrechen(`kalender/demo/index.html ist beschädigt (${p} fehlt).`);
  const links = [];
  if (arg.impressum) links.push(`<a href="${htmlText(arg.impressum)}" rel="noopener">Impressum</a>`);
  if (arg.datenschutz) links.push(`<a href="${htmlText(arg.datenschutz)}" rel="noopener">Datenschutz</a>`);
  index = index.replace('<!--@@KARTEN@@-->', () => kartenHtml(ansichten, vorschauen))
    .replace('<!--@@FUSS@@-->', () => (links.length ? `<p class="fuss-links">${links.join('\n        ')}</p>` : ''))
    .split('@@STANDARDTAG@@').join(String(EINSTELLUNGEN.standardTag));
  ausgaben['index.html'] = index;
  ausgaben['.nojekyll'] = '';

  // --- Prüfen: keine Anfragen an fremde Server ---
  const probleme = [];
  for (const [name, text] of Object.entries(ausgaben)) {
    if (/\.(html|js|css)$/.test(name)) fremdeAdressen(name, text, probleme);
  }
  for (const n of fs.readdirSync(path.join(KALENDER_ORDNER, 'fonts')).filter((x) => x.endsWith('.css'))) {
    fremdeAdressen(`fonts/${n}`, lesen(path.join(KALENDER_ORDNER, 'fonts', n)), probleme);
  }
  if (probleme.length) abbrechen(`Unerlaubtes in der Demo:\n  - ${probleme.slice(0, 30).join('\n  - ')}`);

  for (const [name, inhalt] of Object.entries(ausgaben)) await schreiben(path.join(bau, name), inhalt);
  await ordnerKopieren(path.join(KALENDER_ORDNER, 'fonts'), path.join(bau, 'fonts'));
  for (const n of ['icon.svg', 'apple-touch-icon.png']) {
    const q = path.join(KALENDER_ORDNER, 'icons', n);
    if (!istDatei(q)) abbrechen(`Datei fehlt: kalender/icons/${n}`);
    await fsp.copyFile(q, path.join(bau, n));
  }

  const liste = await alleDateien(bau);
  await zielErsetzen(bau, ziel);
  bauOrdner = null;

  const groesse = liste.reduce((s, n) => s + fs.statSync(path.join(ziel, n)).size, 0);
  const sek = ((performance.now() - start) / 1000).toFixed(1).replace('.', ',');
  console.log(`\n  ${ansichten.length} Ansichten · ${liste.length} Dateien · ${groesseText(groesse)} · ${sek} s` +
    (ohneBild.length ? `\n  ohne Vorschaubild: ${ohneBild.join(', ')}` : ''));
  console.log(`\n${gruen('Fertig')}: ${ziel}`);
  console.log('  Ansehen: npm run ansehen -- docs   ·   Veröffentlichen: GitHub → Settings → Pages → Branch main, Ordner /docs');
  return 0;
}

await ausfuehren(bauen, async () => { if (bauOrdner) await fsp.rm(bauOrdner, { recursive: true, force: true, maxRetries: 5 }); });
