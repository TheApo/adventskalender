# Deine Bilder

Hier hinein kommen die Bilder für deinen Kalender. Dieser Ordner wird **nicht** ins Git-Repo übernommen
(siehe `.gitignore`) – deine Fotos bleiben auf deinem Rechner, bis du `ausgabe/` selbst hochlädst.

## So benennen

```
bilder/
├── 1.jpg … 24.jpg     ein Bild je Tag (gern eine Collage)
├── texte.txt          optional: Bildunterschriften
└── 12/                optional: Einzelfotos für Tag 12 (Ansicht „Advent-Stories“)
    ├── 1.jpg
    └── 2.jpg
```

- Nur die Zahl, ohne führende Null: `7.jpg`, nicht `07.jpg` oder `Tag7.jpg`.
- Formate: JPG, PNG, WebP (auch AVIF). **Nicht:** HEIC (iPhone), GIF, TIFF – vorher als JPG speichern.
- Größe: 1200–2400 px an der langen Kante reichen. Größere Bilder gehen auch, das Bauen dauert dann länger.
- Quadratisch oder hochkant sieht in allen Ansichten am besten aus; Querformat wird teils beschnitten.
- Fehlt ein Tag, zeigt der Kalender einen gemalten Platzhalter „Foto folgt“.

## Bildunterschriften (`texte.txt`)

Eine Zeile je Tag, als UTF-8 gespeichert (Windows-Editor: „Speichern unter“ → Codierung UTF-8):

```
# Zeilen mit # sind Kommentare
1 = Schlittenfahrt im Januar
12 = Plätzchen backen mit Oma
24 = Frohe Weihnachten!
```

## Einzelfotos

Für die Ansicht „Advent-Stories“ kannst du je Tag mehrere Fotos zeigen: Ordner `bilder/<tag>/` anlegen und die
Fotos hineinlegen. Die Reihenfolge folgt den Dateinamen (`1.jpg`, `2.jpg`, … oder `a.jpg`, `b.jpg`). Ohne Ordner
zeigt die Story das Tagesbild.

## Wenn etwas nicht klappt

| Meldung beim Bauen / im Kalender | Lösung |
|---|---|
| „sharp fehlt“ | Im Projektordner einmal `npm install` ausführen. |
| „… wird ignoriert: bitte ohne führende Null“ | Datei umbenennen, z. B. `05.jpg` → `5.jpg`. |
| „Format .heic geht nicht“ | Bild als JPG speichern (am iPhone: Einstellungen → Kamera → Formate → „Maximale Kompatibilität“). |
| „einstellungen.json ist kein gültiges JSON“ | Meist ein fehlendes oder überzähliges Komma; Anführungszeichen müssen gerade sein (`"`). |
| „standard_ansicht … steht nicht in ansichten“ | Die Start-Ansicht muss in der Liste `ansichten` vorkommen. |
| Hochkant-Foto liegt quer | Bild im Fotoprogramm drehen und neu speichern (bei PNG/WebP gibt es keine automatische Drehung). |
| Umlaute in Bildunterschriften kaputt | `texte.txt` als UTF-8 speichern. |
| „Bitte über einen Webserver öffnen“ | Nicht per Doppelklick öffnen, sondern `npm run ansehen` – oder hochladen. |
| Neues Bild erscheint nicht | Neu bauen und **alles** aus `ausgabe/` neu hochladen (alten Ordner `web/` auf dem Server vorher löschen). |
| Die Kinder sehen den Testregler | Auf dem Gerät einmal die Adresse mit `?test=aus` aufrufen. |
