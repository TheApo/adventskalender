/*
 * Dein Adventskalender – gemeinsame Helfer für werkzeuge/bauen.mjs und werkzeuge/demo-bauen.mjs
 * (Ausgabe, Dateien, Titel und Jahr in die Ansichten einsetzen, Zielordner sicher ersetzen).
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const WERKZEUG_ORDNER = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ORDNER = path.resolve(WERKZEUG_ORDNER, '..');
export const KALENDER_ORDNER = path.join(REPO_ORDNER, 'kalender');

/** Fußzeile im Menü jedes Kalenders und auf der Startseite der Demo */
export const CREDIT = Object.freeze({
  text: 'Dein Adventskalender – made by Dirk Aporius',
  link: 'www.apo-games.de',
  url: 'https://www.apo-games.de'
});

// ---------------------------------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------------------------------

const FARBIG = process.stdout.isTTY && !process.env.NO_COLOR;
const farbe = (code) => (text) => (FARBIG ? `\x1b[${code}m${text}\x1b[0m` : String(text));
export const gelb = farbe('33'), rot = farbe('31'), gruen = farbe('32'), grau = farbe('90'), fett = farbe('1');

export class Abbruch extends Error {}
export function abbrechen(text) { throw new Abbruch(text); }

export function groesseText(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2).replace('.', ',')} MB`;
}

export function nodePruefen() {
  const [haupt, neben] = process.versions.node.split('.').map(Number);
  if (haupt < 20 || (haupt === 20 && neben < 9)) {
    abbrechen(`Node ${process.versions.node} ist zu alt – bitte Node 20.9 oder neuer installieren (https://nodejs.org).`);
  }
}

export function htmlText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** JSON, das sicher in einem <script> stehen kann */
export function jsonFuerScript(wert) {
  return JSON.stringify(wert).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

// ---------------------------------------------------------------------------------------------------
// Dateien
// ---------------------------------------------------------------------------------------------------

function vergleichbar(p) {
  const r = path.resolve(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
}
/** true, wenn kind gleich eltern ist oder darin liegt */
export function liegtIn(kind, eltern) {
  const rel = path.relative(vergleichbar(eltern), vergleichbar(kind));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
export function istOrdner(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
export function istDatei(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
export function lesen(p) { return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''); }

export async function schreiben(datei, inhalt) {
  await fsp.mkdir(path.dirname(datei), { recursive: true });
  await fsp.writeFile(datei, inhalt);
}

export async function ordnerKopieren(von, nach, filter = () => true) {
  let anzahl = 0;
  await fsp.mkdir(nach, { recursive: true });
  for (const e of await fsp.readdir(von, { withFileTypes: true })) {
    const a = path.join(von, e.name), b = path.join(nach, e.name);
    if (!filter(e.name, a)) continue;
    if (e.isDirectory()) anzahl += await ordnerKopieren(a, b, filter);
    else if (e.isFile()) { await fsp.copyFile(a, b); anzahl++; }
  }
  return anzahl;
}

export async function alleDateien(ordner, basis = ordner) {
  const r = [];
  for (const e of await fsp.readdir(ordner, { withFileTypes: true })) {
    const p = path.join(ordner, e.name);
    if (e.isDirectory()) r.push(...await alleDateien(p, basis));
    else r.push(path.relative(basis, p).split(path.sep).join('/'));
  }
  return r;
}

// ---------------------------------------------------------------------------------------------------
// Ansichten
// ---------------------------------------------------------------------------------------------------

/** Liste der Ansichten aus kalender/ansichten.json: [{ id, name, titel, satz }] */
export function ansichtenLaden() {
  const datei = path.join(KALENDER_ORDNER, 'ansichten.json');
  if (!istDatei(datei)) abbrechen(`Datei fehlt: ${datei}\n  Ist das Projekt vollständig heruntergeladen?`);
  const liste = JSON.parse(lesen(datei));
  if (!Array.isArray(liste) || !liste.length) abbrechen('kalender/ansichten.json ist leer oder beschädigt.');
  for (const a of liste) {
    if (!a || !/^[a-z][a-z0-9-]*$/.test(a.id || '') || !a.name) abbrechen('kalender/ansichten.json ist beschädigt (Eintrag ohne id/name).');
    if (!istDatei(path.join(KALENDER_ORDNER, 'varianten', `${a.id}.html`))) abbrechen(`Ansicht fehlt: kalender/varianten/${a.id}.html`);
  }
  return liste;
}

// ---------------------------------------------------------------------------------------------------
// Sprachen (kalender/i18n/<code>.json – verschachtelt, in allen Sprachen dieselben Schlüssel)
// ---------------------------------------------------------------------------------------------------

export const SPRACH_ORDNER = path.join(KALENDER_ORDNER, 'i18n');
export const QUELLSPRACHE = 'de';

/** verfügbare Sprachen (Dateinamen in kalender/i18n/) */
export function verfuegbareSprachen() {
  if (!istOrdner(SPRACH_ORDNER)) return [];
  return fs.readdirSync(SPRACH_ORDNER).filter((n) => /^[a-z]{2,3}\.json$/.test(n)).map((n) => n.slice(0, -5)).sort();
}

function flach(o, p = '', z = {}) {
  for (const [k, v] of Object.entries(o)) {
    const s = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !('other' in v)) flach(v, s, z); else z[s] = v;
  }
  return z;
}

/**
 * Lädt die Sprachpakete (Deutsch immer mit – es ist die Rückfallsprache) und meldet je Sprache die Schlüssel,
 * die gegenüber Deutsch fehlen (dort erscheint dann der deutsche Text).
 */
export function sprachpaketeLaden(codes) {
  const pakete = {}, fehlend = {};
  for (const c of [...new Set([QUELLSPRACHE, ...codes])]) {
    const datei = path.join(SPRACH_ORDNER, `${c}.json`);
    if (!istDatei(datei)) abbrechen(`Sprachdatei fehlt: kalender/i18n/${c}.json`);
    let roh;
    try { roh = JSON.parse(lesen(datei)); } catch (e) { abbrechen(`kalender/i18n/${c}.json ist kein gültiges JSON – ${e.message}`); }
    pakete[c] = flach(roh);
  }
  for (const c of Object.keys(pakete)) {
    if (c === QUELLSPRACHE) continue;
    fehlend[c] = Object.keys(pakete[QUELLSPRACHE]).filter((k) => !(k in pakete[c]));
  }
  return { pakete, fehlend };
}

/** Inhalt von shared/sprachen.js (alle Pakete, flach) */
export function sprachenJs(pakete) {
  return '/* erzeugt aus kalender/i18n/*.json – Änderungen bitte dort */\nwindow.I18N_DATEN = ' + jsonFuerScript(pakete) + ';\n';
}

const BUNT = ['c-k', 'c-s', 'c-p', 'c-t'];
function bunt(wort, versatz = 0) {
  return Array.from(wort).map((z, i) => `<span class="${BUNT[(i + versatz) % BUNT.length]}">${htmlText(z)}</span>`).join('');
}

/** Titel in zwei Teile: erstes Wort (groß) und Rest – „Dein“ + „Adventskalender“ */
export function titelTeile(titel) {
  const woerter = String(titel).trim().split(/\s+/).filter(Boolean);
  return { a: woerter[0] || '', b: woerter.slice(1).join(' ') };
}

/**
 * Setzt Titel und Jahr in eine Ansicht ein. Platzhalter: {{TITEL}}, {{TITEL_A}}, {{TITEL_B}} (erstes Wort / Rest),
 * {{TITEL_A_BUNT}}, {{TITEL_B_BUNT}} (bunte Buchstaben), {{TITEL_A_ERSTES}}, {{TITEL_A_REST}} (Initiale),
 * {{TITEL_A_LAENGE}}, {{TITEL_B_LAENGE}} (Zeichenzahl für die Schriftgröße), {{JAHR}}.
 */
export function platzhalterEinsetzen(html, { titel, jahr }, wo = 'Ansicht') {
  const { a, b } = titelTeile(titel);
  const zeichenA = Array.from(a), zeichenB = Array.from(b);
  const werte = {
    TITEL: htmlText(titel.trim()),
    TITEL_A: htmlText(a),
    TITEL_B: htmlText(b),
    TITEL_A_BUNT: bunt(a),
    TITEL_B_BUNT: bunt(b, 1),
    TITEL_A_ERSTES: htmlText(zeichenA[0] || ''),
    TITEL_A_REST: htmlText(zeichenA.slice(1).join('')),
    TITEL_A_LAENGE: String(Math.max(1, zeichenA.length)),
    TITEL_B_LAENGE: String(Math.max(1, zeichenB.length)),
    JAHR: String(jahr)
  };
  const aus = html.replace(/\{\{([A-Z_]+)\}\}/g, (alles, name) => (name in werte ? werte[name] : alles));
  const rest = aus.match(/\{\{[A-Z_]+\}\}/);
  if (rest) abbrechen(`${wo}: unbekannter Platzhalter ${rest[0]}`);
  return aus;
}

// ---------------------------------------------------------------------------------------------------
// Zielordner sicher ersetzen
// ---------------------------------------------------------------------------------------------------

/** Bricht ab, wenn das Ziel nicht leer ist und nicht von diesem Werkzeug stammt (Kennung in index.html). */
export function zielPruefen(ziel, kennung) {
  if (!fs.existsSync(ziel)) return;
  if (!istOrdner(ziel)) abbrechen(`Ziel ist eine Datei, kein Ordner: ${ziel}`);
  if (path.parse(path.resolve(ziel)).root === path.resolve(ziel)) abbrechen('Als Ziel ist kein ganzes Laufwerk erlaubt.');
  const inhalt = fs.readdirSync(ziel).filter((n) => n !== '.git');
  if (!inhalt.length) return;
  const index = path.join(ziel, 'index.html');
  if (!(istDatei(index) && lesen(index).includes(kennung))) {
    abbrechen(`Der Zielordner ist nicht leer und stammt nicht von diesem Werkzeug:\n  ${ziel}\n` +
      '  Zur Sicherheit wird nichts gelöscht. Bitte einen leeren Ordner oder ein anderes --ziel angeben.');
  }
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function umbenennen(von, nach) {
  for (let versuch = 0; ; versuch++) {
    try { await fsp.rename(von, nach); return; } catch (e) {
      if (versuch >= 6 || !['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'].includes(e.code)) throw e;
      await warte(150 * (versuch + 1));
    }
  }
}

/** Neuer Bauordner neben dem Ziel (gleiches Laufwerk → schnelles Umbenennen) */
export async function bauordnerAnlegen(ziel) {
  const eltern = path.dirname(path.resolve(ziel));
  await fsp.mkdir(eltern, { recursive: true });
  const bau = path.join(eltern, `.${path.basename(ziel)}.bau-${crypto.randomBytes(4).toString('hex')}`);
  await fsp.mkdir(bau, { recursive: true });
  return bau;
}

/**
 * Ersetzt den Inhalt des Ziels durch den Bauordner. Ein .git-Ordner im Ziel bleibt erhalten.
 * Klemmt etwas (Datei in einem Programm geöffnet), wird der alte Stand zurückgestellt.
 */
export async function zielErsetzen(bau, ziel) {
  if (!fs.existsSync(ziel)) { await umbenennen(bau, ziel); return; }
  const alt = path.join(path.dirname(path.resolve(ziel)), `.${path.basename(ziel)}.alt-${crypto.randomBytes(4).toString('hex')}`);
  await fsp.mkdir(alt);
  const verschoben = [];
  try {
    for (const n of await fsp.readdir(ziel)) {
      if (n === '.git') continue;
      await umbenennen(path.join(ziel, n), path.join(alt, n));
      verschoben.push(n);
    }
  } catch (e) {
    for (const n of verschoben) await fsp.rename(path.join(alt, n), path.join(ziel, n)).catch(() => {});
    await fsp.rm(alt, { recursive: true, force: true }).catch(() => {});
    abbrechen(`Der Zielordner ist gesperrt (${e.code || e.message}) – vermutlich ist eine Datei darin geöffnet.\n  ${ziel}\n` +
      '  Bitte das Programm schließen und noch einmal bauen. Der alte Stand ist unverändert.');
  }
  for (const n of await fsp.readdir(bau)) await umbenennen(path.join(bau, n), path.join(ziel, n));
  await fsp.rm(bau, { recursive: true, force: true, maxRetries: 5 });
  await fsp.rm(alt, { recursive: true, force: true, maxRetries: 5 }).catch(() => {
    console.log(`  ${gelb('Warnung:')} alter Stand konnte nicht gelöscht werden: ${alt}`);
  });
}

/** Startet ein Hauptprogramm und setzt den Exit-Code (0 fertig, 1 mit Fehlern, 2 abgebrochen). */
export async function ausfuehren(hauptprogramm, aufraeumen) {
  try {
    process.exitCode = await hauptprogramm();
  } catch (e) {
    if (aufraeumen) await aufraeumen().catch(() => {});
    if (e instanceof Abbruch) console.error(`\n${rot('Abgebrochen:')} ${e.message}\nEs wurde nichts verändert.`);
    else console.error(`\n${rot('Unerwarteter Fehler:')} ${(e && e.stack) || e}\nEs wurde nichts verändert.`);
    process.exitCode = 2;
  }
}
