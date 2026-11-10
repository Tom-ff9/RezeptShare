# Rezept Share

Eine Rezept-App für Familien und kleine Gruppen. Die statische Webseite kann auf GitHub Pages liegen. Supabase verwaltet Anmeldung, Datenbank, private Bilder und die Serverfunktionen.

## Funktionen und Rechte

- Registrierung mit Anzeigename und Profilbild-Schritt direkt nach der Registrierung. „später festlegen“ verwendet die graue Standardsilhouette.
- Accounteinstellungen: Name und Foto ändern, Konto dauerhaft löschen.
- Persönliche Sammlung „Meine Rezepte“ und gemeinsame Gruppen mit Einladungslinks.
- „Gruppen filtern“ zeigt mehrere Gruppen gleichzeitig, mit Checkboxen und einer pro Account gespeicherten Auswahl. „Gruppen zuordnen“ erstellt unabhängige Kopien; Bearbeitungen bleiben auf die geöffnete Gruppenkopie beschränkt. Abwahl entfernt die Kopie nach Bestätigung und nur mit Löschrechten.
- „Rezept teilen“ erstellt einen unveränderlichen Rezeptstand inklusive Bild. Der Link ist ohne Anmeldung lesbar; zum Übernehmen in eigene Gruppen ist eine Anmeldung nötig. Freigaben zeigen „Geteilt von …“, übermitteln keine Gruppeninformationen und entfallen bei Löschung des teilenden Accounts.
- Admin: alle Rezepte bearbeiten/löschen, Einladungen, Rollen, Standardrolle für neue Beitritte und Adminübertragung.
- Mitglied: alle Rezepte hinzufügen/bearbeiten, nur eigene löschen.
- Beobachter: Rezepte und Bilder ansehen.
- „Neue Mitglieder dürfen nur Rezepte ansehen“ gilt beim Annehmen einer Einladung. Bestehende Rollen werden nicht verändert.
- Fremde Änderungen an Text/Titel werden grün markiert; entfernte Wörter bleiben durchgestrichen sichtbar. Nährwerte zeigen alte/neue Werte, Bildwechsel einen Hinweis. Adminbearbeitungen werden ebenso gekennzeichnet.
- Das Kreuz blendet einen Hinweis nur für das eigene Konto aus, auch auf anderen Geräten. Erneut veränderte Stellen erhalten neue Hinweise. Die eigenen Änderungen des ursprünglichen Erstellers entfernen dort bestehende Fremdmarkierungen.
- Hinweise und entfernte Textstellen sind nach einem Kalendermonat nicht mehr lesbar und werden durch einen minütlichen Job physisch aus den Anwendungstabellen gelöscht. Der aktuelle Rezeptinhalt bleibt erhalten; es gibt kein dauerhaftes Änderungsarchiv. Provider-Backups unterliegen separat deren Aufbewahrung.
- Kontolöschung erfordert Passwort und Bestätigung. Private Rezepte/Dateien werden gelöscht, gemeinsame Rezepte bleiben mit „Gelöschtes Konto“ erhalten. Admins müssen Gruppen mit weiteren Personen vorher übertragen.

## Neues Update: Mehrfachgruppen und Rezeptlinks

Nach den beiden bisherigen Migrationen `supabase/migrations/202611100001_rezeptgruppen_teilen.sql` einmal im SQL Editor ausführen. Bestehende Rezepte erhalten jeweils eine eigene Familie; die Inhalte bleiben erhalten. Danach deployen:

```bash
supabase functions deploy rezept-gruppen --no-verify-jwt
```

`rezept-gruppen` unterstützt `ansehen` ohne Anmeldung und die authentifizierten Aktionen `teilen`, `zuordnungen`, `erstellen`, `zuordnen`, `uebernehmen`. Schreibaufträge verwenden eine UUID zur sicheren Wiederholung. SQL-Transaktionen prüfen Gruppen-, Quell- und Löschrechte sowie Rezeptversionen erneut unter Sperre. Öffentliche Links enthalten einen zufälligen Token und ausschließlich den Rezeptstand, Bild und Anzeigenamen. Die privaten Buckets werden nicht öffentlich geschaltet.

Bilder werden für jede Zielgruppe und Freigabe separat gespeichert. Wird eine Datenbanktransaktion sicher abgelehnt, werden vorbereitete Dateien bereinigt. Bei unklarem Netzwerkstatus werden Dateien vorsichtshalber behalten; aktive Referenzen werden nie zur Fehlerbereinigung gelöscht. Solche verwaisten Dateien können später über die Gruppen-/Kontobereinigung entfernt werden. Freigabelinks haben in dieser Version kein Ablaufdatum und keine Verwaltungsoberfläche.

Der Live-SQL-Test `tests/live-rezeptgruppen.sql` prüft zwei temporäre Konten, Kopien, Freigaben und Abwahl innerhalb einer vollständig zurückgerollten Transaktion. Die Browsertests verwenden simuliertes Supabase und simuliertes CAPTCHA.

Backend zuerst deployen, danach das Frontend auf `main` pushen. Neue Installationen verwenden bereits das vollständige `supabase/schema.sql` und benötigen die Migrationen nicht zusätzlich.

## Vorheriges Update: Gruppenverwaltung

Wenn die erste Migration bereits ausgeführt wurde, jetzt **nur** `supabase/migrations/202611060002_gruppenverwaltung.sql` einmal im SQL Editor ausführen. Danach die neue Serverfunktion aus dem Projektordner deployen:

```bash
npx supabase functions deploy gruppe-loeschen
```

Für die Oberfläche zusätzlich `gruppen.js` zusammen mit den aktualisierten HTML-/JS-/CSS-Dateien veröffentlichen. Lokal den Server neu starten, damit er die neue Datei ausliefert.

- Das Zahnrad erscheint bei geöffneten gemeinsamen Gruppen für Admins. Der Dialog bündelt Namen, Beitritts-Toggle und Gruppenlöschung mit Bestätigung.
- Ein Plus-Button öffnet das Einladungsfenster. Der eigene Name trägt „(Du)“.
- Ein Klick auf eine Person zeigt Foto, Namen, Rolle und Anzahl ihrer aktuell vorhandenen Rezepte in dieser Gruppe. Admins können andere Personen entfernen, zwischen Mitglied/Beobachter wechseln oder die Adminrolle übertragen. Selbstentfernung und Entfernen des Admins sind gesperrt.
- Beim Entfernen bleiben Rezepte und deren Autorennamen erhalten; Gruppen- und Bildzugriff werden durch RLS entzogen. Schon ausgestellte Bildlinks laufen entsprechend ihrer bisherigen Gültigkeit aus.
- Bei einer Gruppenlöschung sperrt die Datenbank zuerst neue Schreibzugriffe. Die Edge Function entfernt Bilder in Paketen und anschließend die Gruppe mit Rezepten, Mitgliedschaften, Einladungen und Änderungshinweisen. Nach einem Fehler kann die Löschung über dasselbe Zahnrad wiederholt werden. Die persönliche Sammlung „Meine Rezepte“ lässt sich hier nicht löschen.
- Der frühere Stift im Accountmenü und seine separate Namensbearbeitung sind vollständig entfernt. Namen werden in den Accounteinstellungen geändert.

## Bestehendes Supabase-Projekt aktualisieren

**Nicht das neue Gesamtschema über ein bestehendes Projekt ausführen.**

1. Zuerst in einem separaten Supabase-Testprojekt testen und für das bestehende Projekt ein Backup erstellen.
2. Für ein Projekt ohne das erste Update im SQL Editor zunächst `supabase/migrations/202611060001_profile_rollen.sql`, danach `supabase/migrations/202611060002_gruppenverwaltung.sql` jeweils einmal ausführen. Die Migration erhält vorhandene Profile, Gruppen und Rezepte, wandelt `besitzer` in `admin` um und setzt für vorhandene Konten das abgeschlossene Profilbild-Onboarding. Neue Konten erhalten den Bildschritt.
3. Supabase Cron (`pg_cron`) muss verfügbar sein; das Skript aktiviert es und legt `rezept-aenderungen-bereinigen` an. Falls die Aktivierung im SQL Editor nicht erlaubt ist, Cron im Dashboard unter Integrations aktivieren und die vollständig zurückgerollte Migration erneut ausführen.
4. Die drei Edge Functions deployen, bevor die neue Oberfläche veröffentlicht wird:

```bash
supabase login
supabase link --project-ref DEINE_PROJEKT_REFERENZ
supabase functions deploy rezept-speichern
supabase functions deploy konto-loeschen
supabase functions deploy gruppe-loeschen
```

`supabase/config.toml` deaktiviert nur die vorgeschaltete Gateway-JWT-Prüfung. **Alle drei Funktionen prüfen den Benutzer selbst mit `auth.getUser()`**. Die internen Datenbankfunktionen sind ausschließlich für `service_role` freigegeben. `SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` werden von Supabase in der Edge-Laufzeit bereitgestellt. Keine geheimen Schlüssel in `konfiguration.js` oder Browsercode eintragen.

5. Den Testablauf unten im Testprojekt durchführen. Anschließend Migration/Functions im Zielprojekt und die statischen Dateien gemeinsam ausrollen. Während der Umstellung können alte offene Browserfenster keine Rezeptänderungen mehr speichern; neu laden.
6. Im Dashboard unter Cron prüfen, dass `rezept-aenderungen-bereinigen` jede Minute erfolgreich läuft. Fehler der Edge Functions im Dashboard unter Functions → Logs prüfen.

Die Änderungen sind im Quellcode vorbereitet. Ein Deployment erfolgt nicht durch `npm start` oder das Kopieren der HTML-Dateien.

## Neues Supabase-Projekt einrichten

1. Neues Projekt erstellen und `supabase/schema.sql` **einmal** im SQL Editor ausführen. Es enthält das vollständige Grundschema plus Upgrade; die separaten Migrationen danach nicht erneut ausführen.
2. Alle drei Edge Functions wie oben deployen.
3. Unter Authentication → Providers → Email **Confirm email deaktivieren** (main verwendet keine Bestätigungsmails).
4. Projekt-URL und öffentlichen Publishable/anon Key in `konfiguration.js` eintragen.
5. Unter Authentication → URL Configuration die Website als Site URL und Redirect URL hinterlegen. Unterverzeichnisse für GitHub Pages werden unterstützt.

## Lokal starten und prüfen

Node.js ab Version 22.13:

```bash
npm start
npm run check
npm test
```

Die Oberfläche läuft unter `http://127.0.0.1:3000`. Der lokale Server liefert ausschließlich statische Dateien. `npm test` prüft Wort-Diffs einschließlich Unicode/Überschneidungen/Ablauf, serverseitige Abläufe mit gemockten Supabase-Clients und die statische Auslieferung.

Zusätzlicher PostgreSQL-Test mit einer temporär installierten PGlite-Laufzeit:

```bash
npm install --prefix /tmp/rezept-share-testdeps @electric-sql/pglite --ignore-scripts --no-audit --no-fund
PGLITE_MODULE=/tmp/rezept-share-testdeps/node_modules/@electric-sql/pglite/dist/index.js npm run test:db
```

Er prüft echtes PostgreSQL-SQL/RLS mit nachgebildeten Auth-/Storage-Tabellen: Neuinstallation, Migration bestehender Konten, Rollen, Einladungen, Versionskonflikte, persönliche Ausblendung, Ablauf und wiederholbare Kontolöschung einschließlich Bild-Eigentümerschaft. Supabase Storage API, Auth-Server und Cron-Laufzeit werden hier nicht betrieben.

Browserprüfung mit Playwright und einem installierten Chromium-Browser, während der lokale Server läuft:

```bash
TEST_URL=http://127.0.0.1:3000 \
PLAYWRIGHT_MODULE=/absoluter/pfad/zu/playwright \
BROWSER_BINARY=/absoluter/pfad/zum/chromium \
npm run test:browser
```

Diese Tests verwenden ausschließlich gemockte Supabase-Antworten. Screenshots landen in `/tmp/rezept-share-*.png`.

## Integrationstest vor Veröffentlichung

Mit vier Testkonten (Admin, Mitglied, Beobachter, gruppenfremde Person):

1. Registrierung ohne E-Mail-Bestätigung, Fotoauswahl und Überspringen testen. Foto-/Namenswechsel und erneute Anmeldung prüfen; ungeeignete/zu große Dateien und fehlerhafte Uploads dürfen das alte Foto nicht ersetzen.
2. Beide Gruppeneinstellungen prüfen, auch Änderung zwischen Einladungserstellung und Annahme. Rollen vorhandener Personen müssen erhalten bleiben. Adminübertragung testen.
3. Berechtigungen zusätzlich direkt über REST/Storage prüfen: Beobachter können weder Rezepte noch Bilder schreiben; Mitglieder können fremde Rezepte nicht löschen; interne RPCs sind für Browser-JWTs gesperrt. Nach Herabstufung darf ein schon geöffnetes Formular nicht speichern.
4. Fremde und eigene Textänderungen, Einfügungen, Löschungen, Bild-/Nährwertwechsel, überlappende Bearbeitungen und zwei gleichzeitig geöffnete Editoren testen. Bei Versionskonflikten bleiben die Eingaben im Formular erhalten.
5. Hinweise ausblenden und mit einem anderen Konto sowie auf einem zweiten Gerät prüfen. Für den Ablauftest `ablauf_am` im Testprojekt zurücksetzen: sofort kein Lesezugriff mehr; nach spätestens einem Cron-Lauf auch aus der Datenbank und den Ausblendungen entfernt.
6. Kontolöschung mit falschem Passwort, fehlender Adminübertragung und anschließend korrekt testen. Erhaltene Gruppenbilder müssen weiter funktionieren. Unterbrochenen Ablauf erneut versuchen; bei begonnener Löschung sperrt ein Kontoflag weitere Schreibzugriffe. Das Profil bleibt bis zum erfolgreichen Auth-Löschschritt für einen Wiederholungsversuch vorhanden.
7. Neue Gruppenverwaltung prüfen: Admin kann umbenennen und die Beitrittsregel speichern; andere Rollen und gruppenfremde Konten dürfen das nicht. Mitgliederprofile zeigen gruppenbezogene Rezeptanzahl. Kick entzieht Zugriff und lässt Rezepte/Autoren erhalten. Gruppenlöschung mit/ohne Bilder sowie Wiederholung nach Storagefehler testen.
8. Auf Desktop und Mobilgerät Namen, Fotos, Dialoge, Rollensteuerung und Änderungshinweise prüfen.

## Projektaufbau

- `index.html`, `style.css`, `script.js`, `funktionen.js`, `gruppen.js`: Oberfläche und Browserlogik.
- `assets/profil-standard.svg`: eigene graue Standardsilhouette.
- `supabase/schema.sql`: vollständiges Schema für neue Projekte.
- `supabase/migrations/`: Upgrade für das bestehende Projekt.
- `supabase/functions/`: Kontolöschung, serverseitige Rezeptänderungen und Wort-Diff.
- `tests/`: lokale Logik-, Edge-, Datenbank- und Browserprüfungen.

Bilder sind privat und werden über zeitlich begrenzte Links angezeigt. Rezeptänderungen werden serverseitig berechnet und atomar mit Versionsprüfung gespeichert. Direkte Updates/Löschungen von Rezepten sind für Browserkonten gesperrt. Ersetzte Bilder werden nach erfolgreichem Speichern über die Storage API entfernt; bei einem Storage-Ausfall bleibt der neue Datensatz erhalten und die Dateibereinigung kann separat wiederholt werden. Die Kontolöschung prüft dagegen jeden Dateilöschschritt vor dem Löschen des Auth-Kontos.


## Lokale Branches und spätere E-Mail-Version

- `feature/email-bestaetigung`: gesicherter Stand mit Bestätigungsdialog, erneutem Versand, CAPTCHA-Schutz und Tests. Sicherungscommit: `641dd9c`.
- `main`: direkte Registrierung ohne Bestätigungsmails, mit anschließendem Profilbild-Schritt.

Es wurden keine Branches gepusht und keine öffentlichen Dienste geändert. Für spätere SMTP-Nutzung einen neuen Integrationsbranch von aktuellem `main` erstellen und die E-Mail-Implementierung aus `feature/email-bestaetigung` gezielt übernehmen. Ein normales Merge stellt die inzwischen auf main entfernten Funktionen nicht automatisch wieder her. Danach Tests anpassen und SMTP/Confirm email im Supabase-Projekt konfigurieren. Beide Branches verwenden dieselbe Supabase-Konfiguration; Git trennt keine Backend-Einstellungen.

## GitHub Pages ohne eigene Domain vorbereiten

Geplante Adresse: `https://Tom-ff9.github.io/RezeptShare/`.

1. Im Supabase-Dashboard unter Authentication → Sign In / Providers → Email **Confirm email ausschalten**. Das muss separat geschehen. Liefert Supabase bei Registrierung keine Sitzung, zeigt die App einen Fehler statt einer falschen Erfolgsmeldung. Bereits unbestätigte Konten einzeln prüfen; nicht pauschal bestätigen oder löschen.
2. Unter URL Configuration die geplante Adresse als Site URL und erlaubte Redirect URL setzen. Ohne Mail-Login wird aktuell kein Auth-Redirect erzeugt. Gruppenlinks enthalten `?einladung=…` auf demselben Projektpfad.
3. hCaptcha im Supabase-Dashboard serverseitig aktiv lassen. Der geheime Schlüssel bleibt dort. Im hCaptcha-Dashboard `tom-ff9.github.io` als erlaubten Host aufnehmen. Der öffentliche Sitekey steht in den zwei Widgets in `index.html`.
4. In GitHub unter Settings → Pages die Quelle **GitHub Actions** wählen. Jeder Push auf `main` startet den Workflow **GitHub Pages veröffentlichen** und aktualisiert die öffentliche Website nach erfolgreichen Prüfungen. Bei Bedarf lässt sich der Workflow auch unter Actions manuell mit Branch `main` starten. Der Workflow verweigert Deployments von anderen Branches.
5. Vor Veröffentlichung die Integrationstests oben gegen ein separates Supabase-Testprojekt durchführen. Insbesondere direkte Registrierung → Profilbild, erneute Anmeldung und direkte Auth-Aufrufe ohne/mit ungültigem CAPTCHA testen. Die letztgenannten müssen serverseitig abgewiesen werden.

Ohne E-Mail-Bestätigung ist die eingetragene Adresse kein Identitätsnachweis. Eine Gruppeneinladung verlangt weiterhin den passenden, gültigen Einladungstoken **und** die passende Adresse. Keine Gruppenberechtigung allein aus einer E-Mail-Adresse ableiten. Ohne SMTP steht auch keine Passwortwiederherstellung per Mail bereit.

## Öffentliche Dateien und Prüfung

`konfiguration.js` enthält nur die öffentliche Supabase-Projektadresse und den Publishable Key. hCaptcha-Sitekeys sind ebenfalls öffentlich. Datenzugriff wird durch RLS, Storage-Regeln und serverseitige Authentifizierung geschützt, nicht durch versteckte Frontend-Schlüssel. Service-Role-, SMTP- und CAPTCHA-Secret-Schlüssel gehören ausschließlich in serverseitige Einstellungen.

`npm run build` erzeugt `dist/` aus einer ausdrücklichen Dateiliste: `index.html`, `style.css`, `konfiguration.js`, `captcha.js`, `script.js`, `funktionen.js`, `gruppen.js`, `assets/profil-standard.svg` und `.nojekyll`. Zusätzlich werden `rezeptgruppen.js`, das App-Manifest und die Icon-Dateien ausgeliefert. Nur dieser Ordner wird veröffentlicht. SQL, Edge Functions, Tests und Dokumentation bleiben im öffentlichen Quellcode-Repository, werden aber nicht als Website ausgeliefert. Die alten Prototypseiten wurden entfernt. Lokale Daten unter `data/` bleiben erhalten und werden ignoriert.

Vor dem lokalen Sicherungscommit wurden alle neun bestehenden Commits sowie die aktuellen Dateien auf Geheimschlüssel, private Schlüssel, Datenbankdateien und auffällige Mailadressen geprüft. Keine echten Geheimnisse oder privaten Nutzerdaten gefunden; Testadressen verwenden reservierte Beispieldomains. Das ist eine gezielte Prüfung, keine Garantie gegen jede mögliche Form vertraulicher Daten. Bei späteren Funden Zugangsdaten rotieren und die Veröffentlichung stoppen; Historie nur bewusst bereinigen.

```bash
npm run check
npm test
npm run build
npm run test:auth:browser
```

Die Browserprüfungen benötigen Playwright, Chromium und einen laufenden lokalen Server (siehe oben). Auth-/Browsertests simulieren Supabase und CAPTCHA. Live-Einstellungen, echter Bot-Schutz und Rollenrechte müssen vor Freigabe gesondert geprüft werden. Der Pages-Workflow führt Code- und Projektprüfungen vor dem Build aus; Datenbank- und Browserprüfungen gehören zur lokalen Abnahme.
