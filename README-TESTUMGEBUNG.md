# Isolierter Integrationstest

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

## Vorbereitetes Supabase-Paket – noch keine Cloud-Ressourcen

`npm run prepare:supabase:test` erzeugt ausschließlich lokal `.supabase-test/supabase/` und überschreibt ein vorhandenes Paket nicht. Der Ordner ist in Git ignoriert. Enthalten sind:

- `migrations/202611150001_test_bootstrap.sql`: das aktuelle vollständige `supabase/schema.sql` als eine Initialmigration für ein **neues, leeres** Testprojekt.
- Alle vorhandenen Edge Functions einschließlich `rezept-importieren` und `ki-fortschritt`, mit dem gemeinsamen Supabase-Client.
- Eine separate `config.toml`; keine Projektverknüpfung, Zugangsdaten oder Secrets.

Warum eine Bootstrap-Migration: Die historischen Upgrade-Migrationen setzen bereits vorhandene Basistabellen voraus. Sie dürfen nicht unverändert als einzige Initialisierung einer leeren Datenbank verwendet werden. Das Vollschema enthält bereits alle Upgrades und die neue Importlimit-Tabelle. Die PGlite-Tests prüfen sowohl historische Upgrade-Reihenfolge als auch die Neuinstallation des Vollschemas.

## Benötigte Freigaben und konkrete nächste Schritte

Die folgenden Schritte sind ein Plan, **nicht ausgeführt**. Zuerst die Referenz eines separaten Testprojekts bestätigen. Der vorhandene OpenAI-Key bleibt beim Nutzer; ihn nicht in den Chat oder in Git kopieren.

1. Eigenes leeres Supabase-Testprojekt anlegen bzw. ein schon vorhandenes **eindeutig als Testprojekt bestätigtes** Projekt verwenden. Organisation, Name, Region und mögliche Kosten vorher freigeben. Keine bestehenden produktiven Projekte verknüpfen.
2. Vor Migration die Projekt-Referenz und URL erneut prüfen. Nur das lokale Paket verknüpfen, beispielsweise mit `supabase --workdir .supabase-test link --project-ref DEINE_TESTPROJEKT_REFERENZ`. Die installierte CLI-Version und deren Hilfetexte beachten; v3 verwendet bei Datenbankoperationen `--remote` für das verknüpfte Cloud-Projekt. Ein bestehendes Paket nach Codeänderungen zunächst separat archivieren und neu erstellen, damit keine veralteten Funktionen deployt werden.
3. Die geplante Migration mit `supabase --workdir .supabase-test db push --dry-run --remote` anzeigen und zur Freigabe vorlegen. Erst nach Zustimmung `supabase --workdir .supabase-test db push --remote` ausführen. Nicht zusätzlich das Vollschema oder die historischen Upgrade-Migrationen einspielen.
4. Nach gesonderter Secret-Freigabe den vorhandenen `OPENAI_API_KEY` im Supabase-Dashboard unter Edge Functions → Secrets des **Testprojekts** setzen. So entsteht keine lokale Schlüsseldatei. Optional `OPENAI_IMPORT_MODEL=gpt-4.1-mini`. Der Browser erhält ausschließlich URL und Publishable-Key. Kein Secret wurde durch die Vorbereitung gesetzt oder geändert.
5. Nach Deployment-Freigabe ausschließlich die Funktionen aus dem Testpaket in dieses Projekt deployen: `rezept-speichern`, `rezept-gruppen`, `gruppe-loeschen`, `konto-loeschen`, `rezept-importieren`. Das Ziel explizit als `--project-ref DEINE_TESTPROJEKT_REFERENZ` angeben. `ki-fortschritt` ist optional und benötigt zuerst eine isolierte, konfigurierte Mac-Studio-Test-API. Kein pauschales Deployment in ein unbestätigtes verknüpftes Projekt.
6. Im Testprojekt Auth konfigurieren: eigene Testkonten, lokale Redirect-/Site-URL, dieselben Bestätigungsmail-Annahmen wie die App; falls hCaptcha aktiviert wird, dafür einen eigenen Test-Sitekey verwenden. Storage-Buckets und RLS entstehen durch die Bootstrap-Migration. Für produktive Daten oder Konten gibt es keinen Import.
7. `konfiguration.beispiel.js` als ignorierte `konfiguration.lokal.js` kopieren und ausschließlich öffentliche Werte des neuen Testprojekts eintragen. `npm start` liefert sie unter `/konfiguration.js` aus, standardmäßig auf `127.0.0.1:3000`; `PORT=3001 npm start` ändert den Port. Der Pages-Build nimmt diese lokale Datei bewusst nicht mit. Eine spätere Pages-Testveröffentlichung braucht eine eigens überprüfte öffentliche Testkonfiguration und manuelle Deployment-Freigabe.
8. Erst nach ausdrücklicher Freigabe eines kostenpflichtigen Tests echte Buchfotos erkennen lassen. Es gelten 10 Aufträge pro Nutzer und UTC-Tag, mindestens 60 Sekunden Abstand, höchstens 6 Seiten und 5 MiB Bilddaten insgesamt. OCR, Handschrift, Seitenzuordnung und Gerichtsfotos immer manuell prüfen.

## Bestehender KI-Assistent

Chat, Antwortformat, Karten, Portionsumrechnung und Fortschrittsanzeige bleiben im Frontend erhalten. `kiUrl`, `kiPublishableKey` und optional `kiProgressUrl` ersetzen die früher fest eingetragenen Dienstadressen. Für einen echten Chat-Test fehlt im Repository der Quellcode der `ki-assistent`-Edge-Function und des Mac-Studio-Backends. Diese Dienste müssen separat aus bestätigtem Quellcode bereitgestellt werden; die bisherigen Produktionsadressen sind kein zulässiger Ersatz. Der Buchimport ist davon unabhängig und benutzt ausschließlich `rezept-importieren` im eigenen Testprojekt.

## Grenzen und Sicherheitsstand

- Die reine lokale Demo beweist die UI-Integration, nicht die Qualität echter KI-Erkennung oder die echte Supabase-JWT-/Storage-Integration.
- Beide Buchfassungen und Änderungen bleiben im vorhandenen Rezepttext als Importprotokoll erhalten, maximal 20.000 Zeichen einschließlich Protokoll. Keine automatische Portionsumrechnung oder US-Maß-Konvertierung von Buchtexten: Originalangaben bleiben erhalten. Die Umrechnung des KI-Chats ist davon getrennt.
- Kein automatischer Merge nach `main`, kein PR zum Original, keine produktiven Änderungen. Pages-Deployment ist manuell und zusätzlich durch eine ausdrückliche Eingabe geschützt.
- Supabase-CLI und Docker sind lokal vorhanden. Es wurde kein Supabase-Stack gestartet und keine Datenbank migriert. Die Vorbereitung enthält weder API-Key noch Projektpasswort.

Offizielle Grundlagen: [Supabase CLI-Zielauswahl](https://supabase.com/docs/guides/local-development/local-and-hosted-projects), [Secrets](https://supabase.com/docs/guides/functions/secrets), [CLI-Referenz](https://supabase.com/docs/reference/cli/introduction).
