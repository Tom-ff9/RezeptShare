# Integrationsbericht – RezeptShare

Stand: 15. November 2026. Zielrepository ausschließlich `nordlicht78/RezeptShare`, Integrationsbranch `feature/ki-v2-kochbuch-integration`. Keine Änderungen oder Anfragen mit Schreibzugriff am ursprünglichen Repository. Der frühere Upstream-Remote wurde lokal entfernt; der vorhandene Push-Hook erlaubt weiterhin nur den eigenen Fork. Kein Merge nach main, kein Pull Request und kein Cloud-Deployment.

## Geprüfte Branches und Integrationsbasis

| Branch im eigenen Repository | Stand | Einordnung |
|---|---|---|
| main | 52313f9 | Bestehende Rezept-/Profil-/Gruppen-App mit Auth, Storage und öffentlichen Links |
| feature/ki-rezept-assistent | 3275106 | KI-Chat und Beispiel-Fragen; vollständig im V2-Branch enthalten |
| feature/ki-rezept-v2-abc | 6f2d711 | Funktional neueste Basis, 40 Commits über main: Karten, Portionen, lokale Extraktion, Deutsch/metrisch, Statuskanal und Regressionstests |
| feature/kochbuch-import | 43ec696 | Unabhängiger Buchimport; dieser Commit und sein Sicherungstag bleiben unverändert |

Die funktionale Basis wurde anhand der Abstammung und Dateidiffs gewählt, nicht anhand des jüngsten Datums. Die Integration löst die Konflikte in index.html, package.json, Build-Dateiliste, CSS und Pages-Testliste gezielt auf. Alle KI-V2-Skripte und Prüfungen bleiben enthalten, ebenso alle Importmodule und zugehörigen Tests. Die Historie beider Entwicklungszweige bleibt durch einen kontrollierten Integrationscommit erhalten.

## Zusammengeführte Funktionen

- Bestehende Rezepte, Profil-/Gruppenverwaltung, Mehrfachgruppen, öffentliche Links, Rollen, Bild-Storage und versionsgeprüftes Speichern.
- KI-Chat mit Beispiel-Fragen, Antwortverlauf, Ladeanzeige und optionalen tatsächlichen Backend-Phasen. Karten entstehen lokal aus Antworten; Portionen lassen sich skalieren. Deutsche Titel und metrische Einheiten des V2-Zweigs bleiben erhalten.
- Kochbuchimport: mehrere komprimierte Fotos, getrennte Rezepte je Seite, Fortsetzungen, Original/überarbeitete Handschriftfassung, Streichungen/Ergänzungen, Unsicherheiten, Notizen, manuelle Zusammenführung/Aufteilung und korrigierbare Bildausschnitte. Standard bleibt kein Bild; keine erfundenen Gerichtsfotos oder Nährwerte.
- Beide Entwurfsarten befüllen das bestehende Formular und speichern ausschließlich über dessen Gruppen-/Storage-/Berechtigungslogik. Beim Ersetzen ungespeicherter Eingaben ist eine Bestätigung nötig; beim Wechsel zum Chatentwurf wird ein noch nicht gespeichertes Importbild entfernt. Abmelden löscht beide lokalen Entwurfsbereiche und bricht laufende Chatantworten ab.
- Die automatische Maßeinheitenkonvertierung des Chats wird nicht auf Buchtexte angewendet; Originalmengen bleiben unverändert erhalten. Importprotokolle benötigen weiterhin Platz innerhalb der bestehenden 20.000-Zeichen-Grenze.

## Datenbank, Funktionen und Abhängigkeiten

Der KI-Assistent und KI-V2 ändern gegenüber main keine Tabellen oder Migrationen. Der Buchimport ergänzt nur `rezept_import_nutzung` und die ausschließlich für service_role freigegebene Funktion `rezept_import_limit(uuid)`. Vorhandene Rezepttabellen und Policies werden dadurch nicht verändert. Nutzungslimits: 10 reservierte Aufträge je Nutzer/UTC-Tag, mindestens 60 Sekunden Abstand; auch Providerfehler zählen nach Reservierung.

`rezept-importieren` validiert die Anmeldung über denselben gemeinsamen Supabase-Client wie die bestehenden Speicherfunktionen, prüft das Profil, Bilder und strukturierte Antworten und liest OPENAI_API_KEY ausschließlich aus serverseitiger Umgebung. `ki-fortschritt` wurde ebenfalls auf den gemeinsamen Client und ein eigenes Testprojekt umgestellt; der bisherige fest eingetragene fremde Auth-/Backend-Zugriff entfällt. Ohne ausdrücklich konfigurierten Test-Upstream liefert der optionale Statusdienst 503; der Chat kann seine einfache Warteanzeige weiterverwenden.

Keine neuen Runtime-NPM-Abhängigkeiten. Node >=22.13 bleibt erforderlich, Supabase JS bleibt bei 2.117.1. Playwright/Chrome und PGlite werden nur für lokale Tests verwendet. CLI und Docker wurden nur auf Verfügbarkeit geprüft, keine Container/Cloud-Ressourcen gestartet oder geändert.

## Isolation und Testprojekt-Vorbereitung

Die aktive Projektkonfiguration ist leer. Für reale lokale Tests kann server.js eine ignorierte konfiguration.lokal.js mit ausschließlich öffentlichen Werten eines neuen Testprojekts ausliefern; sie wird nicht in den Pages-Build kopiert. Die früher fest eingetragenen Projekt-/KI-Adressen wurden aus aktivem Code entfernt. Die Build-Dateiliste enthält KI-V2 und Import gemeinsam. Pages-Veröffentlichung erfordert manuellen Start und ausdrückliche Bestätigung; Feature-Pushes lösen ausschließlich Prüfungen aus.

`npm run demo` startet den aktuellen Gesamtstand auf 127.0.0.1:3191 mit simulierten lokalen Konten, Chatantworten, Erkennung und Speicherung. Eine CSP blockiert externe API-Verbindungen. Die Demo wurde zusätzlich mit Chrome auf externe Anfragen geprüft: keine externen Anfragen und keine Browserfehler.

`npm run prepare:supabase:test` hat nur lokal ein ignoriertes Paket unter .supabase-test erstellt: Vollschema als Bootstrap-Migration plus alle Funktionen/config.toml, ohne Zielverknüpfung, Secrets oder Zugriffsschlüssel. Der Paketinhalt wurde byteweise mit dem aktuellen Schema und den Funktionen verglichen. Die historischen Upgrade-Migrationen setzen Basistabellen voraus und sind allein keine Initialinstallation; deshalb verwendet das Paket für ein leeres Testprojekt das komplette, bereits getestete Schema. Anleitung und konkrete Freigabeschritte: README-TESTUMGEBUNG.md.

## Testergebnisse

| Prüfung | Ergebnis |
|---|---|
| npm run check | erfolgreich |
| npm test | erfolgreich; bestehende Auth/Diff/Edge/Pages/KI-V2-Tests sowie Import-, Isolations- und Fortschrittstests |
| npm run build | erfolgreich; 18 freigegebene Webdateien plus .nojekyll |
| npm run test:db mit PGlite | erfolgreich; Bestandsmigrationen, vollständige Neuinstallation, RLS/Rollen/Storage-Modell, Quota und Tageswechsel |
| npm run test:browser:all | alle fünf Programme erfolgreich: Profile/Gruppen, Rezeptgruppen/Links, Auth, Import, kombinierte Integration |
| zusätzliche Demo-Prüfung | Chatkarten und Import/Formular/simuliertes Speichern erfolgreich; keine externen Requests |
| Geheimnisprüfung und git diff --check | keine Fundstellen privater Tokens/Keys, keine Diff-Formatfehler |

Der neue Integrationstest prüft insbesondere den Wechsel KI → Portionskarte → Speichern → Kochbuchimport mit Crop → bestätigter Entwurfswechsel → gemeinsames Speichern → Abmelden. Ungespeicherte Eingaben und Bildzustände werden dabei explizit geprüft. Die vorhandene Live-SQL-Datei wurde nicht gegen eine Datenbank ausgeführt. Es gab keine kostenpflichtigen Modellaufrufe und keine echten Supabase-JWT-/Storage-/OCR-Tests; diese benötigen eine separate Freigabe.

## Noch erforderliche Schritte

1. Ein separates Testprojekt und dessen Referenz bestätigen; falls noch keines existiert, dessen Anlage/Organisation/Region/Kosten freigeben.
2. Bootstrap-Migration und Zielprojekt prüfen, Migration ausdrücklich freigeben.
3. Vorhandenen OPENAI_API_KEY nach Freigabe direkt im Secret Manager dieses Testprojekts setzen. Nicht im Chat, Git, Frontend oder Kommandoargumenten ablegen.
4. Die vorhandenen fünf Kernfunktionen ausschließlich im Testprojekt nach Deployment-Freigabe bereitstellen; Auth/Storage-Testkonfiguration und öffentliche lokale Konfiguration einrichten.
5. Für echten KI-Chat zusätzlich den fehlenden Quellcode der ki-assistent-Function bzw. des isolierten Mac-Studio-Backends bereitstellen. Er liegt in keinem der geprüften Repositoryzweige. Keine bisherigen Produktionsendpunkte ersatzweise verwenden. Echte Buchimporte benötigen diesen Chatdienst nicht.
6. Einen begrenzten echten KI-Erkennungstest gesondert freigeben. Bis dahin bleiben alle Prüfungen lokal bzw. simuliert.

## Geänderte und neue Dateien gegenüber KI-V2

- `.github/workflows/ki-v2-check.yml`
- `.github/workflows/pages.yml`
- `.gitignore`
- `INTEGRATIONSBERICHT.md`
- `README-IMPORT.md`
- `README-TESTUMGEBUNG.md`
- `README.md`
- `docs/ki-fortschritt-einrichtung.md`
- `index.html`
- `ki-assistent.js`
- `kochbuch-import.js`
- `konfiguration.beispiel.js`
- `konfiguration.js`
- `package.json`
- `script.js`
- `scripts/build-pages.cjs`
- `scripts/demo.cjs`
- `scripts/prepare-supabase-test.cjs`
- `scripts/test-browser-suite.cjs`
- `server.js`
- `style.css`
- `supabase/config.toml`
- `supabase/functions/_shared/import-format.mjs`
- `supabase/functions/_shared/import-handler.mjs`
- `supabase/functions/ki-fortschritt/index.ts`
- `supabase/functions/rezept-importieren/index.ts`
- `supabase/migrations/202611140001_kochbuch_import.sql`
- `supabase/schema.sql`
- `tests/auth-browser-test.cjs`
- `tests/browser-test.cjs`
- `tests/datenbank-test.mjs`
- `tests/import-browser-test.cjs`
- `tests/import-fixtures.mjs`
- `tests/import-test.mjs`
- `tests/integration-browser-test.cjs`
- `tests/isolation-test.cjs`
- `tests/pages-test.cjs`
- `tests/progress-test.mjs`
- `tests/rezeptgruppen-browser-test.cjs`
