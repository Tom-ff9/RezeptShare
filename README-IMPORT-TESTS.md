# Lokale Buchimport-Testvorbereitung

Aktuell bestätigtes Ziel: `hmjtzcebgbkryucvkndu`. `konfiguration.lokal.js` enthält die angegebene URL und den öffentlichen Publishable-Key; die Datei und `target.json` sind Git-ignoriert. Weitere KI-Endpunkte bleiben leer. Die URL wurde nicht unabhängig im Dashboard verglichen. Read-only Audit und Migrations-Dry-Run sind abgeschlossen; Befunde und Hash: [SUPABASE-TESTPLAN.md](SUPABASE-TESTPLAN.md).

Die Bootstrap-Migration und die fünf freigegebenen Edge Functions wurden im bestätigten Testprojekt angewendet/deployed und read-only geprüft. Drei Auth-Statuskorrekturen sind lokal implementiert und getestet, aber noch nicht deployed. Secret-Werte wurden weder geändert noch ausgelesen. Keine echten KI-Aufrufe, Commits, Pushes oder Merges wurden ausgeführt.

## Automatisierte Abdeckung

| Bereich | Prüfung |
|---|---|
| Synthetische Druckseite | Tatsächliche JPEG-Datei, Bildhash, Titel, Zutaten/Mengen, fünf Schritte, zwei Portionen, 20 Minuten, Notiz, keine Nährwerte/Fotos |
| Weitere technische Fälle | Handschrift; Druck plus Änderungen/Streichung; mehrere Rezepte pro Seite; eindeutige/unsichere Fortsetzung; Gerichtsfoto auf Folgeseite; kein Rezept |
| Textnormalisierung | Unicode, Leerzeichen, Zeilenumbrüche/Umbruchzeilen, Aufzählungszeichen, typografische Varianten; keine Mengenberechnung oder unscharfe Ähnlichkeit |
| Negativproben | Falsche Menge, Titel, Garzeit, fehlender Schritt, falsche Anzahl, erfundene Nährwerte müssen scheitern |
| Schutz | Bekannte produktive Projekte gesperrt, Pflichtbestätigung, exakte URL/CSP, keine Zusatz-/Secret-Felder, Offline-Standardstart, erneute Zielprüfung, Audit-/Pakethash |
| Release/Start | CLI und Kindprozesse vollständig gemockt; falsche/veraltete Freigaben stoppen Aktionen; Secret nur in stdin, nicht in Argumenten/Logs/Browser; Zielumgebungsvariablen entfernt |
| Bestehende App | KI-Karten/Portionen, Profil, Gruppen/Links, Auth, Import/Crop, Entwurfswechsel und Speicherung in der Browser-Suite; alle SQL-Regeltests nur im PGlite-Speichermodell |

```bash
npm run check
npm run test:import:regression
npm run test:schutz
npm test
npm run build
PGLITE_MODULE=/tmp/rezept-share-testdeps/node_modules/@electric-sql/pglite/dist/index.js npm run test:db
PLAYWRIGHT_MODULE=/tmp/rezept-share-testdeps/node_modules/playwright BROWSER_BINARY='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:browser:all
```

Die Browser-Suite startet/beendet selbst den lokalen Testserver auf Port 3190. Sämtliche Backend- und KI-Antworten sind fest vorgegeben. Testabhängigkeiten müssen vorhanden sein (siehe README-TESTUMGEBUNG). Technische Testfälle und Normalisierungsregeln sind in [tests/fixtures/import-regression/README.md](tests/fixtures/import-regression/README.md) beschrieben. Daraus folgt keine Aussage über die Qualität einer echten Bild-/Handschrifterkennung.

## Ziel- und Browserkonfiguration

Die lokale Konfiguration ist für das bestätigte Testprojekt ausgefüllt. Die folgenden Vorlagen zeigen das erlaubte Format für eine künftige Neueinrichtung. Keine Projektwerte anderer Umgebungen übernehmen und keine Daten oder Konten aus einem produktiven Projekt kopieren.

Nach eigener Prüfung im Supabase-Dashboard `examples/target.test.json` nach `.supabase-test/target.json` kopieren und ausfüllen:

```json
{
  "projectRef": "DEINE_TESTPROJEKT_REFERENZ",
  "projectName": "RezeptShare-Test",
  "environment": "test",
  "confirmedByUser": false
}
```

`projectRef` muss die reine Referenz aus 20 Kleinbuchstaben sein. `projectName` ist die lokale Zweckbezeichnung. `environment` muss `test` sein. Erst nach dem Vergleich von Organisation, echtem Projektnamen, URL und Referenz im Dashboard `confirmedByUser` auf `true` setzen. Die bekannte bisherige App- und KI-Projektreferenz werden immer abgewiesen, auch bei versehentlicher Bestätigung. Eine Offline-Prüfung kann ein unbekanntes, falsch etikettiertes weiteres Produktionsprojekt nicht selbständig als solches erkennen; deshalb ist dieser manuelle Abgleich unverzichtbar. Keine zusätzlichen Felder, Passwörter oder Secrets in diese JSON-Datei aufnehmen.

`konfiguration.beispiel.js` als `konfiguration.lokal.js` kopieren und ausschließlich diese öffentlichen Angaben setzen:

```javascript
window.REZEPT_SHARE_KONFIGURATION = Object.freeze({
    supabaseUrl: 'https://DEINE_TESTPROJEKT_REFERENZ.supabase.co',
    supabasePublishableKey: 'DEIN_OEFFENTLICHER_TESTPROJEKT_KEY',
    kiUrl: '',
    kiPublishableKey: '',
    kiProgressUrl: ''
});
```

Die URL muss exakt zur bestätigten Referenz passen. Fremd-URLs, zusätzliche Felder, `sb_secret_`-/Service-Role-Keys und konfigurierte weitere KI-Endpunkte werden abgewiesen. Opaque Publishable-Keys können offline nicht einem Projekt zugeordnet werden; die URL und die CSP legen das erreichbare Projekt fest. Ein alter anon-JWT wird zusätzlich auf Rolle und Referenz geprüft; seine Gültigkeit prüft später Supabase. Die Keyprüfung ersetzt keine serverseitige Authentifizierung.

Beide lokalen Dateien sind Git-ignoriert und werden weder vom statischen Dateiserver als eigene Pfade noch vom Pages-Build veröffentlicht. Unter `/konfiguration.js` liefert der geschützte Server nur ein frisch geprüftes, serialisiertes Objekt der fünf erlaubten öffentlichen Felder aus, niemals den Inhalt der Quelldatei. Ohne Testreferenz bleibt `npm start` offline; bei vorhandener lokaler Live-Konfiguration verweigert es den Start und verweist auf `start:test`. Auch ein direkt gestarteter Server mit `REZEPTSHARE_TEST_PROJECT_REF` muss dieselben Prüfungen bestehen.

## Sicherer erster echter Import – erst nach Freigabe

1. Separates Testprojekt bestätigen. Falls noch kein Testprojekt existiert, dessen Anlage vorher freigeben. Target-Datei erst danach bestätigen; die Vorlagen bleiben bis dahin absichtlich ungültig.
2. Lokales Testpaket prüfen bzw. mit `npm run prepare:supabase:test` vorbereiten. Vorhandene Pakete werden nicht überschrieben. Anschließend nur den **offline** erzeugten Plan ansehen:
   `npm run plan:supabase:test -- --confirm-ref DEINE_TESTPROJEKT_REFERENZ`.
   Der Hash umfasst Bootstrap-Schema, Funktionspaket, Konfiguration und Audit-SQL. Inhalt/Zieländerungen benötigen einen neuen Plan.
3. Das Read-only Audit fand zunächst keine Anwendungs-Tabellen oder registrierten Migrationen; der Dry-Run listete ausschließlich `202611150001_test_bootstrap.sql`. Diese Migration ist angewendet und nachgeprüft. Die fünf freigegebenen Functions sind deployed; keine weiteren Functions oder Migrationen ohne Freigabe ausführen.
4. Die Secret-Namenabfrage hat `OPENAI_API_KEY` im Testprojekt bestätigt; der Wert wurde nicht gelesen. Es ist derzeit kein Setzen erforderlich. Falls eine spätere Rotation gewünscht ist: im Dashboard genau des Testprojekts unter Edge Functions → Secrets ändern. Nie in Chat, Git, `target.json`, `konfiguration.lokal.js`, `.env` oder Browser eintragen.
5. Die Test-Auth-/Storage-Einstellungen und Redirect-/CAPTCHA-Konfiguration im Dashboard prüfen. Die Dashboardwerte sind noch nicht verifiziert. Den Buchimport-Modus erst nach erfolgreichem Testlogin starten:
   `npm run start:test -- --confirm-ref DEINE_TESTPROJEKT_REFERENZ`.
   Standardadresse ist `http://127.0.0.1:3000`; alternativ `PORT=3001 npm run start:test -- --confirm-ref DEINE_TESTPROJEKT_REFERENZ`. Der Server bindet nur localhost und erlaubt Supabase-Verbindungen/Bilder ausschließlich zum bestätigten Testprojekt. Andere KI-Dienste bleiben in diesem Modus deaktiviert. Ihre Simulation bleibt über `npm run demo` und Integrationstests verfügbar.
6. Einen einzelnen kostenpflichtigen Erkennungsaufruf ausdrücklich freigeben. Dann die vorhandene synthetische Seite auswählen, Verarbeitung bestätigen und genau einmal erkennen lassen. Alle Angaben anhand der Seite und `erwartung.json` prüfen; zunächst kein Bild übernehmen und nicht automatisch speichern. Eine echte Antwort muss nicht bytegleich zur Mock-Antwort sein. Es gelten weiterhin Quota und Größenlimits; keine automatischen Wiederholungen.
7. Erst nach Inhaltsprüfung im bestehenden Formular eine reine Testgruppe auswählen und bewusst speichern. Weitere Handschrift-/Foto-/Mehrseiten-Qualitätstests separat freigeben und mit Bildhash, Modell, Datum und Fehlerbeobachtungen dokumentieren. Mock-Ergebnisse und echte Erkennungsqualität getrennt halten.

Die ursprünglichen Funktionen und Gruppenrechte werden nicht durch eine parallele Speicherroutine ersetzt. Zusätzliche KI-Chat-Dienste werden durch diese Vorbereitung weder aufgerufen noch deployt. Das bisherige produktive Supabase-Projekt und das ursprüngliche GitHub-Repository bleiben unangetastet.

Automatisierte Server-/Browsertests verwenden REZEPTSHARE_OFFLINE_TEST=1: Die lokale Live-Konfiguration wird nicht geladen, die ausgelieferte Konfiguration bleibt leer und die CSP erlaubt keine Supabase-Projektverbindungen. Der normale interaktive Start wird dadurch nicht freigeschaltet.
