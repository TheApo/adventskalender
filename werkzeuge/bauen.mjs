#!/usr/bin/env node
/*
 * Dein Adventskalender – eigenen Kalender bauen
 * =============================================
 * Liest einstellungen.json und die Bilder aus bilder/, verkleinert die Bilder (WebP in vier Größen) und schreibt
 * einen fertigen, rein statischen Kalender nach ausgabe/. Den INHALT von ausgabe/ auf einen beliebigen Webspace
 * hochladen – PHP oder eine Datenbank sind nicht nötig.
 *
 * Einmalig vorher (im Projektordner):   npm install
 * Aufruf:                               npm run bauen      (oder: node werkzeuge/bauen.mjs [Optionen])
 *
 * Optionen:
 *   --bilder <ordner>         anderer Bilder-Ordner                 (Standard: bilder/)
 *   --einstellungen <datei>   andere Einstellungsdatei              (Standard: einstellungen.json)
 *   --ziel <ordner>           anderer Ausgabeordner, wird ersetzt   (Standard: ausgabe/)
 *   --hilfe                   diese Hilfe
 *
 * Ergebnis (ausgabe/):
 *   index.html                Lader (rechnet „heute“ im Browser aus)
 *   daten.json                Angaben zu allen 24 Tagen (Maße, Farbe, Bildunterschrift, Dateiname)
 *   web/                      verkleinerte Bilder <tag>-<größe>-<zufall>.webp (k/q = Quadrat 480/960 px,
 *                             m/l = lange Kante 1000/1800 px), Einzelfotos <tag>-e<nr>-<größe>-<zufall>.webp
 *   varianten/, shared/, fonts/, Icons, manifest.webmanifest
 * Der zufällige Namensteil wird bei jedem Bau neu gewürfelt. Er schützt nur gegen Erraten – wer daten.json liest,
 * findet auch die Bilder künftiger Tage. Gegen neugierige Kinder reicht das; ein Tresor ist es nicht.
 *
 * Exit-Code: 0 = fertig (Warnungen möglich), 1 = gebaut, aber mit Fehlern, 2 = abgebrochen (nichts verändert).
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  REPO_ORDNER, KALENDER_ORDNER, CREDIT, abbrechen, gelb, rot, gruen, grau, fett, groesseText, nodePruefen,
  htmlText, jsonFuerScript, liegtIn, istOrdner, istDatei, lesen, ansichtenLaden, platzhalterEinsetzen,
  zielPruefen, bauordnerAnlegen, zielErsetzen, ausfuehren, titelTeile, verfuegbareSprachen, sprachpaketeLaden, sprachenJs
} from './gemeinsam.mjs';

const KENNUNG = 'DEIN-ADVENTSKALENDER-AUSGABE';      // steht in jeder gebauten index.html
const VORLAGE = path.join(KALENDER_ORDNER, 'vorlage', 'index.html');

// Bildgrößen: quadratisch mittig beschnitten bzw. lange Kante begrenzt, nie hochskaliert
const GROESSEN = [
  { g: 'k', art: 'quadrat', px: 480 },
  { g: 'q', art: 'quadrat', px: 960 },
  { g: 'm', art: 'kante', px: 1000 },
  { g: 'l', art: 'kante', px: 1800 }
];

const ENDUNGEN = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);
const BEKANNT_UNPASSEND = new Set(['heic', 'heif', 'gif', 'tif', 'tiff', 'bmp', 'jfif', 'raw', 'dng', 'cr2', 'nef', 'arw', 'psd']);
const STILL_IGNORIEREN = new Set(['texte.txt', 'lies-mich.md', 'lies-mich.txt', '.gitkeep', 'thumbs.db', 'desktop.ini']);
const ICONS = ['icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const MAX_EINZEL = 60;
const KLEIN_PX = 1000;
const GROSS_BYTES = 15 * 1024 * 1024;
const MAX_MEGAPIXEL = 50;

const warnungen = [];
const fehler = [];
let fortschrittAktiv = false;
function zeile(text) {
  if (fortschrittAktiv) process.stdout.write('\r' + ' '.repeat(40) + '\r');
  console.log(text);
}
function warnung(text) { warnungen.push(text); zeile(`  ${gelb('Warnung:')} ${text}`); }
function fehlerMelden(text) { fehler.push(text); zeile(`  ${rot('FEHLER:')} ${text}`); }

function liste(zahlen) {
  const teile = [];
  for (let i = 0; i < zahlen.length; i++) {
    let j = i;
    while (j + 1 < zahlen.length && zahlen[j + 1] === zahlen[j] + 1) j++;
    teile.push(j - i >= 2 ? `${zahlen[i]}–${zahlen[j]}` : (j > i ? `${zahlen[i]}, ${zahlen[j]}` : `${zahlen[i]}`));
    i = j;
  }
  return teile.join(', ');
}

// ---------------------------------------------------------------------------------------------------
// Argumente
// ---------------------------------------------------------------------------------------------------

const HILFE = `
Dein Adventskalender – eigenen Kalender bauen

  npm run bauen        (oder: node werkzeuge/bauen.mjs [Optionen])

  --bilder <ordner>         Ordner mit 1.jpg … 24.jpg       (Standard: bilder/)
  --einstellungen <datei>   Einstellungsdatei               (Standard: einstellungen.json)
  --ziel <ordner>           Ausgabeordner, wird ersetzt     (Standard: ausgabe/)
  --hilfe                   diese Hilfe

Vorher einmalig im Projektordner: npm install
Danach den INHALT von ausgabe/ auf den Webspace hochladen. Ansehen vorab: npm run ansehen
`;

function argumenteLesen(argv) {
  const werte = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--hilfe' || a === '--help' || a === '-h') { werte.hilfe = true; continue; }
    const m = /^--(bilder|ziel|einstellungen)(?:=(.*))?$/.exec(a);
    if (!m) abbrechen(`Unbekannte Angabe „${a}“. Hilfe: npm run bauen -- --hilfe`);
    let wert = m[2];
    if (wert === undefined) {
      wert = argv[++i];
      if (wert === undefined || wert.startsWith('--')) abbrechen(`Nach --${m[1]} fehlt der Ordner bzw. die Datei.`);
    }
    if (!wert.trim()) abbrechen(`--${m[1]} ist leer.`);
    werte[m[1]] = path.resolve(process.cwd(), wert);
  }
  return werte;
}

// ---------------------------------------------------------------------------------------------------
// einstellungen.json
// ---------------------------------------------------------------------------------------------------

function jsonFehlerText(text, e) {
  const m = /position (\d+)/.exec(e.message);
  if (!m) return e.message;
  const pos = Number(m[1]);
  const vorher = text.slice(0, pos);
  const zeileNr = vorher.split('\n').length;
  return `Zeile ${zeileNr}: ${e.message}. Häufig: fehlendes Komma, Komma nach dem letzten Eintrag oder „“ statt "".`;
}

function einstellungenLaden(datei, ansichten) {
  if (!istDatei(datei)) abbrechen(`Einstellungen nicht gefunden: ${datei}`);
  const text = lesen(datei);
  let roh;
  try { roh = JSON.parse(text); } catch (e) { abbrechen(`einstellungen.json ist kein gültiges JSON – ${jsonFehlerText(text, e)}`); }
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) abbrechen('einstellungen.json muss ein Objekt { … } sein.');

  const bekannt = new Set(['titel', 'jahr', 'ansichten', 'standard_ansicht', 'sprachen', 'sprache', 'testschluessel', 'zeitzone', 'webp_qualitaet']);
  for (const k of Object.keys(roh)) if (!bekannt.has(k) && !k.startsWith('_')) warnung(`einstellungen.json: „${k}“ ist unbekannt und wird ignoriert.`);

  const ids = ansichten.map((a) => a.id);
  const e = {};

  // Sprachen: ["de", "en"] (Standard nur Deutsch); sprache: "auto" = Browsersprache beim ersten Besuch
  const da = verfuegbareSprachen();
  if (roh.sprachen === undefined) e.sprachen = ['de'];
  else if (Array.isArray(roh.sprachen) && roh.sprachen.length && roh.sprachen.every((x) => typeof x === 'string')) {
    e.sprachen = [...new Set(roh.sprachen.map((x) => x.trim().toLowerCase()))];
    const falsch = e.sprachen.filter((x) => !da.includes(x));
    if (falsch.length) abbrechen(`„sprachen“: ${falsch.map((x) => JSON.stringify(x)).join(', ')} gibt es nicht (keine Datei kalender/i18n/<code>.json).\n  Möglich sind: ${da.join(', ')}`);
  } else abbrechen(`„sprachen“ muss eine Liste sein, z. B. ["de", "en"] (gelesen: ${JSON.stringify(roh.sprachen)}).`);
  if (roh.sprache === undefined || roh.sprache === '') e.sprache = e.sprachen.length > 1 ? 'auto' : e.sprachen[0];
  else if (roh.sprache === 'auto' || e.sprachen.includes(roh.sprache)) e.sprache = roh.sprache;
  else abbrechen(`„sprache“ muss "auto" oder eine der Sprachen aus „sprachen“ sein (${e.sprachen.join(', ')}), nicht ${JSON.stringify(roh.sprache)}.`);

  // Titel: Text (gilt für alle Sprachen) oder je Sprache { "de": "…", "en": "…" }
  const sauber = (x) => (typeof x === 'string' ? x.trim().replace(/\s+/g, ' ') : '');
  e.titelJeSprache = null;
  if (roh.titel && typeof roh.titel === 'object' && !Array.isArray(roh.titel)) {
    e.titelJeSprache = {};
    for (const [c, w] of Object.entries(roh.titel)) if (e.sprachen.includes(c) && sauber(w)) e.titelJeSprache[c] = sauber(w);
    for (const c of Object.keys(roh.titel)) if (!e.sprachen.includes(c)) warnung(`„titel“: ${JSON.stringify(c)} steht nicht in „sprachen“ und wird ignoriert.`);
    e.titel = e.titelJeSprache[e.sprachen[0]] || Object.values(e.titelJeSprache)[0] || '';
  } else e.titel = sauber(roh.titel);
  if (!e.titel) {
    e.titel = 'Dein Adventskalender';
    if (roh.titel !== undefined) warnung('„titel“ ist leer – „Dein Adventskalender“ wird benutzt.');
  }
  for (const t of [e.titel, ...Object.values(e.titelJeSprache || {})]) {
    const teile = titelTeile(t);
    if (t.length > 28 || Array.from(teile.a).length > 10) {
      warnung(`Langer Titel („${t}“): in manchen Ansichten wirkt er sehr klein oder bricht um – kurz ist besser, z. B. „Omas Adventskalender“.`);
    }
  }

  const jetzt = new Date().getFullYear();
  if (roh.jahr === undefined) { e.jahr = jetzt; warnung(`„jahr“ fehlt – ${jetzt} wird benutzt.`); }
  else if (!Number.isInteger(roh.jahr) || roh.jahr < 2000 || roh.jahr > 2100) abbrechen(`„jahr“ muss eine Jahreszahl sein, z. B. "jahr": ${jetzt} (gelesen: ${JSON.stringify(roh.jahr)}).`);
  else e.jahr = roh.jahr;
  if (e.jahr < jetzt) warnung(`„jahr“ ist ${e.jahr} – der Advent ist vorbei, alle Tage sind sofort offen.`);

  // Ansichten: "alle" | ["tueren", …]
  const auswahl = roh.ansichten === undefined ? 'alle' : roh.ansichten;
  if (auswahl === 'alle') e.ansichten = ids.slice();
  else if (typeof auswahl === 'string' && ids.includes(auswahl)) e.ansichten = [auswahl];
  else if (Array.isArray(auswahl)) {
    if (!auswahl.length) abbrechen('„ansichten“ ist leer. Entweder "alle" oder z. B. ["tueren"] bzw. ["tueren", "kranz"].');
    const falsch = auswahl.filter((x) => !ids.includes(x));
    if (falsch.length) abbrechen(`„ansichten“: ${falsch.map((x) => JSON.stringify(x)).join(', ')} gibt es nicht.\n  Möglich sind: ${ids.join(', ')}`);
    e.ansichten = [...new Set(auswahl)];
    if (e.ansichten.length !== auswahl.length) warnung('„ansichten“: doppelte Einträge werden nur einmal genommen.');
  } else {
    abbrechen(`„ansichten“ muss "alle" oder eine Liste sein, z. B. ["tueren"] (gelesen: ${JSON.stringify(auswahl)}).\n  Möglich sind: ${ids.join(', ')}`);
  }

  if (roh.standard_ansicht === undefined || roh.standard_ansicht === '') e.standard = e.ansichten[0];
  else if (typeof roh.standard_ansicht !== 'string' || !ids.includes(roh.standard_ansicht)) {
    abbrechen(`„standard_ansicht“: ${JSON.stringify(roh.standard_ansicht)} gibt es nicht. Möglich sind: ${ids.join(', ')}`);
  } else if (!e.ansichten.includes(roh.standard_ansicht)) {
    abbrechen(`„standard_ansicht“ ist "${roh.standard_ansicht}", steht aber nicht in „ansichten“ (${e.ansichten.join(', ')}).\n` +
      `  Bitte "${roh.standard_ansicht}" bei „ansichten“ ergänzen oder eine der gewählten Ansichten als standard_ansicht nehmen.`);
  } else e.standard = roh.standard_ansicht;
  // Standard zuerst in der Menüliste? Nein – Reihenfolge wie in ansichten.json, damit das Menü vertraut bleibt.
  e.ansichten = ids.filter((id) => e.ansichten.includes(id));

  e.testschluessel = '';
  if (roh.testschluessel !== undefined && roh.testschluessel !== null) {
    if (typeof roh.testschluessel !== 'string') abbrechen('„testschluessel“ muss Text in Anführungszeichen sein, z. B. "testschluessel": "tannenbaum-7341".');
    e.testschluessel = roh.testschluessel.trim();
    if (e.testschluessel && !/^[A-Za-z0-9._~-]+$/.test(e.testschluessel)) {
      abbrechen('„testschluessel“: bitte nur Buchstaben a–z, Ziffern und - _ . ~ (keine Leerzeichen, keine Umlaute).');
    }
    if (e.testschluessel && e.testschluessel.length < 10) warnung('Der Testschlüssel ist kurz – mindestens 10 Zeichen sind besser (er steht verschlüsselt in index.html).');
  }

  e.zeitzone = 'Europe/Berlin';
  if (roh.zeitzone !== undefined) {
    try { new Intl.DateTimeFormat('de-DE', { timeZone: String(roh.zeitzone) }); e.zeitzone = String(roh.zeitzone); }
    catch { warnung(`Zeitzone „${roh.zeitzone}“ unbekannt – „Europe/Berlin“ wird benutzt.`); }
  }

  e.qualitaet = 82;
  if (roh.webp_qualitaet !== undefined) {
    if (Number.isInteger(roh.webp_qualitaet) && roh.webp_qualitaet >= 30 && roh.webp_qualitaet <= 100) e.qualitaet = roh.webp_qualitaet;
    else warnung(`webp_qualitaet ${JSON.stringify(roh.webp_qualitaet)} ungültig (30–100) – 82 wird benutzt.`);
  }
  return e;
}

// ---------------------------------------------------------------------------------------------------
// Bilder und Bildunterschriften finden
// ---------------------------------------------------------------------------------------------------

function natuerlichVergleichen(a, b) {
  const ta = a.toLowerCase().match(/\d+|\D+/g) || [];
  const tb = b.toLowerCase().match(/\d+|\D+/g) || [];
  for (let i = 0; i < Math.min(ta.length, tb.length); i++) {
    const x = ta[i], y = tb[i];
    if (x === y) continue;
    if (/^\d/.test(x) && /^\d/.test(y)) {
      const nx = x.replace(/^0+(?=\d)/, ''), ny = y.replace(/^0+(?=\d)/, '');
      if (nx.length !== ny.length) return nx.length - ny.length;
      if (nx !== ny) return nx < ny ? -1 : 1;
      continue;
    }
    return x < y ? -1 : 1;
  }
  return ta.length - tb.length || (a < b ? -1 : a > b ? 1 : 0);
}

function texteLesen(bilderOrdner) {
  const datei = path.join(bilderOrdner, 'texte.txt');
  const texte = {};
  if (!istDatei(datei)) return texte;
  const bytes = fs.readFileSync(datei);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch {
    warnung('texte.txt ist nicht als UTF-8 gespeichert – Umlaute werden geraten (bitte als UTF-8 speichern).');
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  text.replace(/^﻿/, '').split(/\r\n|\r|\n/).forEach((z0, nr) => {
    const z = z0.trim();
    if (!z || z.startsWith('#')) return;
    const m = /^(\d{1,2})\s*[=:]\s*(.*)$/.exec(z);
    if (!m) { warnung(`texte.txt Zeile ${nr + 1}: „${z}“ nicht verstanden (Form: 12 = Plätzchen backen).`); return; }
    const t = parseInt(m[1], 10);
    if (t < 1 || t > 24) { warnung(`texte.txt Zeile ${nr + 1}: Tag ${t} gibt es nicht (1–24).`); return; }
    if (texte[t] !== undefined) warnung(`texte.txt: Tag ${t} steht mehrfach drin – die letzte Zeile gilt.`);
    texte[t] = m[2].trim();
  });
  return texte;
}

function endung(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

function bilderFinden(bilderOrdner) {
  const kandidaten = {};
  const einzelOrdner = {};
  for (const e of fs.readdirSync(bilderOrdner, { withFileTypes: true })) {
    const name = e.name;
    if (name.startsWith('.')) continue;
    const voll = path.join(bilderOrdner, name);
    if (e.isDirectory()) {
      if (/^\d+$/.test(name) && String(parseInt(name, 10)) === name && +name >= 1 && +name <= 24) einzelOrdner[+name] = voll;
      else warnung(`bilder/${name}/ wird ignoriert (Ordner für Einzelfotos heißen 1 … 24, ohne führende Null).`);
      continue;
    }
    if (!e.isFile() || STILL_IGNORIEREN.has(name.toLowerCase())) continue;
    const m = /^(\d+)\.([A-Za-z0-9]+)$/.exec(name);
    const ext = endung(name);
    if (!m) {
      if (ENDUNGEN.has(ext) || BEKANNT_UNPASSEND.has(ext)) warnung(`bilder/${name} wird ignoriert: Tagesbilder heißen 1.jpg … 24.jpg.`);
      else warnung(`bilder/${name} ist unbekannt und wird ignoriert.`);
      continue;
    }
    const t = parseInt(m[1], 10);
    if (!ENDUNGEN.has(ext)) { warnung(`bilder/${name}: Format .${ext} geht nicht (erlaubt: jpg, png, webp, avif) – bitte z. B. als JPG speichern.`); continue; }
    if (String(t) !== m[1]) { warnung(`bilder/${name} wird ignoriert: bitte ohne führende Null benennen (${t}.${m[2]}).`); continue; }
    if (t < 1 || t > 24) { warnung(`bilder/${name} wird ignoriert: es gibt nur die Tage 1 bis 24.`); continue; }
    (kandidaten[t] ||= []).push({ datei: voll, name, mtime: fs.statSync(voll).mtimeMs });
  }

  const tage = {};
  for (let t = 1; t <= 24; t++) {
    const eintrag = { collage: null, einzel: [] };
    const k = kandidaten[t];
    if (k && k.length) {
      k.sort((a, b) => b.mtime - a.mtime || natuerlichVergleichen(a.name, b.name));
      eintrag.collage = k[0];
      if (k.length > 1) warnung(`Tag ${t}: mehrere Bilder (${k.map((x) => x.name).join(', ')}) – das zuletzt geänderte gilt: ${k[0].name}.`);
    }
    if (einzelOrdner[t]) {
      const dateien = [];
      for (const e of fs.readdirSync(einzelOrdner[t], { withFileTypes: true })) {
        if (e.name.startsWith('.') || !e.isFile() || STILL_IGNORIEREN.has(e.name.toLowerCase())) continue;
        const ext = endung(e.name);
        if (!ENDUNGEN.has(ext)) {
          warnung(`bilder/${t}/${e.name} wird ignoriert (${BEKANNT_UNPASSEND.has(ext) ? `Format .${ext} geht nicht` : 'kein Bild'}).`);
          continue;
        }
        const voll = path.join(einzelOrdner[t], e.name);
        dateien.push({ datei: voll, name: e.name, mtime: fs.statSync(voll).mtimeMs });
      }
      dateien.sort((a, b) => natuerlichVergleichen(a.name, b.name));
      if (dateien.length > MAX_EINZEL) { warnung(`bilder/${t}/: ${dateien.length} Einzelfotos – nur die ersten ${MAX_EINZEL} werden benutzt.`); dateien.length = MAX_EINZEL; }
      if (!dateien.length) warnung(`bilder/${t}/ ist leer – die Stories zeigen das Tagesbild.`);
      eintrag.einzel = dateien;
    }
    tage[t] = eintrag;
  }
  return tage;
}

// ---------------------------------------------------------------------------------------------------
// Bilder verkleinern
// ---------------------------------------------------------------------------------------------------

function hexFarbe(r, g, b) {
  return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
}
/** 'hoch' ab Seitenverhältnis 1 : 1,22, sonst 'quadrat' (Querformat zählt als 'quadrat') */
function formatVon(w, h) { return !w || !h ? '' : (h / w > 1.22 ? 'hoch' : 'quadrat'); }
function formatText(w, h) { return h / w > 1.22 ? 'hoch' : (w / h > 1.05 ? 'quer' : 'quadrat'); }

/** Dekodiert ein Bild einmal (EXIF-Drehung, sRGB) und schreibt alle vier Größen nach <basis>-<g>-<hash>.webp */
async function bildVerarbeiten(sharp, quelle, basis, hash, qualitaet) {
  const meta = await sharp(quelle.datei, { failOn: 'error' }).metadata();
  const { data, info } = await sharp(quelle.datei, { failOn: 'error' }).rotate().toColourspace('srgb')
    .raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  const roh = { raw: { width: info.width, height: info.height, channels: info.channels } };
  const stat = await sharp(data, roh).stats();
  const k = stat.channels;
  const farbe = k.length >= 3 ? hexFarbe(k[0].mean, k[1].mean, k[2].mean) : hexFarbe(k[0].mean, k[0].mean, k[0].mean);
  const alphaWeg = info.channels === 4 && stat.isOpaque;
  const dateien = [];
  try {
    for (const gr of GROESSEN) {
      let s = sharp(data, roh);
      if (alphaWeg) s = s.removeAlpha();
      if (gr.art === 'quadrat') {
        const seite = Math.min(gr.px, info.width, info.height);
        s = s.resize(seite, seite, { fit: 'cover', position: 'centre' });
      } else {
        s = s.resize(gr.px, gr.px, { fit: 'inside', withoutEnlargement: true });
      }
      const ziel = `${basis}-${gr.g}-${hash}.webp`;
      const aus = await s.webp({ quality: qualitaet, effort: 5 }).toFile(ziel);
      dateien.push({ g: gr.g, datei: ziel, bytes: aus.size, w: aus.width, h: aus.height });
    }
  } catch (e) {
    for (const gr of GROESSEN) fs.rmSync(`${basis}-${gr.g}-${hash}.webp`, { force: true });
    throw e;
  }
  return { w: info.width, h: info.height, farbe, format: meta.format, mp: (info.width * info.height) / 1e6, dateien };
}

async function parallel(aufgaben, anzahl) {
  let naechste = 0;
  async function arbeiter() { while (naechste < aufgaben.length) { const i = naechste++; await aufgaben[i](); } }
  await Promise.all(Array.from({ length: Math.min(anzahl, aufgaben.length) }, arbeiter));
}

function kurzHash(geheimnis, ...teile) {
  return crypto.createHash('sha256').update([geheimnis, ...teile].join(':')).digest('hex').slice(0, 10);
}

/** Grundfarbe einer Ansicht (für den Ladebildschirm): theme-color, sonst Hintergrund von html/body */
function grundfarbeVon(html) {
  const m = /<meta\b[^>]*\bname\s*=\s*["']?theme-color["']?[^>]*>/i.exec(html);
  const c = m && /\bcontent\s*=\s*["']?\s*(#[0-9a-f]{3,8})\b/i.exec(m[0]);
  if (c) return c[1];
  const regeln = /(?:^|[\s}])(?:html|body)(?:\s*,\s*(?:html|body))*\s*\{([^}]*)\}/g;
  let r;
  while ((r = regeln.exec(html))) {
    const bg = /background(?:-color)?\s*:\s*([^;}]+)/i.exec(r[1]);
    if (!bg) continue;
    const hex = /#[0-9a-f]{3,8}\b/i.exec(bg[1]);
    if (hex) return hex[0];
    const v = /var\(\s*(--[\w-]+)/.exec(bg[1]);
    if (v) {
      const def = new RegExp(v[1].replace(/-/g, '\\-') + '\\s*:\\s*(#[0-9a-f]{3,8})\\b', 'i').exec(html);
      if (def) return def[1];
    }
  }
  return null;
}

/** Kurzname für den Startbildschirm (iOS/Android zeigen etwa 12 Zeichen) */
function kurztitelVon(titel, jahr) {
  if (Array.from(titel).length <= 14) return titel;
  const { a } = titelTeile(titel);
  return Array.from(a).length <= 14 ? a : `Advent ${jahr}`;
}

// ---------------------------------------------------------------------------------------------------
// Hauptprogramm
// ---------------------------------------------------------------------------------------------------

let bauOrdner = null;

async function bauen() {
  const start = performance.now();
  nodePruefen();
  const arg = argumenteLesen(process.argv.slice(2));
  if (arg.hilfe) { console.log(HILFE); return 0; }

  const bilder = arg.bilder || path.join(REPO_ORDNER, 'bilder');
  const einstDatei = arg.einstellungen || path.join(REPO_ORDNER, 'einstellungen.json');
  const ziel = arg.ziel || path.join(REPO_ORDNER, 'ausgabe');

  console.log(fett('Dein Adventskalender – bauen'));
  console.log(`  Bilder:        ${grau(bilder)}`);
  console.log(`  Einstellungen: ${grau(einstDatei)}`);
  console.log(`  Ziel:          ${grau(ziel)}\n`);

  // --- Prüfungen vorab (bei Problemen wird nichts verändert) ---
  if (!istOrdner(bilder)) abbrechen(`Bilder-Ordner nicht gefunden: ${bilder}`);
  if (!istDatei(VORLAGE)) abbrechen(`Vorlage fehlt: ${VORLAGE}`);
  for (const d of ['kalender.js', 'fotos.js', 'i18n.js']) if (!istDatei(path.join(KALENDER_ORDNER, 'shared', d))) abbrechen(`kalender/shared/${d} fehlt.`);
  if (liegtIn(KALENDER_ORDNER, ziel) || liegtIn(bilder, ziel) || liegtIn(REPO_ORDNER, ziel)) abbrechen('Das Ziel darf den Projekt-, Kalender- oder Bilder-Ordner nicht enthalten.');
  if (liegtIn(ziel, bilder) || liegtIn(ziel, KALENDER_ORDNER)) abbrechen('Das Ziel darf nicht in bilder/ oder kalender/ liegen.');
  zielPruefen(ziel, KENNUNG);

  const ansichten = ansichtenLaden();
  console.log(fett('Einstellungen'));
  const einst = einstellungenLaden(einstDatei, ansichten);
  const gewaehlt = ansichten.filter((a) => einst.ansichten.includes(a.id));
  console.log(`  „${einst.titel}“ · Advent ${einst.jahr} · Zeitzone ${einst.zeitzone}`);
  console.log(`  Ansichten: ${gewaehlt.length === ansichten.length ? `alle ${ansichten.length}` : gewaehlt.map((a) => a.id).join(', ')}` +
    ` · Start: ${einst.standard}${gewaehlt.length === 1 ? ' (nur eine Ansicht – im Menü gibt es kein Umschalten)' : ''}`);
  const { pakete, fehlend } = sprachpaketeLaden(einst.sprachen);
  console.log(`  Sprachen: ${einst.sprachen.join(', ')}` + (einst.sprachen.length > 1 ? ` · beim ersten Besuch: ${einst.sprache === 'auto' ? 'Sprache des Browsers' : einst.sprache} (umschaltbar im Menü)` : ''));
  for (const c of einst.sprachen) {
    if (fehlend[c] && fehlend[c].length) warnung(`kalender/i18n/${c}.json: ${fehlend[c].length} Text(e) fehlen – dort erscheint Deutsch (z. B. ${fehlend[c].slice(0, 3).join(', ')}).`);
  }
  console.log(`  Testschlüssel: ${einst.testschluessel ? 'gesetzt – Testmodus mit ?test=<schlüssel>' : 'keiner (Testmodus aus)'} · WebP-Qualität ${einst.qualitaet}\n`);

  let sharp;
  try { sharp = (await import('sharp')).default; } catch (e) {
    abbrechen('Das Paket „sharp“ fehlt. Bitte einmalig im Projektordner „npm install“ ausführen.\n' +
      `  (Technische Meldung: ${String((e && e.message) || e).split('\n')[0]})`);
  }
  sharp.cache(false);
  sharp.concurrency(Math.max(1, Math.min(4, os.cpus().length)));

  const bau = await bauordnerAnlegen(ziel);
  bauOrdner = bau;
  const webOrdner = path.join(bau, 'web');
  await fsp.mkdir(webOrdner, { recursive: true });

  // --- Bilder ---
  console.log(fett('Bilder'));
  const texte = texteLesen(bilder);
  const gefunden = bilderFinden(bilder);
  const geheimnis = crypto.randomBytes(32).toString('hex');
  const aufgaben = [];
  const ergebnis = {};
  for (let t = 1; t <= 24; t++) {
    const e = gefunden[t];
    ergebnis[t] = { collage: null, einzel: [] };
    if (e.collage) {
      aufgaben.push(async () => {
        try { ergebnis[t].collage = await bildVerarbeiten(sharp, e.collage, path.join(webOrdner, String(t)), kurzHash(geheimnis, t), einst.qualitaet); }
        catch (err) { fehlerMelden(`Tag ${t}: ${e.collage.name} lässt sich nicht lesen (${String(err.message || err).split('\n')[0]}) – Platzhalter wird gezeigt.`); }
      });
    }
    e.einzel.forEach((q, idx) => {
      aufgaben.push(async () => {
        try { ergebnis[t].einzel[idx] = await bildVerarbeiten(sharp, q, path.join(webOrdner, `${t}-e${idx + 1}`), kurzHash(geheimnis, t), einst.qualitaet); }
        catch (err) { fehlerMelden(`Tag ${t}: Einzelfoto ${q.name} lässt sich nicht lesen (${String(err.message || err).split('\n')[0]}) – wird weggelassen.`); }
      });
    });
  }
  let erledigt = 0;
  const zeigen = process.stdout.isTTY;
  fortschrittAktiv = zeigen;
  await parallel(aufgaben.map((a) => async () => {
    await a();
    erledigt++;
    if (zeigen) process.stdout.write(`\r  verkleinere … ${erledigt}/${aufgaben.length}   `);
  }), Math.max(1, Math.min(3, os.cpus().length)));
  if (zeigen && aufgaben.length) process.stdout.write('\r' + ' '.repeat(40) + '\r');
  fortschrittAktiv = false;

  const tage = {};
  const ohneBild = [];
  let bytesGesamt = 0, dateienGesamt = 0;
  for (let t = 1; t <= 24; t++) {
    const quelleTag = gefunden[t];
    const r = ergebnis[t];
    const einzel = r.einzel.filter(Boolean);
    if (einzel.length !== quelleTag.einzel.length) {        // lückenlos nummerieren, falls eines nicht lesbar war
      einzel.forEach((ez, idx) => {
        for (const d of ez.dateien) {
          const neu = d.datei.replace(/-e\d+-([kqml])-([0-9a-f]{10})\.webp$/, `-e${idx + 1}-$1-$2.webp`);
          if (neu !== d.datei) { fs.renameSync(d.datei, neu); d.datei = neu; }
        }
      });
    }
    const c = r.collage;
    tage[t] = {
      bild: !!c,
      w: c ? c.w : 0,
      h: c ? c.h : 0,
      format: c ? formatVon(c.w, c.h) : '',
      farbe: c ? c.farbe : (einzel[0] ? einzel[0].farbe : ''),
      titel: texte[t] || '',
      einzel: einzel.length,
      hash: c || einzel.length ? kurzHash(geheimnis, t) : ''
    };
    for (const d of [...(c ? c.dateien : []), ...einzel.flatMap((ez) => ez.dateien)]) { bytesGesamt += d.bytes; dateienGesamt++; }

    const nr = String(t).padStart(2, ' ');
    if (c) {
      const bytes = c.dateien.reduce((s, d) => s + d.bytes, 0);
      zeile(`  Tag ${nr}  ${quelleTag.collage.name.padEnd(10)} ${`${c.w}×${c.h}`.padEnd(10)} ${formatText(c.w, c.h).padEnd(8)} → ${groesseText(bytes).padStart(7)}` +
        (einzel.length ? ` + ${einzel.length} Einzelfoto${einzel.length === 1 ? '' : 's'}` : '') + (tage[t].titel ? grau(`  „${tage[t].titel}“`) : ''));
      if (Math.max(c.w, c.h) < KLEIN_PX) warnung(`Tag ${t}: ${quelleTag.collage.name} ist klein (${c.w}×${c.h}) – wirkt auf großen Bildschirmen unscharf (besser 1200–2400 px).`);
      if (c.mp > MAX_MEGAPIXEL) warnung(`Tag ${t}: ${quelleTag.collage.name} hat ${c.mp.toFixed(0)} Megapixel – 2400 px an der langen Kante reichen völlig.`);
      if (fs.statSync(quelleTag.collage.datei).size > GROSS_BYTES) warnung(`Tag ${t}: ${quelleTag.collage.name} ist sehr groß (${groesseText(fs.statSync(quelleTag.collage.datei).size)}).`);
    } else {
      ohneBild.push(t);
      zeile(`  Tag ${nr}  ${gelb('fehlt')}${einzel.length ? ` (aber ${einzel.length} Einzelfotos)` : ''} → Platzhalter „Foto folgt“` + (tage[t].titel ? grau(`  „${tage[t].titel}“`) : ''));
    }
  }
  console.log('');

  const bauId = crypto.randomBytes(6).toString('hex');
  await fsp.writeFile(path.join(bau, 'daten.json'), JSON.stringify({ version: 1, jahr: einst.jahr, tage }, null, 1) + '\n', 'utf8');
  // leere Seite gegen Verzeichnislisten (sonst wären die Bildnamen auf manchen Webspaces sichtbar)
  await fsp.writeFile(path.join(webOrdner, 'index.html'), '<!DOCTYPE html><meta charset="utf-8"><title>Leer</title>\n', 'utf8');

  // --- Ansichten, Bausteine, Schriften ---
  console.log(fett('Dateien'));
  await fsp.mkdir(path.join(bau, 'varianten'), { recursive: true });
  const schriftDateien = new Set();
  const farben = {};
  for (const a of gewaehlt) {
    let html = lesen(path.join(KALENDER_ORDNER, 'varianten', `${a.id}.html`));
    html = platzhalterEinsetzen(html, { titel: einst.titel, jahr: einst.jahr }, `varianten/${a.id}.html`);
    farben[a.id] = grundfarbeVon(html);
    await fsp.writeFile(path.join(bau, 'varianten', `${a.id}.html`), html, 'utf8');
    for (const m of html.matchAll(/href="\.\.\/fonts\/([\w.-]+\.css)"/g)) schriftDateien.add(m[1]);
  }
  await fsp.mkdir(path.join(bau, 'shared'), { recursive: true });
  for (const d of ['kalender.js', 'fotos.js', 'i18n.js']) await fsp.copyFile(path.join(KALENDER_ORDNER, 'shared', d), path.join(bau, 'shared', d));
  await fsp.writeFile(path.join(bau, 'shared', 'sprachen.js'), sprachenJs(pakete), 'utf8');

  const fontsQuelle = path.join(KALENDER_ORDNER, 'fonts');
  const fontsZiel = path.join(bau, 'fonts');
  await fsp.mkdir(path.join(fontsZiel, 'lizenzen'), { recursive: true });
  let schriftBytes = 0;
  const kopiert = new Set();
  for (const css of schriftDateien) {
    const quelle = path.join(fontsQuelle, css);
    if (!istDatei(quelle)) abbrechen(`Schrift-Datei fehlt: kalender/fonts/${css}`);
    const text = lesen(quelle);
    await fsp.writeFile(path.join(fontsZiel, css), text, 'utf8');
    for (const m of text.matchAll(/url\(["']?([\w.-]+\.(?:woff2|woff|ttf|otf))["']?\)/g)) {
      if (kopiert.has(m[1])) continue;
      if (!istDatei(path.join(fontsQuelle, m[1]))) abbrechen(`Schrift-Datei fehlt: kalender/fonts/${m[1]}`);
      await fsp.copyFile(path.join(fontsQuelle, m[1]), path.join(fontsZiel, m[1]));
      schriftBytes += fs.statSync(path.join(fontsZiel, m[1])).size;
      kopiert.add(m[1]);
    }
  }
  if (istDatei(path.join(fontsQuelle, 'LIZENZEN.md'))) await fsp.copyFile(path.join(fontsQuelle, 'LIZENZEN.md'), path.join(fontsZiel, 'LIZENZEN.md'));
  if (istOrdner(path.join(fontsQuelle, 'lizenzen'))) {
    for (const n of fs.readdirSync(path.join(fontsQuelle, 'lizenzen'))) await fsp.copyFile(path.join(fontsQuelle, 'lizenzen', n), path.join(fontsZiel, 'lizenzen', n));
  }
  console.log(`  Ansichten: ${gewaehlt.map((a) => a.id).join(', ')}`);
  console.log(`  Schriften: ${kopiert.size} Dateien (${groesseText(schriftBytes)}), lokal – keine Anfragen an fremde Server`);

  // --- Icons, Manifest ---
  for (const n of ICONS) {
    const q = path.join(KALENDER_ORDNER, 'icons', n);
    if (istDatei(q)) await fsp.copyFile(q, path.join(bau, n));
  }
  if (istDatei(path.join(bau, 'icon.svg'))) {
    const svg = lesen(path.join(bau, 'icon.svg')).replace(/<title>[^<]*<\/title>/, `<title>${htmlText(einst.titel)}</title>`);
    await fsp.writeFile(path.join(bau, 'icon.svg'), svg, 'utf8');
  }
  const themeColor = farben[einst.standard] || '#1d3a33';
  const kurztitel = kurztitelVon(einst.titel, einst.jahr);
  const manifest = {
    name: einst.titel, short_name: kurztitel, description: 'Jeden Tag im Advent ein neues Foto.',
    lang: einst.sprache === 'auto' ? einst.sprachen[0] : einst.sprache, dir: 'ltr', start_url: './', scope: './', display: 'standalone', orientation: 'any',
    background_color: themeColor, theme_color: themeColor,
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
    ]
  };
  await fsp.writeFile(path.join(bau, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // --- index.html (Lader) ---
  let vorlage = lesen(VORLAGE);
  if (!vorlage.includes('/*@@KONFIG@@*/null') || !vorlage.includes('/*@@SPRACHE@@*/null') || !vorlage.includes('<!--@@KOPF@@-->') || !vorlage.includes(KENNUNG)) {
    abbrechen('kalender/vorlage/index.html ist beschädigt (Platzhalter fehlen).');
  }
  let schluessel = null;
  if (einst.testschluessel) {
    const salz = crypto.randomBytes(16).toString('hex');
    schluessel = { salz, hash: crypto.createHash('sha256').update(salz + einst.testschluessel, 'utf8').digest('hex') };
  }
  const lader = {
    jahr: einst.jahr,
    titel: einst.titel,
    titelJeSprache: einst.titelJeSprache,
    sprachen: einst.sprachen,
    sprache: einst.sprache,
    kurztitel,
    standardVariante: einst.standard,
    zeitzone: einst.zeitzone,
    testmodus: false,                       // Testwerkzeuge nur mit Testschlüssel
    testSchluessel: schluessel,
    varianten: gewaehlt.map((a) => ({ id: a.id, name: a.name, farbe: farben[a.id] })),
    speicher: `adventskalender:${einst.jahr}`,
    daten: `daten.json?b=${bauId}`,
    bau: bauId,
    themeColor,
    manifest: true,
    appleIcon: istDatei(path.join(bau, 'apple-touch-icon.png')),
    icon: istDatei(path.join(bau, 'icon.svg')) ? 'icon.svg' : '',
    fusszeile: { ...CREDIT }
  };
  const kopf = [
    `<meta name="theme-color" content="${htmlText(themeColor)}">`,
    '<link rel="manifest" href="manifest.webmanifest">',
    lader.icon ? '<link rel="icon" href="icon.svg" type="image/svg+xml">' : '',
    lader.appleIcon ? '<link rel="apple-touch-icon" href="apple-touch-icon.png">' : '',
    `<meta name="apple-mobile-web-app-title" content="${htmlText(kurztitel)}">`
  ].filter(Boolean).join('\n');
  const sprache = { titel: einst.titel, titelJeSprache: einst.titelJeSprache, sprachen: einst.sprachen, sprache: einst.sprache };
  vorlage = vorlage.replace('/*@@KONFIG@@*/null', () => jsonFuerScript(lader)).replace('/*@@SPRACHE@@*/null', () => jsonFuerScript(sprache))
    .replace('<!--@@KOPF@@-->', () => kopf)
    .split('@@TITEL@@').join(htmlText(einst.titel));
  await fsp.writeFile(path.join(bau, 'index.html'), vorlage, 'utf8');

  // --- Ziel ersetzen ---
  await zielErsetzen(bau, ziel);
  bauOrdner = null;

  const sek = ((performance.now() - start) / 1000).toFixed(1).replace('.', ',');
  console.log(`\n${fett('Ergebnis')}`);
  console.log(`  ${24 - ohneBild.length} von 24 Tagen mit Bild` + (ohneBild.length ? ` · ohne Bild (Platzhalter „Foto folgt“): ${gelb(liste(ohneBild))}` : ''));
  const einzelTage = Object.entries(tage).filter(([, d]) => d.einzel).map(([t, d]) => `${t} (${d.einzel})`);
  if (einzelTage.length) console.log(`  Einzelfotos für die Stories: Tag ${einzelTage.join(', ')}`);
  console.log(`  Bilder zusammen: ${groesseText(bytesGesamt)} in ${dateienGesamt} Dateien · Dauer ${sek} s`);
  if (warnungen.length) console.log(`  ${gelb(`${warnungen.length} Warnung${warnungen.length === 1 ? '' : 'en'}`)} (siehe oben)`);
  if (fehler.length) console.log(`  ${rot(`${fehler.length} Fehler`)} – trotzdem gebaut, betroffene Tage zeigen den Platzhalter.`);
  console.log(`\n${fehler.length ? gelb('Gebaut mit Fehlern') : gruen('Fertig')}: ${ziel}`);
  console.log('  Ansehen:    npm run ansehen' + (einst.testschluessel ? '   (Tage durchprobieren: Adresse mit ?test=<testschluessel>)' : ''));
  console.log('  Hochladen:  den INHALT von ausgabe/ per FTP in einen Ordner deines Webspace kopieren.');
  return fehler.length ? 1 : 0;
}

await ausfuehren(bauen, async () => { if (bauOrdner) await fsp.rm(bauOrdner, { recursive: true, force: true, maxRetries: 5 }); });
