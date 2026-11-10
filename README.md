<div align="center">

# Rezept Share

**Rezepte · Familien · Gruppen · Gemeinsam kochen**

![Letzter Commit](https://img.shields.io/github/last-commit/Tom-ff9/RezeptShare?style=flat-square&color=16242d&labelColor=070e15)
![JavaScript](https://img.shields.io/badge/Frontend-JavaScript-16242d?style=flat-square&logo=javascript&logoColor=ffffff&labelColor=070e15)
![Supabase](https://img.shields.io/badge/Backend-Supabase-16242d?style=flat-square&logo=supabase&logoColor=ffffff&labelColor=070e15)

Eine Web-App, um Rezepte persönlich zu sammeln, in Gruppen zu bearbeiten und per Link zu teilen.

[App öffnen](https://Tom-ff9.github.io/RezeptShare/)

</div>

---

## Technik

| Bereich | Umsetzung |
|---|---|
| Oberfläche | HTML, CSS und JavaScript ohne Framework |
| Anmeldung und Datenbank | [Supabase Auth und PostgreSQL](https://supabase.com/) |
| Bilder und Serverfunktionen | Supabase Storage und Edge Functions |
| Bot-Schutz | [hCaptcha](https://www.hcaptcha.com/) |
| Lokaler Server und Tests | [Node.js](https://nodejs.org/) ab 22.13 |
| Hosting | [GitHub Pages](https://docs.github.com/en/pages) über GitHub Actions |

---

## Schnellstart

Mit Node.js ab 22.13 lässt sich die Oberfläche lokal starten; Anmeldung und Daten benötigen ein eingerichtetes Supabase-Projekt.

```bash
git clone https://github.com/Tom-ff9/RezeptShare.git
cd RezeptShare
npm start
```

Anschließend [localhost:3000](http://127.0.0.1:3000) öffnen. Die Backend-Verbindung steht in [`konfiguration.js`](konfiguration.js).

---

## Funktionen

- Persönliche Rezeptsammlung und gemeinsame Gruppen mit Einladungslinks.
- Rezepte mit Bildern und Nährwerten; unabhängige Kopien für mehrere Gruppen.
- Öffentliche Rezeptlinks mit festem Rezeptstand und Übernahme nach Anmeldung.
- Gruppenrollen: Admin, Mitglied und Beobachter mit abgestuften Rechten.
- Markierte Änderungen anderer Personen, individuell ausblendbar und nach einem Monat entfernt.
- Profile mit Anzeigename und Foto sowie Konto- und Gruppenverwaltung.

---

## Einrichtung und Deployment

<details>
<summary><b>Supabase einrichten</b></summary>

1. Für ein neues Projekt [`supabase/schema.sql`](supabase/schema.sql) einmal im SQL Editor ausführen. Cron muss verfügbar sein.
2. Für bestehende Projekte nur die noch fehlenden [Migrationen](supabase/migrations/) in Dateireihenfolge ausführen; vorher Backup erstellen und im Testprojekt prüfen. Das Gesamtschema nicht erneut anwenden.
3. Die vier Edge Functions vor dem Frontend deployen:

```bash
supabase login
supabase link --project-ref DEINE_PROJEKT_REFERENZ
supabase functions deploy rezept-speichern
supabase functions deploy konto-loeschen
supabase functions deploy gruppe-loeschen
supabase functions deploy rezept-gruppen
```

4. Projekt-URL und öffentlichen Publishable-/anon-Key in `konfiguration.js` eintragen. Geheimschlüssel bleiben ausschließlich serverseitig.
5. In Supabase **Confirm email deaktivieren** und die Website als Site URL und Redirect URL eintragen. Diese Version verwendet keine Bestätigungsmails.
6. hCaptcha in Supabase aktivieren, den öffentlichen Sitekey in `index.html` setzen und den Website-Host bei hCaptcha freigeben.

Private Bilder werden über zeitlich begrenzte Links geladen. Datenbankregeln und Edge Functions prüfen die Zugriffsrechte; freigegebene Rezeptstände sind über ihren Link öffentlich lesbar.

</details>

<details>
<summary><b>GitHub Pages veröffentlichen</b></summary>

- Im Repository unter **Settings → Pages** die Quelle **GitHub Actions** auswählen.
- Ein Push auf `main` startet den [Pages-Workflow](.github/workflows/pages.yml): Codeprüfung, Tests, Build und Veröffentlichung.
- `npm run build` erzeugt `dist/` mit den freigegebenen Website-Dateien; nur dieser Ordner wird veröffentlicht.
- Supabase-Migrationen, Edge Functions und Auth-/CAPTCHA-Einstellungen werden separat eingerichtet.

</details>

---

## Entwicklung

<details>
<summary><b>Projektaufbau</b></summary>

- `index.html`, `style.css` — Oberfläche und Gestaltung.
- `script.js`, `funktionen.js`, `gruppen.js`, `rezeptgruppen.js` — Rezept-, Konto- und Gruppenlogik.
- `assets/`, `manifest.webmanifest` — Profilgrafik, App-Icons und Manifest.
- `supabase/` — Datenbankschema, Migrationen und Edge Functions.
- `tests/` — Logik-, Server-, Datenbank- und Browsertests.
- `server.js`, `scripts/` — lokaler Server und Website-Build.

</details>

<details>
<summary><b>Prüfungen</b></summary>

```bash
npm run check
npm test
npm run build
```

Für Datenbanktests mit PGlite:

```bash
npm install --prefix /tmp/rezept-share-testdeps @electric-sql/pglite --ignore-scripts --no-audit --no-fund
PGLITE_MODULE=/tmp/rezept-share-testdeps/node_modules/@electric-sql/pglite/dist/index.js npm run test:db
```

Browsertests (`npm run test:browser` und `npm run test:auth:browser`) benötigen einen laufenden lokalen Server, Playwright und Chromium. Dazu `TEST_URL`, `PLAYWRIGHT_MODULE` und `BROWSER_BINARY` setzen. Die Tests simulieren Supabase und CAPTCHA; echte Anmeldung, Rollenrechte und Storage vor Veröffentlichung separat prüfen.

</details>
