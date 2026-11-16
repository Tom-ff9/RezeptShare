# Isolierter Integrationstest

Aktueller sicherer Ablauf für Buchimport und die lokalen Ziel-/Konfigurationsdateien: [README-IMPORT-TESTS.md](README-IMPORT-TESTS.md). Für reale Buchimporttests ausschließlich `npm run start:test -- --confirm-ref TESTREFERENZ` verwenden; der normale Serverstart aktiviert keine Live-Konfiguration mehr.

Entwicklungsziel ist ausschließlich `nordlicht78/RezeptShare`, Branch `feature/ki-v2-kochbuch-integration`. Weder das ursprüngliche Repository noch vorhandene Supabase-Projekte werden verwendet. Die bisherigen Projektadressen sind aus der aktiven Konfiguration entfernt; ohne eigene Testkonfiguration bleibt die normale Anmeldung absichtlich deaktiviert.

## Sofort lokal testen, ohne Supabase und ohne OpenAI

```bash
npm run demo
```

Die Demo läuft standardmäßig unter `http://127.0.0.1:3191`; ein anderer Port ist mit `PORT=3192 npm run demo` möglich. `Strg+C` beendet sie. Sie baut den aktuellen Integrationsstand, ersetzt Backend und Anmeldung durch lokale Testdaten und blockiert externe API-Verbindungen per CSP. Chatfragen liefern ein festes Reisrezept, Fotos liefern feste Beispielrezepte. Speichern betrifft nur den Browser-Speicher und verschwindet beim Neuladen. Es gibt keine echte OCR oder Modellgenerierung.

Testfolge: KI-Assistent öffnen → Frage senden → Rezeptkarten erstellen → Portionen ändern → ins Formular übernehmen → speichern. Danach Hinzufügen → Kochbuchimport → Foto wählen → simulierte Verarbeitung bestätigen → Original/überarbeitet vergleichen → Notizen, Seitenzuordnung und Crop korrigieren → Prüfung bestätigen → ins Formular übernehmen → Gruppen wählen → speichern. Bei einem Entwurfswechsel müssen ungespeicherte Eingaben bestätigt werden. Nach Abmeldung sind Chat und Importentwürfe gelöscht.

```bash
npm run check
npm test
npm run build
PGLITE_MODULE=/tmp/rezept-share-testdeps/node_modules/@electric-sql/pglite/dist/index.js npm run test:db
PLAYWRIGHT_MODULE=/tmp/rezept-share-testdeps/node_modules/playwright BROWSER_BINARY='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:browser:all
```

PGlite/Playwright werden nur für Tests benötigt, nicht zur Laufzeit. Installation gegebenenfalls wie in README-IMPORT beschrieben. Der Browser-Testlauf startet und beendet selbst einen lokalen Server auf Port 3190. Alle externen Backendanfragen werden simuliert. Die bestehende `tests/live-rezeptgruppen.sql` wurde nicht gegen einen Server ausgeführt; dafür wäre eine gesonderte Freigabe erforderlich.

## Separates Supabase-Testprojekt – Bootstrap angewendet

`npm run prepare:supabase:test` erzeugt ausschließlich lokal `.supabase-test/supabase/` und überschreibt ein vorhandenes Paket nicht. Der Ordner ist in Git ignoriert. Das bestätigte Projekt `hmjtzcebgbkryucvkndu` hat die freigegebene Bootstrap-Migration und die fünf freigegebenen Rezeptfunktionen erhalten. `OPENAI_API_KEY` ist als Secret-Name vorhanden (Wert nicht gelesen). Drei Auth-Statuskorrekturen sind lokal getestet, aber noch nicht deployed; aktueller lokaler Planhash steht in `SUPABASE-TESTPLAN.md`. Es gab keine OpenAI-Aufrufe. Enthalten sind:

- `migrations/202611150001_test_bootstrap.sql`: das aktuelle vollständige `supabase/schema.sql` als eine Initialmigration für ein **neues, leeres** Testprojekt.
- Alle vorhandenen Edge Functions einschließlich `rezept-importieren` und `ki-fortschritt`, mit dem gemeinsamen Supabase-Client.
- Eine separate `config.toml`; keine Projektverknüpfung, Zugangsdaten oder Secrets.

Warum eine Bootstrap-Migration: Die historischen Upgrade-Migrationen setzen bereits vorhandene Basistabellen voraus. Sie dürfen nicht unverändert als einzige Initialisierung einer leeren Datenbank verwendet werden. Das Vollschema enthält bereits alle Upgrades und die neue Importlimit-Tabelle. Die PGlite-Tests prüfen sowohl historische Upgrade-Reihenfolge als auch die Neuinstallation des Vollschemas.

## Benötigte Freigaben und konkrete nächste Schritte

Die folgenden Schritte beschreiben den weiteren Ablauf. Ziel und Bootstrap sind bereits geprüft; Secret-Werte bleiben geheim und werden weder im Chat noch in Git kopiert.

1. Vor jeder weiteren Cloud-Aktion die Referenz `hmjtzcebgbkryucvkndu` und URL prüfen. Keine anderen Projekte verknüpfen oder ansprechen.
2. Die freigegebene Bootstrap-Migration ist bereits angewendet; die vier historischen Upgrade-Dateien nicht zusätzlich ausführen.
3. `OPENAI_API_KEY` ist im Secret-Manager des Testprojekts vorhanden. Sein Wert wurde nicht gelesen. Falls er rotiert werden muss, geschieht das manuell im Dashboard unter Edge Functions → Secrets; keine lokale Schlüsseldatei erstellen. Optionales Modell bleibt standardmäßig `gpt-4.1-mini`.
4. Die fünf freigegebenen Funktionen sind bereits einzeln auf das bestätigte Projekt deployed: `rezept-speichern`, `rezept-gruppen`, `gruppe-loeschen`, `konto-loeschen`, `rezept-importieren`. Die read-only Liste bestätigt `verify_jwt=false`; unauthentifizierte POST-Proben wurden abgelehnt. `ki-fortschritt` wurde nicht deployed. Kein pauschales Deployment in ein unbestätigtes Projekt.
5. Im Testprojekt Auth konfigurieren: eigene Testkonten, lokale Redirect-/Site-URL, dieselben Bestätigungsmail-Annahmen wie die App; falls hCaptcha aktiviert wird, dafür einen eigenen Test-Sitekey verwenden. Storage-Buckets und RLS sind durch die Bootstrap-Migration angelegt. Für produktive Daten oder Konten gibt es keinen Import.
6. Die ignorierte `konfiguration.lokal.js` ist bereits mit den öffentlichen Testprojektwerten eingerichtet. `npm run start:test -- --confirm-ref hmjtzcebgbkryucvkndu` liefert nach Zielprüfung ausschließlich die erlaubten öffentlichen Werte unter `/konfiguration.js` aus, standardmäßig auf `127.0.0.1:3000`; `PORT=3001` ändert den Port. `npm start` bleibt ohne bestätigtes Ziel offline und verweigert den Start, wenn eine lokale Live-Konfiguration vorhanden ist. Der Pages-Build nimmt diese lokale Datei bewusst nicht mit. Eine spätere Pages-Testveröffentlichung braucht eine eigens überprüfte öffentliche Testkonfiguration und manuelle Deployment-Freigabe.
7. Erst nach ausdrücklicher Freigabe eines kostenpflichtigen Tests echte Buchfotos erkennen lassen. Es gelten 10 Aufträge pro Nutzer und UTC-Tag, mindestens 60 Sekunden Abstand, höchstens 6 Seiten und 5 MiB Bilddaten insgesamt. OCR, Handschrift, Seitenzuordnung und Gerichtsfotos immer manuell prüfen.

## Bestehender KI-Assistent

Chat, Antwortformat, Karten, Portionsumrechnung und Fortschrittsanzeige bleiben im Frontend erhalten. `kiUrl`, `kiPublishableKey` und optional `kiProgressUrl` ersetzen die früher fest eingetragenen Dienstadressen. Für einen echten Chat-Test fehlt im Repository der Quellcode der `ki-assistent`-Edge-Function und des Mac-Studio-Backends. Diese Dienste müssen separat aus bestätigtem Quellcode bereitgestellt werden; die bisherigen Produktionsadressen sind kein zulässiger Ersatz. Der Buchimport ist davon unabhängig und benutzt ausschließlich `rezept-importieren` im eigenen Testprojekt.

## Grenzen und Sicherheitsstand

- Die reine lokale Demo beweist die UI-Integration, nicht die Qualität echter KI-Erkennung oder die echte Supabase-JWT-/Storage-Integration.
- Beide Buchfassungen und Änderungen bleiben im vorhandenen Rezepttext als Importprotokoll erhalten, maximal 20.000 Zeichen einschließlich Protokoll. Keine automatische Portionsumrechnung oder US-Maß-Konvertierung von Buchtexten: Originalangaben bleiben erhalten. Die Umrechnung des KI-Chats ist davon getrennt.
- Kein automatischer Merge nach `main`, kein PR zum Original, keine produktiven Änderungen. Pages-Deployment ist manuell und zusätzlich durch eine ausdrückliche Eingabe geschützt.
- Supabase-CLI und Docker sind lokal vorhanden. Es wurde kein lokaler Supabase-Stack gestartet. Die einzige freigegebene Bootstrap-Migration wurde im bestätigten Testprojekt angewendet. Das Repository und die lokale Testpaketkonfiguration enthalten weder OpenAI-Secret-Wert noch Projektpasswort; `OPENAI_API_KEY` ist dem Namen nach ausschließlich im Secret-Manager des Testprojekts vorhanden.

Offizielle Grundlagen: [Supabase CLI-Zielauswahl](https://supabase.com/docs/guides/local-development/local-and-hosted-projects), [Secrets](https://supabase.com/docs/guides/functions/secrets), [CLI-Referenz](https://supabase.com/docs/reference/cli/introduction).
