<div align="center">

# Rezept Share

**Rezepte · Familien · Gruppen · Gemeinsam kochen**

![Letzter Commit](https://img.shields.io/github/last-commit/nordlicht78/RezeptShare?style=flat-square&color=16242d&labelColor=070e15)
![JavaScript](https://img.shields.io/badge/Frontend-JavaScript-16242d?style=flat-square&logo=javascript&logoColor=ffffff&labelColor=070e15)
![Supabase](https://img.shields.io/badge/Backend-Supabase-16242d?style=flat-square&logo=supabase&logoColor=ffffff&labelColor=070e15)

Eine Web-App, um Rezepte persönlich zu sammeln, in Gruppen zu bearbeiten und per Link zu teilen.

[Lokale Testanleitung](README-TESTUMGEBUNG.md)

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

Mit Node.js ab 22.13 lässt sich die Oberfläche lokal starten. Dieser Integrationsstand enthält bewusst keine aktiven Projektadressen. Eine vollständig isolierte Demo startet mit `npm run demo`; echte Anmeldung und KI benötigen ein separates, freigegebenes Testprojekt (siehe [README-TESTUMGEBUNG.md](README-TESTUMGEBUNG.md)).

```bash
git clone https://github.com/nordlicht78/RezeptShare.git
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
- KI-Assistent mit Rezeptkarten, Portionenumrechnung, deutschen Titeln, metrischen Mengen und optionalem Serverfortschritt.
- KI-Import von Kochbuchseiten und Handschrift mit prüfbaren Fassungen und Bildausschnitten; Einrichtung und Grenzen in [README-IMPORT.md](README-IMPORT.md).

---

## Einrichtung und Deployment

**Integrationsbranch:** Keine bestehenden Supabase-Projekte verwenden. Migrationen, Secrets und Deployments erst nach ausdrücklicher Freigabe und ausschließlich nach [README-TESTUMGEBUNG.md](README-TESTUMGEBUNG.md). Die folgenden allgemeinen Schritte ersetzen diesen Freigabeprozess nicht.

<details>
<summary><b>Supabase einrichten</b></summary>

Der Integrationsstand ist für ein separates Testprojekt vorbereitet. [README-TESTUMGEBUNG.md](README-TESTUMGEBUNG.md) enthält das lokale Bootstrap-Paket, die genaue Funktionsliste und die erforderlichen Freigaben für Migration, Secret und Deployment. Den vorhandenen Projekten wird nichts hinzugefügt.

Private Bilder verwenden weiterhin zeitlich begrenzte Links; Datenbankregeln und Edge Functions prüfen die bestehenden Gruppenrechte.

</details>

<details>
<summary><b>GitHub Pages veröffentlichen</b></summary>

- Im Repository unter **Settings → Pages** die Quelle **GitHub Actions** auswählen.
- Der [Pages-Workflow](.github/workflows/pages.yml) veröffentlicht ausschließlich nach manuellem Start und ausdrücklicher Bestätigung. Feature-Pushes führen nur Prüfungen aus.
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
