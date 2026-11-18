# Kochbuch- und Handschrift-Import

Die Implementierung erweitert das vorhandene statische Frontend und verwendet dessen Rezeptformular, Gruppen-Mehrfachauswahl, `bildHochladen` und `rezept-gruppen`. Der Import selbst legt keine Rezepte oder Storage-Dateien an. Keine bestehenden Rezepttabellen, Rechte oder Policies werden verändert.

## Supabase einrichten

Dieser Stand wird ausschließlich in einem separaten, leeren Supabase-Testprojekt eingerichtet. Noch keine Remote-Aktion ausführen. Der konkrete Freigabe- und Einrichtungsplan steht in [README-TESTUMGEBUNG.md](README-TESTUMGEBUNG.md). Für ein leeres Projekt wurde `npm run prepare:supabase:test` ergänzt: Es bündelt das Vollschema als Bootstrap-Migration und kopiert die Funktionen lokal nach `.supabase-test/`. Die bisherigen Upgrade-Migrationen dürfen dort nicht zusätzlich angewendet werden.

Die Migration ergänzt nur `rezept_import_nutzung` und `rezept_import_limit(uuid)`. RLS ist aktiv, Browserrollen erhalten keinerlei Zugriff. Nur `service_role` darf die Funktion aufrufen. Sie zählt nach `auth.getUser()` unter einer Zeilensperre maximal **10 Erkennungsaufträge pro Nutzer und UTC-Tag**, mit **60 Sekunden Mindestabstand**, auch über mehrere Edge-Instanzen. Ungültige Eingaben verbrauchen keinen Auftrag, nach Reservierung zählen auch Providerfehler. Es gibt keine automatischen kostenpflichtigen Wiederholungen. Die Tabelle enthält genau einen Zähler mit Zeitpunkten pro Nutzer; Löschung des Auth-Kontos entfernt ihn automatisch.

`OPENAI_API_KEY` wird ausschließlich nach Freigabe im Secret Manager des bestätigten Testprojekts hinterlegt. Keinen Schlüssel in Chat, Frontend, Repository oder Kommandoargumenten speichern. Eine direkte Eingabe im Supabase-Dashboard vermeidet eine lokale Datei. Konkrete Schritte: [README-TESTUMGEBUNG.md](README-TESTUMGEBUNG.md).

Supabase stellt `SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` serverseitig bereit. `verify_jwt = false` in `supabase/config.toml` entspricht den vorhandenen Funktionen: Die Funktion validiert jeden Import selbst über `auth.getUser()` und prüft das aktive Profil. Ohne Token, mit ungültigem Token oder mit einem zur Löschung gesperrten Konto erfolgt kein KI-Aufruf. Den API-Key niemals in `konfiguration.js`, Browsercode oder GitHub Pages eintragen.

Das Modell muss Bildinput und strikte Structured Outputs der Responses API unterstützen. Standard ist `gpt-4.1-mini`; ein anderes geeignetes Modell lässt sich ausschließlich serverseitig konfigurieren. Im OpenAI-Projekt Kostenkontrollen/Budgetwarnungen einrichten und Zugangsschlüssel beschränken. Die Nutzerlimits ersetzen kein projektweites Kostenbudget.

Deployment der Datenbank/Funktion vor dem Frontend. Bestehende Funktionen und Storage-Buckets bleiben erforderlich. Dieser Integrationsstand wurde ohne Supabase-Deployment oder bezahlten Erkennungsaufruf vorbereitet.

## Frontend und Nutzung

1. Unter **Hinzufügen → Rezept aus Kochbuch importieren** die Verarbeitung bestätigen. Bis zu sechs Seiten in Lesereihenfolge wählen oder einzeln mit der Kamera hinzufügen. Falsche Reihenfolge durch Entfernen und erneutes Hinzufügen korrigieren.
2. JPEG/PNG/WebP bis 20 MB und 60 Megapixel pro Original; HEIC gegebenenfalls vorher als JPEG exportieren. Im Browser nach Orientierung decodieren, längste Kante auf 2304 Pixel verkleinern, JPEG bis 1 MB pro Bild komprimieren; zusammen höchstens 5 MB. Canvas-Neukodierung überträgt keine ursprünglichen EXIF-Metadaten. Der Server begrenzt zusätzlich den tatsächlich gelesenen Body auf 8 MiB, prüft Base64, JPEG-Header, Abmessungen und die Bildanzahl.
3. **Rezepte erkennen** sendet alle Seiten gemeinsam. Mehrere Rezepte auf einem Bild sind getrennte Objekte; eindeutige Fortsetzungen werden zusammengeführt. Unsichere Fortsetzungen bleiben separat markiert. In der Vorschau sind manuelles Zusammenführen und Aufteilen über eine bearbeitbare Kopie möglich. Nach Aufteilen beide Fassungen und Quellen prüfen, überzählige Teile löschen. Quellen und Stellen bleiben sichtbar.
4. Beide Fassungen aufklappen und Namen/Zutaten/Zubereitung korrigieren; Einzeländerungen, Unsicherheiten und Randnotizen prüfen. Unlesbares bleibt ausdrücklich markiert. Nährwerte werden nur bei sichtbarer Angabe **pro Portion** übernommen; keine Schätzung, Berechnung oder Umrechnung. Der Originalbefund anderer Bezugsgrößen gehört in die Notizen.
5. Bildwahl beginnt immer bei **Kein Bild**. Ein gefundenes Gerichtsfoto lässt sich auswählen; Quellseite und Rechteck (in Prozent) sind korrigierbar, vollständige Seite und tatsächlicher Ausschnitt werden angezeigt. Alternativ bewusst ein Originalseitenbild speichern oder ein eigenes Foto im Formular auswählen. Es wird kein Gerichtsfoto generiert. KI-Koordinaten und Fotorezeptbezug können ungenau sein.
6. Prüfung bestätigen, ein Rezept ins bestehende Formular übernehmen, Zielgruppen auswählen und normal speichern. Ein selbst gewähltes Formularfoto ersetzt den Importausschnitt. Original, überarbeitete Fassung, einzelne Änderungen, Nährwertquellen und Notizen werden als getrennte Abschnitte im **Importprotokoll des Rezepttexts** erhalten. Daher sind sie nach normalem Speichern auch in Gruppenkopien und öffentlichen Rezeptlinks enthalten: vor dem Teilen prüfen. Insgesamt gilt die vorhandene Grenze von 20.000 Zeichen; zu lange Fassungen vor der Übernahme kürzen/aufteilen. Keine neue parallele Speicherroutine und keine neue Rezeptmetadaten-Spalte.
7. Weitere erkannte Rezepte bleiben während dieser Sitzung über den Importbutton verfügbar. Erneute Übernahme erzeugt bei erneutem Speichern ein neues Rezept; es gibt keine globale Dublettenerkennung. **Ergebnis als JSON sichern** lädt die getrennten Entwürfe ohne Bilder lokal herunter. Die Datei lässt sich zur Prüfung archivieren; automatisches Wiedereinlesen ist nicht implementiert.

Das Erkennungsergebnis ist ein Vorschlag und muss vollständig geprüft werden. Die automatische Extraktion kann keine perfekte OCR, Handschrifterkennung oder eindeutige Zuordnung garantieren. Fehlende Mengen niemals ergänzen, ohne sie am Original zu prüfen. Ein Originalseitenbild bezeichnet hier die komprimierte, orientierte Seite, nicht die unveränderte Quelldatei.

## Datenschutz

Bilder und Entwürfe bleiben nur im Arbeitsspeicher des Tabs; kein Local Storage, kein Supabase Storage, keine OpenAI Files API. Beim Schließen des Dialogs bleiben sie für weitere Einzelübernahmen erhalten; **Importdaten löschen**, Abmelden oder Neuladen entfernt sie aus dem lokalen Arbeitszustand. Laufende Antworten werden nach Löschen/Abmelden verworfen; ein bereits gestarteter Providerauftrag kann trotzdem fertiglaufen und zählt zum Limit. Nur das bewusst gewählte Rezeptbild wird beim normalen Speichern dauerhaft hochgeladen. Keine Bilddaten oder Providerantworten werden von der Funktion geloggt.

Die Responses API wird mit `store: false` aufgerufen. Das deaktiviert die gespeicherte API-Antwort, garantiert aber keine Zero Data Retention beim Dienstanbieter. Dessen vertragliche Bedingungen, Sicherheitsprotokolle und gegebenenfalls eingerichtete Aufbewahrungsregeln gelten weiterhin. Nutzer werden vor dem ersten Aufruf über OpenAI und mögliche Protokollierung informiert und müssen ausdrücklich zustimmen. Betreiber müssen Datenschutzhinweise/Verträge auf ihre tatsächliche Konfiguration abstimmen. Geschützte Buchfotos oder Texte nur im erlaubten Umfang verarbeiten und teilen.

Offizielle technische Grundlagen: [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [Datenverwendung und Aufbewahrung](https://developers.openai.com/api/docs/guides/your-data).

## Prüfen und Pages bauen

```bash
npm run check
npm test
npm run build
```

`npm test` umfasst den produktiven Importhandler mit injizierten Supabase-/OpenAI-Mocks: mehrere Rezepte pro Foto, Handschriftvarianten, Unsicherheiten, Zusammenführen, Authentifizierung, Profilstatus, Rate-Limit, fehlerhafte/überlange Daten, Providerfehler und Ablehnungen. Es entstehen keine OpenAI-Kosten. `tests/pages-test.cjs` prüft die explizite Dateiliste unter `/RezeptShare/`; Build und lokaler Server veröffentlichen den gemeinsamen Datenvertrag als `import-format.mjs`, niemals den Handler oder Secrets. Die vorhandene CSP erlaubt lokale ES-Module und Blob-Bildvorschauen; der Browser verbindet sich weiterhin ausschließlich mit Supabase.

Zusätzliche lokale Prüfungen mit temporären Testabhängigkeiten:

```bash
npm install --prefix /tmp/rezept-share-testdeps playwright @electric-sql/pglite --ignore-scripts --no-audit --no-fund
PGLITE_MODULE=/tmp/rezept-share-testdeps/node_modules/@electric-sql/pglite/dist/index.js npm run test:db
PORT=3188 npm start
# In anderem Terminal, vorhandenen Chrome oder Playwright-Chromium verwenden:
TEST_URL=http://127.0.0.1:3188 PLAYWRIGHT_MODULE=/tmp/rezept-share-testdeps/node_modules/playwright BROWSER_BINARY='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:import:browser
# Dieselben Umgebungsvariablen für npm run test:browser und npm run test:auth:browser.
```

Vor Produktivfreigabe manuell im Supabase-Testprojekt prüfen: echte JWTs und fehlende Anmeldung, Storage- und Gruppenrechte, reale Druck-/Handschriftseiten und Kameras auf iOS/Android, Dienstverfügbarkeit und Erkennungsqualität. Ein echter KI-Test verursacht Kosten und erfolgt nur nach ausdrücklicher Freigabe. PostgreSQL-Tests prüfen den 60-Sekunden-Abstand, das Tageslimit, UTC-Tageswechsel und den Ausschluss der Browserrollen; die atomare Reservierung verwendet `FOR UPDATE`.
