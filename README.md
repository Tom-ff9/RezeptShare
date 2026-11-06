# Rezept Share

Eine Rezept-App für Familien und kleine Gruppen. Die statische Webseite kann auf GitHub Pages liegen. Supabase verwaltet Anmeldung, Datenbank, private Bilder und die Serverfunktionen.

## Funktionen und Rechte

- Registrierung mit Anzeigename und Profilbild-Schritt nach der ersten Anmeldung bzw. E-Mail-Bestätigung. „später festlegen“ verwendet die graue Standardsilhouette.
- Accounteinstellungen: Name und Foto ändern, Foto entfernen, Konto dauerhaft löschen.
- Persönliche Sammlung „Meine Rezepte“ und gemeinsame Gruppen mit Einladungslinks.
- In der Rezeptliste zeigt die Gruppenauswahl „Alle“ die zugänglichen Rezepte aller Gruppen. Hinzufügen und Bearbeiten verwenden immer eine konkrete Gruppe; die Rechte richten sich nach der Gruppe des jeweiligen Rezepts.
- Admin: alle Rezepte bearbeiten/löschen, Einladungen, Rollen, Standardrolle für neue Beitritte und Adminübertragung.
- Mitglied: alle Rezepte hinzufügen/bearbeiten, nur eigene löschen.
- Beobachter: Rezepte und Bilder ansehen.
- „Neue Mitglieder dürfen nur Rezepte ansehen“ gilt beim Annehmen einer Einladung. Bestehende Rollen werden nicht verändert.
- Fremde Änderungen an Text/Titel werden grün markiert; entfernte Wörter bleiben durchgestrichen sichtbar. Nährwerte zeigen alte/neue Werte, Bildwechsel einen Hinweis. Adminbearbeitungen werden ebenso gekennzeichnet.
- Das Kreuz blendet einen Hinweis nur für das eigene Konto aus, auch auf anderen Geräten. Erneut veränderte Stellen erhalten neue Hinweise. Die eigenen Änderungen des ursprünglichen Erstellers entfernen dort bestehende Fremdmarkierungen.
- Hinweise und entfernte Textstellen sind nach einem Kalendermonat nicht mehr lesbar und werden durch einen minütlichen Job physisch aus den Anwendungstabellen gelöscht. Der aktuelle Rezeptinhalt bleibt erhalten; es gibt kein dauerhaftes Änderungsarchiv. Provider-Backups unterliegen separat deren Aufbewahrung.
- Kontolöschung erfordert Passwort und Bestätigung. Private Rezepte/Dateien werden gelöscht, gemeinsame Rezepte bleiben mit „Gelöschtes Konto“ erhalten. Admins müssen Gruppen mit weiteren Personen vorher übertragen.

## Neues Update: Gruppenverwaltung

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
3. Unter Authentication → Providers → Email die E-Mail-Bestätigung aktivieren.
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

1. Registrierung inklusive E-Mail-Bestätigung, Fotoauswahl und Überspringen testen. Foto-/Namenswechsel, Fotoentfernung und erneute Anmeldung prüfen; ungeeignete/zu große Dateien und fehlerhafte Uploads dürfen das alte Foto nicht ersetzen.
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
