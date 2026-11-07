#!/usr/bin/env node
/*
 * Dein Adventskalender – gebauten Kalender lokal ansehen
 * ======================================================
 * Kleiner Webserver nur für diesen Rechner (127.0.0.1), ohne zusätzliche Pakete.
 *
 *   npm run ansehen                  zeigt ausgabe/  (eigener Kalender, nach „npm run bauen“)
 *   npm run ansehen -- docs          zeigt docs/     (Demo)
 *   npm run ansehen -- --port 8090   anderer Port (Standard 8080, belegt → der nächste freie)
 *
 * Beenden mit Strg+C.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { REPO_ORDNER, istDatei, istOrdner, liegtIn, fett, gruen, grau, rot } from './gemeinsam.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon'
};

let ordner = path.join(REPO_ORDNER, 'ausgabe');
let port = 8080, portFest = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--hilfe' || a === '-h') { console.log('npm run ansehen [-- <ordner>] [-- --port <zahl>]'); process.exit(0); }
  if (a === '--port') { port = Number(argv[++i]); portFest = true; continue; }
  if (/^--port=/.test(a)) { port = Number(a.slice(7)); portFest = true; continue; }
  ordner = path.resolve(process.cwd(), a);
  if (!istOrdner(ordner)) ordner = path.resolve(REPO_ORDNER, a);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error(rot('Ungültiger Port.')); process.exit(2); }
if (!istDatei(path.join(ordner, 'index.html'))) {
  console.error(`${rot('Nichts zu sehen:')} ${ordner} enthält keine index.html.`);
  console.error(path.basename(ordner) === 'ausgabe' ? '  Bitte zuerst „npm run bauen“ ausführen.' : '  Bitte den richtigen Ordner angeben.');
  process.exit(2);
}

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
  if (p.endsWith('/')) p += 'index.html';
  const datei = path.resolve(ordner, '.' + path.sep + p);
  if (!liegtIn(datei, ordner)) { res.writeHead(403); res.end(); return; }
  if (istOrdner(datei)) { res.writeHead(301, { Location: p + '/' }); res.end(); return; }
  if (!istDatei(datei)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Nicht gefunden'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(datei).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(datei).pipe(res);
});

function starten(versuch = 0) {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && !portFest && versuch < 20) { port++; starten(versuch + 1); return; }
    console.error(`${rot('Server startet nicht:')} ${e.message}`);
    process.exit(2);
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(fett('Dein Adventskalender – lokal ansehen'));
    console.log(`  Ordner:  ${grau(ordner)}`);
    console.log(`  Adresse: ${gruen(`http://localhost:${port}/`)}`);
    console.log(grau('  Testmodus: an die Adresse ?test=<testschluessel> anhängen. Beenden: Strg+C'));
  });
}
starten();
