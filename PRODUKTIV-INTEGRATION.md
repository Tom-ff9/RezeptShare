# RezeptShare – Integrations- und Release-Stand

Stand: 17. November 2026

Repository: `nordlicht78/RezeptShare`

Release-Branch: `feature/final-macstudio-integration`

Ausgangscommit: `ef0bcb5bd15039f5cb440155909db8e6d52ecc90`

## Zusammenfassung

Der integrierte lokale Stand behält Rezeptverwaltung, Auth, Gruppen/Mitglieder, bestehende Rezept-/Profilbilder, öffentliche Links, die Kochbuch- und Handschrifterkennung sowie die Zutaten- und Schrittansicht bei. Der bestehende KI-Assistent verwendet wieder die vorhandene Mac-Studio-Pipeline mit Ollama und Qdrant. Für den Browser-Test ist ein Loopback-Adapter ergänzt, der Supabase-Test-JWTs vor jeder Chat- oder Fortschrittsanfrage validiert. Die Produktionsinstanz wurde nicht angesprochen, migriert oder geändert.

Die bestätigte Testkonfiguration zeigt ausschließlich auf `hmjtzcebgbkryucvkndu`. Die lokalen Dateien `.supabase-test/target.json` und `konfiguration.lokal.js` bleiben ignoriert. Das Frontend erhält KI-Routen nur dynamisch vom geschützten lokalen Testserver; es gibt keine KI-URL und keinen privaten Schlüssel in der Browserdatei.

## KI-Architektur und gefundene Dienste

| Bestandteil | Ergebnis |
|---|---|
| Aktive Rezept-API | `/Users/afranke/ai-stack/recipe-rag/recipe_api.py`, FastAPI, OpenAI-kompatibles `POST /v1/chat/completions`, `GET /v1/models`, `GET /health` und `GET /v1/recipe-progress/{uuid}` |
| Chatmodell | Ollama `qwen3:14b` |
| Embeddingmodell | Ollama `bge-m3` |
| Vektorsuche | Qdrant Collection `recipes`; am 17.11.2026 read-only geprüft: grün, 3.492.886 Punkte, 1024 Vektordimensionen |
| Ollama | Erreichbar unter `127.0.0.1:11434`; die beiden erforderlichen Modelle sind vorhanden |
| Qdrant | Erreichbar unter `127.0.0.1:6333`; bestehende Collection wurde weder gelöscht noch neu indiziert |
| FastAPI | Lokal gestartet auf `127.0.0.1:8000`; Health-Endpunkt antwortete `ok` |
| Früherer Edge-Code | Im benachbarten Archiv liegt eine ältere `ki-assistent`-Function für OpenWebUI und getrennte Auth-Umgebung. Ihr Upstream-Vertrag passt nicht zur aktuellen FastAPI-/Qdrant-API; sie wurde deshalb nicht blind kopiert. |
| Docker/Startkonfiguration | Ollama und Qdrant-Prozesse laufen lokal; im untersuchten `recipe-rag`-Projekt wurde keine passende Compose-Datei oder API-Startdatei gefunden. Die API wird mit der vorhandenen virtuellen Umgebung gestartet. |

Die FastAPI verarbeitet Nachrichten im bisherigen OpenAI-kompatiblen Nachrichtenformat und gibt `choices[0].message.content` zurück. Die Integration kapselt dies wieder als `{answer}` für `ki-assistent.js`; Quellen bleiben Bestandteil der Antwort, die vorhandenen Rezeptkarten und Portionsumrechnung arbeiten weiter. Die Anfrage kann die im Mac-Backend unterstützten echten Fortschrittsphasen `received`, `planning`, `embedding`, `searching`, `filtering`, `found`, `generating`, `done` und `error` melden.

### Lokaler Auth-Adapter

Der Testserver bindet weiterhin ausschließlich an `127.0.0.1`. Seine Laufzeitkonfiguration setzt `kiUrl=/__local/ki-assistent` und `kiProgressUrl=/__local/ki-fortschritt`. Vor Weiterleitung prüft der Adapter:

- Same-origin-Aufruf vom erlaubten lokalen Host
- exakt den öffentlichen Publishable Key der bestätigten Testkonfiguration
- das Bearer-JWT mit `GET /auth/v1/user` am Testprojekt
- den aktiven Kontostatus des eigenen Profils mit einer read-only REST-Abfrage
- JSON-Größe, Rollen, Nachrichtenanzahl und Nachrichtenlänge

Danach darf er nur zum fest codierten Loopback-Upstream `127.0.0.1:8000` sprechen. Antworten, Fehler und Fortschrittsdaten werden strukturiert und ohne Cache zurückgegeben; Anfrageinhalte und Tokens werden nicht protokolliert. Ohne Anmeldung wurde HTTP 401 bestätigt. Der lokale API-Port wird nicht öffentlich freigegeben und es wurde kein Tunnel eingerichtet.

Zusätzlich ist `supabase/functions/ki-assistent` als kompatibler serverseitiger Adapter ergänzt. Sie prüft dieselbe Supabase-Authentifizierung und leitet nur zu einer per `RECIPE_ASSISTANT_UPSTREAM` gesetzten HTTPS-Adresse weiter. Der Zugriffsschlüssel muss als Secret `RECIPE_ASSISTANT_API_KEY` konfiguriert werden; fehlt er, antwortet die Function geschlossen mit 503. Beide Secrets wurden nicht gesetzt und die Function wurde nicht deployed.

## Lokale Testumgebung

Voraussetzungen: Ollama, Qdrant, Python-Umgebung `recipe-rag/.venv`, Testziel und ignorierte Testkonfiguration.

Terminal 1 – Mac-Studio-API lokal starten:

```bash
cd /Users/afranke/ai-stack/recipe-rag
./.venv/bin/python -m uvicorn recipe_api:app --host 127.0.0.1 --port 8000
```

Terminal 2 – RezeptShare nur mit bestätigtem Testprojekt starten:

```bash
cd /Users/afranke/ai-stack/recipe-rag/RezeptShare-KI/RezeptShare
PORT=3001 node scripts/start-test-live.cjs --confirm-ref hmjtzcebgbkryucvkndu
```

Browseradresse: **http://rezeptshare.test.example.com:3001**. Die Hostauflösung muss auf `127.0.0.1` zeigen. Der Server liefert nur die geprüfte Testprojektkonfiguration aus. Wenn der Mac-Studio-Dienst nicht läuft, zeigt der Chat einen verständlichen Fehler und ersetzt ihn nicht durch Demo-/Mockantworten.

## Supabase-Test und Produktion

Alle erlaubten Schreibfunktionen der bestehenden App sowie der Kochbuchimport bleiben Teil derselben RezeptShare-Testarchitektur. Das Testprojekt hatte bereits seinen ausdrücklich freigegebenen Bootstrap und die fünf bestehenden Funktionen erhalten. Diese Arbeiten wurden in diesem Integrationsschritt nicht erneut ausgeführt. Die neue Function `ki-assistent` wurde nur lokal ergänzt. Es gab keine Migration, kein Secret-Setzen und kein Edge-Function-Deployment.

Die Produktivkonfiguration wurde nicht aktiviert. Für die Produktivinstanz war in diesem Arbeitsverzeichnis keine bestätigte Projekt-ID vorhanden. `supabase projects list` konnte nicht gelesen werden, weil die lokale CLI nicht angemeldet ist (`AccessTokenRequiredError`); es wurde kein Token aus einer Datei oder Umgebung beschafft oder ausgegeben. Damit konnte das Produktivschema nicht sicher read-only abgefragt und der Test-/Integrationsstand nicht dagegen verglichen werden. Es wurden keine Verbindungen oder Schreibversuche zu einem Produktivprojekt gestartet.

Die historischen Migrationen (`202611060001_profile_rollen.sql`, `202611060002_gruppenverwaltung.sql`, `202611100001_rezeptgruppen_teilen.sql`, `202611140001_kochbuch_import.sql`) setzen bestehende Basistabellen voraus und sind kein Bootstrap für eine leere produktive Datenbank. Für ein vorhandenes Produktionsschema ist nur die additive Importkontingent-Erweiterung als Kandidat unter [kochbuchimport-produktiv.sql](docs/migrationen/kochbuchimport-produktiv.sql) vorbereitet. Sie prüft Voraussetzungen und bricht ab, falls die Importobjekte bereits existieren. Sie darf erst nach read-only Schema- und `supabase_migrations.schema_migrations`-Vergleich sowie eigener Freigabe angewendet werden. Der Test-Bootstrap `202611150001_test_bootstrap.sql` ist ausdrücklich ungeeignet für Produktion.

Diese Importerweiterung speichert ausschließlich Nutzer-ID, UTC-Tag, Auftragszähler und letzten Reservierungszeitpunkt. Sie verändert keine Benutzer-IDs, Gruppen, Mitgliedschaften, Rollen, Rezepte, Bilder, Storage-Pfade oder öffentlichen Links. Vor einer Produktivübernahme muss zusätzlich geprüft werden, dass `private.konto_aktiv(uuid)`, `auth.users` und die verwendeten Rollen vorhanden sind.

### Spätere kontrollierte Produktivübernahme

1. Produktionsprojekt-ID und URL unabhängig bestätigen; Zugang nur über den lokalen Supabase-Login, niemals über Chat oder Repository.
2. Schema, RLS, Trigger, Storage-Buckets, Policies und Migrationstabelle read-only exportieren und sichern.
3. Mit dem freigegebenen Branch vergleichen; nur additive Objekte genehmigen. Keine Benutzerkopien, keine Tabellen-Neuanlage bestehender Daten und keine automatischen Datenübernahmen.
4. Backup und Wiederherstellung für SQL-Metadaten und Storage vorher nachweisen.
5. Jede Migration und jedes Function-Deployment getrennt vorlegen und ausdrücklich freigeben lassen.
6. Bestehende Daten zunächst read-only smoke-testen, danach kontrollierte Schreibtests nur mit eigens gekennzeichneten Testdaten.

### Edge Functions und Secrets für eine spätere Veröffentlichung

- Bestehende Rezeptfunktionen und `rezept-importieren` müssen gegen das tatsächliche Produktionsschema und die dort aktivierten Policies geprüft werden.
- `ki-assistent` braucht einen stabilen, nur per HTTPS erreichbaren privaten/geschützten Backend-Endpunkt sowie serverseitige Secrets `RECIPE_ASSISTANT_UPSTREAM` und `RECIPE_ASSISTANT_API_KEY`.
- `ki-fortschritt` braucht optional `KI_PROGRESS_UPSTREAM`, falls Fortschritt über die Edge Function statt über den lokalen Adapter geliefert werden soll.
- `OPENAI_API_KEY` bleibt ausschließlich das Secret von `rezept-importieren`; sie wird für den Mac-Studio-Assistenten nicht verwendet.
- Die vorhandene FastAPI bindet derzeit auf Loopback. Ohne vorhandenen privaten Netzwerkpfad ist ein Edge-Function-Aufruf aus Supabase nicht möglich. Es wird kein ungeschützter Port und kein öffentlicher Tunnel eingerichtet.

## Backup und Rollback

- Vor jeder späteren Migration: konsistenter Datenbankbackup/Point-in-Time-Recovery-Status sowie Schemaexport sichern; Storage-Objekte und Policies separat inventarisieren.
- Die SQL-Kandidaten laufen transaktional. Ein Fehler vor `COMMIT` rollt die Änderung zurück.
- Ein Rollback des Frontends/der Edge Function erfolgt durch Rückkehr auf die vorherige geprüfte Version.
- Nach Nutzung des Importkontingents Tabelle nicht löschen: sie enthält Limitschutz-Historie. Bei Funktionsrollback bleibt sie zunächst bestehen. Ein Entfernen ist nur nach separater Prüfung, Backup und ausdrücklicher Freigabe möglich.
- Für die übrigen KI-Erweiterungen werden keine bestehenden Rezept-, Benutzer- oder Bilddaten migriert.

## Qualitätssicherung und Ergebnisse

- `npm run check` – erfolgreich.
- `npm test` – erfolgreich; inklusive Auth-/Rezept-/Gruppen-/Import-/Sicherheits- und neuer KI-Edge-Tests.
- `npm run build` – erfolgreich; 20 freigegebene Pages-Dateien.
- `npm run test:db` – erfolgreich mit PGlite; keine Cloud-Datenbank berührt.
- Der separate Produktionsmigrations-Entwurf wurde zusätzlich lokal gegen ein minimales PGlite-Schema geprüft: transaktionale Neuanlage funktioniert, bestehende Importobjekte lösen einen Abbruch aus und bleiben erhalten.
- `npm run test:browser:all` – erfolgreich; alle Browserregressionen liefen mit kontrollierten Supabase-/KI-Mocks, ohne Live-Schreibzugriffe.
- Mac-Studio-Health – HTTP 200; Ollama-Modelle und Qdrant-Collection read-only erreichbar.
- Eine echte lokale RAG-Anfrage an FastAPI – HTTP 200, Antwort und Quellen enthalten; nur Ollama/Qdrant lokal, kein OpenAI-Aufruf.
- Live-Testserver – Start auf `127.0.0.1:3001`, Startschutz akzeptierte ausschließlich `hmjtzcebgbkryucvkndu`; ausgelieferte URL zeigt auf dieses Testprojekt. Nicht authentifizierte KI-Adapteranfrage wurde mit 401 abgewiesen.
- Headless-Chrome-Smoke auf der lokalen Testadresse – HTTP 200, Titel „Rezept Share“, Landingpage sowie Anmeldung/Registrierung sichtbar, keine Browser-JavaScriptfehler. Der Browser-Steuerungsdienst für eine interaktive bestehende Chrome-Sitzung war nicht verfügbar.
- Keine angemeldete Live-Supabase-Sitzung mit der echten UI geprüft; es wurde kein Testrezept und kein Cloud-Schreibvorgang erzeugt.
- Produktionsschema-Audit steht wegen fehlendem lokalen Supabase-CLI-Login und fehlender bestätigter Produktionsreferenz aus.

Es gab keine kostenpflichtigen API-Aufrufe, Secrets, Migrationen, Deployments, GitHub-Schreibvorgänge oder Änderungen an Produktionsdaten.

## Freigabecheckliste vor Veröffentlichung

- [ ] bestätigte Produktionsprojekt-ID und URL
- [ ] schreibgeschützter Vergleich von Produktionsschema, Policies, Buckets und Migrationstabelle
- [ ] geprüfter Produktionsmigrationsplan plus getestete Wiederherstellung
- [ ] geschützter HTTPS-Zugang vom Edge-Netz zum Mac-Studio-Backend (oder explizit genehmigter Hostingpfad)
- [ ] serverseitige KI- und Import-Secrets im richtigen Projekt vorhanden
- [ ] Functions einzeln gegen Produktionsrechte und Datenbestand geprüft
- [ ] Testkonto-Live-Login und Gruppen-/Rezept-/Bildtests abgeschlossen
- [ ] Freigabe für jede Migration und jedes Deployment
- [ ] Release-Commit und separater Push-/PR-/Merge-Beschluss
