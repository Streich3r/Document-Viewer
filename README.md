# Matrix Document Viewer V2 – reparierte GitHub-Pages-PWA

**Stand:** 12.11.2026  
**Funktion:** Dateien lokal im Browser betrachten. Keine Upload-API, kein externer CDN-Zugriff.

## Installation auf GitHub Pages

1. Dateien **aus diesem Verzeichnis** ins Stammverzeichnis deines GitHub-Pages-Repositories kopieren (oder in genau das Unterverzeichnis, aus dem die Webseite ausgeliefert wird).
2. `index.html`, `app.css`, `app.js`, `service-worker.js`, `manifest.json`, die Icons und die lokalen JavaScript-Bibliotheken gemeinsam hochladen.
3. Einstellungen → Pages: richtige Branch/Ordner-Zuordnung wählen.
4. Nach dem GitHub-Pages-Deployment die Seite einmal online laden und warten, bis der Service Worker installiert ist. Danach lässt sie sich auch offline starten.
5. Bei einer schon installierten PWA die App online erneut öffnen. Falls sie noch die alte Version anzeigt, ein weiteres Mal öffnen oder die sichtbare Update-Meldung verwenden.

**Wichtig:** `testdateien/` und `tests/` brauchst du für den Webserver nicht hochzuladen. Beide Ordner können für einen schlanken Deploy ausgelassen werden.

## Was repariert wurde

- DOCX: korrekte `docx.renderAsync`-API; Text-Fallback mit Mammoth bei fehlerhaftem Layout
- PPTX: ersetzter defekter `PPTXViewer` durch lokale ZIP/XML-Vorschau für **einfachen Text und eingebettete Rasterbilder**; mehrseitiges Blättern
- PDF: PDF.js-Worker, mehrere Seiten, Zoom, angepasste Anzeige auf Desktop/Mobil
- XLSX/XLS/ODS: Tabellenblätter auswählen, Tabellen scrollen, Werte als Text sicher darstellen
- ODT: lokale Text- und Überschriften-Vorschau aus `content.xml`
- TXT, JSON, CSV, HTML, XML, LOG, MD, RTF: Textansicht, CSV als Tabelle; aktives HTML wird **nicht** ausgeführt
- PNG, JPEG, WebP, GIF, SVG: lokale Bildanzeige; problematische SVG-Muster werden zurückgewiesen
- Datei wechseln, Schließen, Drag & Drop, Vollbild, Tastatursteuerung, Fehleranzeigen
- Automatische **Network-First**-Updates, Offline-Fallback, Cache-Bereinigung nur für diese App
- PWA-Manifest, Apple-Touch-Icon, Favicons und lokale Dateien für den Offline-Start
- CSP ohne Netzwerkanfragen der App; kein Upload, keine Speicherung ausgewählter Dokumente im SW-Cache

## Grenzen (wichtig)

- **Keine Ende-zu-Ende-Verschlüsselung:** Die App liest Dateien lokal. Sie verschlüsselt keine bereits im Geräte-Dateisystem oder Browser gespeicherten Inhalte.
- PPTX-Vorschau deckt einfache Texte/Bilder ab. SmartArt, komplexe Diagramme, Effekte, Schriften und Folienmaster können abweichen oder fehlen. Für originalgetreue Darstellung besser PDF exportieren.
- ODT wird als **Textvorschau** angezeigt, nicht als pixelgenaues Dokument. Legacy-RTF wird als Quelltext gezeigt.
- DOCX-Wiedergabe hängt von den Grenzen der lokalen `docx-preview`-Bibliothek ab.
- XLSX/ODS-Vorschau zeigt Werte und 1600 Zeilen × 60 Spalten pro Blatt; Makros und Formeln werden **nicht** ausgeführt.
- Keine Daten werden an einen Server gesendet, aber bei bösartigen/manipulierten Dokumenten kann ein Browser- oder Bibliotheksfehler nie vollständig ausgeschlossen werden. Deshalb aktuelle Browser verwenden.
- PDF.js und andere Bibliotheken stammen aus dem Originalprojekt; sie wurden im Rahmen dieser Reparatur nicht auf neue Hauptversionen migriert.
- Bei `file://` funktioniert die Vorschau eingeschränkt, aber Service Worker und PWA-Installation erfordern HTTPS oder localhost.
- Unter GitHub Pages muss HTTPS aktiv sein. Zum Offline-Test mindestens einmal online starten.

## Testdateien

Im Ordner `testdateien/` findest du ein PDF mit drei Seiten, ein DOCX mit zwei Seiten, eine PPTX mit drei Folien und Bild, ein ODT, eine ODS, eine XLSX mit zwei Tabellenblättern, TXT, CSV, JSON, HTML, LOG und **eine absichtlich beschädigte PDF**. Die beschädigte PDF muss eine freundliche Fehlermeldung liefern, statt die Anwendung zu blockieren.

## Automatisierte Tests

Ausgeführt: **29/29 Browser-Funktionstests** in Headless Chromium mit direkt eingebundenen Original-JavaScript-Dateien; **12/12 Service-Worker-Tests** mit Node.js und simuliertem Cache/Netzwerk. Die Testumgebung blockiert Browser-Navigation zu localhost, weshalb der echte HTTP-basierte Offline-Start hier **nicht** direkt durch einen installierten Browser-Service-Worker verifiziert werden konnte. Das muss zusätzlich auf GitHub Pages/Smartphone geprüft werden.

- `python tests/test_browser.py` – Browser-Funktionschecks; benötigt Playwright und Chromium unter `/usr/bin/chromium` (ggf. Pfad anpassen)
- `node tests/test_service_worker.js` – Cache- und Offline-Verhalten mit simuliertem Service Worker
- `tests/test-report.json` – Browser-Ergebnisdetails
- `tests/desktop-preview.png`, `tests/mobile-preview.png` – Screenshots der Testläufe

## Bedienung

- `Strg+O`: Datei öffnen
- Pfeil links/rechts oder Bild hoch/runter: vorherige/nächste PDF-Seite, PPTX-Folie oder Tabellenblatt
- `Strg +` / `Strg -`: Zoom
- Vollbild-Schaltfläche oben rechts: Vollbild (wenn Browser dies erlaubt)
- `Anpassen`: Zoom wieder auf 100 %

## Datenschutz

Ausgewählte Dateien werden nur zur Anzeige im Speicher des jeweiligen Browsertabs gelesen. Der Service Worker cached ausschließlich **statische App-Dateien** und keine per Dateiauswahl eingelesenen Dokumente. Andere PWA-Caches werden nicht gelöscht.
