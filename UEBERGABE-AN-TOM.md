# RezeptShare – Übergabe an Tom

Stand: 17. November 2026
Quellrepository: [nordlicht78/RezeptShare](https://github.com/nordlicht78/RezeptShare)
Übergabebranch: `feature/tom-production-handover`
Vorgesehenes Zielrepository: [Tom-ff9/RezeptShare](https://github.com/Tom-ff9/RezeptShare), Branch `main`
Tom-Supabase-Projekt laut Übergabe: `gcncxupedhwieybpiupi`
Gesperrtes Testprojekt: `hmjtzcebgbkryucvkndu`

## A. Von mir vorbereitet

### Release-Inhalt

Der Übergabebranch enthält den integrierten RezeptShare-Stand ab dem gesicherten Mac-Studio-Release `1942bae9e060a0aea4677463883f440358c864a3`, darunter:

- Bestehende Anmeldung, Gruppen, Mitglieder, Rezepte, Bilder und öffentliche Rezeptlinks.
- Kochbuchimport aus gedruckten, handschriftlichen und gemischten Seiten, einschließlich mehrerer Rezepte/Seiten, Änderungen, Unsicherheiten, Ausschnitten und Vorschau.
- Rezeptdarstellung mit Zutatenlisten und nummerierten Zubereitungsschritten.
- Mac-Studio-Rezeptassistent mit FastAPI, Ollama `qwen3:14b`, Embeddings `bge-m3`, Qdrant-Collection `recipes`, Quellen und Fortschrittsphasen.
- Regression-, Datenbank- und Browserprüfungen mit synthetischen Antworten/Mocks; keine OpenAI-Aufrufe durch diese Prüfungen.

Der branch enthält keine Produktivmigrationen, Deployments oder Secret-Werte. Toms Repository und Supabase-Daten wurden nicht verändert.

### Bestehende Import-Function und Releasepaket

Es wird die bestehende Function `rezept-importieren` verwendet, keine neue Importimplementierung. `npm run package:tom:supabase` baut ein eigenständiges Tar-Releasepaket aus genau:

- `supabase/functions/rezept-importieren/index.ts`
- den benötigten Modulen `supabase/functions/_shared/http.ts`, `import-handler.mjs` und `import-format.mjs`
- `supabase/config.toml` mit `verify_jwt = false` für diese Function; der Handler prüft die Supabase-Sitzung selbst über `auth.getUser()`
- dem read-only Schemaaudit und dem additiven SQL-Entwurf

Das Paket enthält keine Browserkonfiguration oder Schlüssel. Es wird lokal unter `.release-artifacts/` erstellt; der Ordner ist Git-ignoriert und wird nicht in den Pages-Build aufgenommen. Prüfsummen liegen im Paket unter `SHA256SUMS`.

**Warum die Test-Function für Toms Benutzer nicht funktioniert:** Supabase-JWTs und `auth.getUser()` sind an das jeweilige Projekt gebunden. Die im Testprojekt bereitgestellte Function benutzt Testprojekt-URL, Testprojekt-Auth und Testprojekt-Service-Rolle. Toms Benutzer-JWT wird dort nicht als Toms Konto authentifiziert; würde man die Test-Function-URL weiterverwenden, bliebe sie außerdem an Datenbank und Secrets des Testprojekts gekoppelt. Deshalb muss derselbe bestehende Function-Code im Projekt `gcncxupedhwieybpiupi` laufen.

### SQL-Erweiterung

[`docs/migrationen/kochbuchimport-produktiv.sql`](docs/migrationen/kochbuchimport-produktiv.sql) ist ein additiver, transaktionaler Entwurf. Er legt nur dann neu an, wenn die geprüften Voraussetzungen erfüllt sind:

1. `rezept_import_nutzung` und `rezept_import_limit(uuid)` für höchstens 10 Importreservierungen pro Nutzer und UTC-Tag mit 60 Sekunden Abstand.
2. `rezept_import_api_nutzung` für tatsächliche Responses-API-Tokenwerte pro Import. Gespeichert werden Nutzer-ID, Response-ID, Modell sowie die vom API-Ergebnis gemeldeten Input-/Output-/Gesamttoken; optional die gemeldeten Cached-/Reasoning-Token. Es werden keine Bilder, Prompts, Rezepttexte oder API-Schlüssel gespeichert. RLS ist aktiv; direkter Zugriff ist auf `service_role` beschränkt.

Das SQL prüft die Abhängigkeit `private.konto_aktiv(uuid)` und `auth.users`, bricht bei bereits vorhandenen Importobjekten ab und verändert keine vorhandenen Rezepte, Gruppen, Mitgliedschaften, Benutzer-IDs oder Bilder. PGlite prüft Anlage, RLS, Rollenrechte und Abbruch bei Konflikten. Diese lokale Prüfung bestätigt **keine** Kompatibilität mit Toms unbekanntem Schema.

Für den regulären Migrationsverlauf bei einer Installation, die die vorhandene Importlimit-Migration bereits registriert hat, gibt es zusätzlich `supabase/migrations/202611170001_kochbuch_import_api_nutzung.sql`. Sie setzt `202611140001_kochbuch_import.sql` voraus und ergänzt nur die Token-Nutzungstabelle. Der beigefügte produktive SQL-Entwurf ist dagegen ein gebündelter Kandidat für ein geprüftes Schema, in dem beide Importobjekte noch fehlen. Tom muss nach dem Audit genau einen passenden Weg auswählen; beide Varianten dürfen nicht nacheinander auf dieselbe Datenbank angewendet werden.

Ein separates read-only Audit liegt unter [`docs/migrationen/kochbuchimport-audit-readonly.sql`](docs/migrationen/kochbuchimport-audit-readonly.sql). Mein Versuch gegen Toms angegebene Projekt-ID wurde mit HTTP 403 (`database_read` nicht berechtigt) abgewiesen; die SQL-Abfrage wurde nicht ausgeführt. Projekt-ID und URL sind als Nutzerangabe dokumentiert, nicht durch Dashboard/API unabhängig bestätigt.

Das additive KI-Limit liegt in [`supabase/migrations/202611170002_ki_assistent_nutzungslimit.sql`](supabase/migrations/202611170002_ki_assistent_nutzungslimit.sql); der identische Übergabeentwurf liegt in [`docs/migrationen/ki-assistent-nutzungslimit.sql`](docs/migrationen/ki-assistent-nutzungslimit.sql). Es verlangt `auth.users` und `private.konto_aktiv(uuid)`, fügt nur `public.ki_assistent_nutzung` sowie zwei service-role-only RPCs hinzu und verändert keine vorhandenen Tabellenzeilen oder Rezeptdaten. Zeilenlocks begrenzen auf 20 reservierte Anfragen pro Benutzer/UTC-Tag und genau eine aktive Anfrage. Provider-/Netzwerkfehler verbrauchen eine Anfrage, geben aber die aktive Sperre im `finally` frei; nach Prozessabbruch verfällt eine verwaiste Sperre nach drei Minuten. Gespeichert werden nur Benutzer-UUID, Tag, Zähler, zufällige Request-UUID und Reservierungszeit; keine IP, Prompts, Rezepte oder Antworten. Bei Ablehnung antwortet `ki-assistent` mit HTTP 429, verständlichem Text und `Retry-After`. Vor Toms Function-Deployment muss Tom das Produktionsschema abgleichen und diese Migration separat freigeben/anwenden. PGlite prüft Limits, UTC-Wechsel, Parallelreservierung, Fehlerfreigabe, verwaiste Lease und Berechtigungen lokal.

Die übrigen Integrationsmigrationen in `supabase/migrations/` sind nicht pauschal freigegeben: `202611060001_profile_rollen.sql` enthält unter anderem ein Update von Gruppenrollen (`besitzer` → `admin`) und weitere bestehende Tabellen-/FK-Anpassungen. `202611100001_rezeptgruppen_teilen.sql` fügt Rezeptfamilien, Freigaben und einen Storage-Bucket hinzu. Sie dürfen nicht blind auf Toms Bestand angewendet werden. Vorher muss Tom das reale Schema gegen jede Migration vergleichen und Änderungen mit bestehender Funktionalität und Datenbestand abgleichen.

### KI-Assistent und Mac Studio

`ki-assistent` und optional `ki-fortschritt` verwenden die vorhandene FastAPI-/Ollama-/Qdrant-Architektur. Die Edge Functions prüfen zuerst das RezeptShare-Supabase-JWT und ein aktives Nutzerprofil. Im ausdrücklich konfigurierten Modus `RECIPE_ASSISTANT_ACCESS_MODE=caddy` sprechen sie über HTTPS und senden zusätzlich `Authorization: Bearer …` mit dem separaten Mac-API-Schlüssel. Der Standardmodus `cloudflare` bleibt aus Kompatibilitätsgründen erhalten und verlangt weiterhin zusätzlich die beiden Access-Token-Secrets. FastAPI vergleicht den Schlüssel konstantzeitlich und liest ihn aus einer lokalen Datei mit Eigentümerprüfung und Modus `0600`; Schlüsselwerte stehen nicht in Prozessargumenten, Logs oder im Frontend. Die öffentliche Caddy-Vorlage erlaubt ausschließlich Chat und UUID-Fortschritt; alle anderen Pfade antworten 404.

Vorgesehene Secret-Namen im **Toms Supabase-Projekt**:

**Vorgesehener KI-Endpunkt:** `https://kronshagen.hopto.org:8443`, noch nicht eingerichtet. Port 443 liefert derzeit die FRITZ!Box-Oberfläche; deshalb nutzt der Entwurf Port 8443, damit der bestehende HTTPS-Dienst erhalten bleibt. Das öffentliche Zertifikat soll Caddy per ACME erhalten. Derzeit antwortet Port 443 mit einem selbstsignierten FRITZ!Box-Zertifikat; Port 80 und 8443 sind von außen nicht erreichbar. Die KI-Route ist nicht geladen.

| Name | Zweck |
|---|---|
| `RECIPE_ASSISTANT_ACCESS_MODE` | Für Caddy explizit `caddy`; der sichere Standard bleibt `cloudflare` |
| `RECIPE_ASSISTANT_UPSTREAM` | `https://kronshagen.hopto.org:8443` nach Zertifikats- und Routetest |
| `RECIPE_ASSISTANT_ACCESS_CLIENT_ID` | Nur im beibehaltenen Cloudflare-Modus erforderlich |
| `RECIPE_ASSISTANT_ACCESS_CLIENT_SECRET` | Nur im beibehaltenen Cloudflare-Modus erforderlich |
| `RECIPE_ASSISTANT_API_KEY` | Zufälliger Backend-Bearer-Schlüssel, identisch mit dem geschützten lokalen Tokenfile |
| `KI_PROGRESS_UPSTREAM` | `https://kronshagen.hopto.org:8443/v1/recipe-progress/`; optional für Fortschritt |
| `OPENAI_API_KEY` | Nur für `rezept-importieren`, serverseitig im Tom-Projekt |
| `OPENAI_IMPORT_MODEL` | Optionaler Modellname; Standard ist `gpt-4.1-mini` |

Die automatisch von Supabase bereitgestellten Werte `SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` werden nicht als manuelle Secrets aus dem Browser übernommen. `RECIPE_ASSISTANT_API_KEY` wird ausschließlich serverseitig in beiden Mac-Assistenten-Edge-Functions gesetzt; derselbe Wert wird auf dem Mac in `~/Library/Application Support/RezeptShare/recipe-api-token` gespeichert. `mac-studio/manage_api_token.py` legt die Datei mit Verzeichnisrechten `0700` und Dateirechten `0600` an und gibt den Schlüssel nie aus. Ein manuelles `--copy-to-clipboard` kopiert ihn ohne Terminalausgabe zur späteren Eingabe in Supabase. Keine Secret-Werte gehören in Git, Browserdateien oder dieses Handbuch.

### Tatsächlicher Mac-Status und Sicherheitsblocker

Read-only geprüft und lokal angepasst:

- FastAPI-Health antwortete auf `127.0.0.1:8000`; Ollama antwortete mit `qwen3:14b` und `bge-m3`; Qdrant antwortete mit der bestehenden Collection `recipes`. Es wurde nichts neu indiziert.
- Qdrant-Docker-Ports `6333`/`6334` sind an `127.0.0.1` gebunden und die Restart-Policy lautet `always`. Ollama hörte auf `127.0.0.1:11434`.
- Die aktive FastAPI ist jetzt auf `127.0.0.1:8000` begrenzt. Der bestehende LaunchAgent `de.franke.recipe-api` startet den geprüften Wrapper `mac-studio/run_recipe_api.py` mit `KeepAlive`, `RunAtLoad`, ohne Access-Logs und mit begrenzter Rotation privater Logs. Die bisherige plist wurde unter `~/Library/LaunchAgents/de.franke.recipe-api.plist.before-cloudflare-auth.20261117` gesichert. Der alte Dienst auf `0.0.0.0:8001` wurde gestoppt; Port 8001 ist frei. Eine zusätzliche zuvor manuell gestartete API auf 8000 wurde kontrolliert beendet. Nach dem neuen Start meldete `launchctl` `running`, `lsof` zeigte ausschließlich `127.0.0.1:8000`, und ein kontrollierter `kickstart -k` plus Healthcheck war erfolgreich.
- Das zufällige Mac-API-Bearer liegt unter `~/Library/Application Support/RezeptShare/recipe-api-token` mit Eigentümerin `afranke`, Dateimodus `0600`, Verzeichnis `0700`. Der Wert wurde weder ausgegeben noch in die Zwischenablage kopiert. Noch wurde er nicht als Supabase-Secret gesetzt.
- Die laufende API-Datei `recipe_api.py` wurde lokal um Bearer-Prüfung für Chat, Modelle, Fortschritt und Health ergänzt; `/docs`, `/redoc` und `/openapi.json` sind deaktiviert. Die alte API-Datei ist unter `recipe_api.py.before-cloudflare-auth.bak` gesichert. Ohne/wrong Bearer ergaben Live-Requests HTTP 401, mit gültigem Schlüssel HTTP 200.
- Der vorhandene `ki-proxy`-Nginx-Container bindet Port `57001` an alle Interfaces. Er wurde nicht geändert oder gestoppt; sein früherer API-Upstream auf Port 8001 ist jetzt geschlossen. Ein unauthentifizierter lokaler Aufruf des Progresspfads über diesen Legacy-Proxy ergab HTTP 502. Ein read-only HTTPS-Aufruf an `kronshagen.hopto.org` lieferte die FRITZ!Box-Startseite (Titel `FRITZ!Box`) mit selbstsigniertem Zertifikat. Port 57001 ist von außen nicht erreichbar. Auch OpenWebUI auf Port 3000 ist separat breit gebunden; unverändert belassen.
- Die aktive Caddy-Datei `/Users/afranke/ai-stack/caddy/Caddyfile` bindet `ai.intern.franke` mit `tls internal` an OpenWebUI `127.0.0.1:3000`. Caddy läuft auf `*:443`; die bestehende OpenWebUI-Site wurde nicht geändert.
- `kronshagen.hopto.org` löste bei der Prüfung auf und antwortete auf Port 443 mit HTTP 200, aber das Zertifikat für diesen Host war selbstsigniert. Die öffentliche Gegenstelle/Routerweiterleitung ist damit bereits belegt, jedoch nicht sicher für einen neuen KI-Pfad. Die macOS-Firewall war deaktiviert. Keine DNS-, Firewall- oder Routereinstellung wurde geändert.
- Ein vorhandener Docker/Nginx-Proxy bindet Port `57001` an alle Interfaces; die öffentliche Probe zu diesem Port scheiterte beim Verbindungsaufbau. Port 443 liefert von außen die FRITZ!Box-Seite. Diese Altpfade blieben unangetastet. OpenWebUI `3000` ist separat breit gebunden.

[`mac-studio/de.franke.recipe-api.loopback.plist.example`](mac-studio/de.franke.recipe-api.loopback.plist.example) ist jetzt zusätzlich als aktuelle LaunchAgent-Konfiguration installiert. `mac-studio/run_recipe_api.py` verhindert doppelte Starts, prüft das Token vor dem Start und begrenzt Logs auf 1 MiB mit drei Rotationen. [`npm run health:mac-studio`](package.json) prüft FastAPI mit Bearer-Token, Ollama und Qdrant ausschließlich über Loopback. Die `recipes`-Collection hatte vor und nach einem echten lokalen RAG-Smoke-Test weiterhin 3.492.886 Punkte; es wurden keine Punkte geladen, geändert oder neu indiziert.

Der lokale Kandidat liegt in [`mac-studio/Caddyfile.rezeptshare.example`](mac-studio/Caddyfile.rezeptshare.example). Er beschränkt Routen auf `POST /v1/chat/completions` und `GET /v1/recipe-progress/{UUID}`, begrenzt den Request auf 50 KB, setzt Antwort-Timeouts und antwortet für alle übrigen Pfade/Methoden mit 404. Er wurde nicht in die aktive Caddyfile übernommen oder neu geladen. Caddy besitzt kein Rate-Limit-Modul; das per-user Limit wird deshalb persistent in Supabase durch [`202611170002_ki_assistent_nutzungslimit.sql`](supabase/migrations/202611170002_ki_assistent_nutzungslimit.sql) durchgesetzt, sobald Tom es nach Schemaabgleich freigibt/anwendet und die passende Function-Version deployt. Der Startschutz der FastAPI wurde über `mac-studio/secure_api_patch.py` vorbereitet und angewandt.

### Noch erforderliche Freigaben für Caddy/DynDNS

1. Im Router/No-IP-Dashboard den DynDNS-Hostname und die aktuelle Portweiterleitung prüfen. Port 443 bleibt für die bestehende FRITZ!Box-Oberfläche reserviert.
2. Nach Freigabe extern TCP 80 an Caddys HTTP-Listener weiterleiten (ACME HTTP-01 und Erneuerung) sowie extern TCP 8443 an Caddy 8443 (KI-HTTPS-Endpunkt). Aktuell sind beide Ports extern nicht erreichbar; es wurden keine Freigaben erstellt. HTTP-01 funktioniert über Port 80, während TLS-ALPN für 443 wegen der FRITZ!Box-Terminierung nicht geeignet ist. Caddy erneuert seine ACME-Zertifikate nach Aktivierung automatisch.
3. Vorher die aktive Caddyfile sichern und den geprüften KI-Block nur nach expliziter Freigabe zusammenführen. Caddy-Konfiguration validieren, OpenWebUI unverändert prüfen, danach kontrolliert reloaden. Der Block routet nur die zwei dokumentierten Endpunkte; FastAPI-Bearer bleibt zwingend.
4. Vor öffentlicher Nutzung Migration `202611170002_ki_assistent_nutzungslimit.sql` gegen das reale Schema prüfen und freigeben. Die Function erwartet beide RPCs; bei fehlender Migration schließt sie mit HTTP 503, also keine unlimitierte Fallback-Nutzung.
5. Erst nach externer Sicherheitsprüfung separat freigeben, die HTTPS-Upstream-Secrets in Toms Supabase-Projekt zu setzen und die Functions zu deployen. Caddy-Modus: `RECIPE_ASSISTANT_ACCESS_MODE=caddy`, `RECIPE_ASSISTANT_UPSTREAM=https://kronshagen.hopto.org:8443`, `RECIPE_ASSISTANT_API_KEY`; optional `KI_PROGRESS_UPSTREAM=https://kronshagen.hopto.org:8443/v1/recipe-progress/`. Die bestehende Supabase-JWT- und Profilprüfung bleibt erforderlich.

### Localer API-Start, Healthcheck und Fehlerfall

Nach Einrichtung des lokalen Tokenfiles ist der Mac-Healthcheck:

```bash
cd /Users/afranke/ai-stack/recipe-rag/RezeptShare-KI/RezeptShare
npm run health:mac-studio
```

Der Dienst ist nur für `127.0.0.1:8000` vorgesehen. FastAPI antwortet ohne/wrong Bearer mit 401 und ohne sicher gesetztes Tokenfile geschlossen mit 503. Die Edge Functions melden einen Upstream-Ausfall als generische 502/503; sie verwenden keine Ausweich- oder Mockantwort. Bei Mac-Ausfall zuerst `launchctl print gui/$(id -u)/de.franke.recipe-api`, danach den lokalen Healthcheck und die begrenzte Datei `~/Library/Logs/RezeptShare/recipe-api.log` prüfen. Es werden weder Qdrant-Indizes neu aufgebaut noch Rezeptdaten verändert.

Test-/Rotationsablauf: `python3 mac-studio/manage_api_token.py` legt den ersten Schlüssel lokal an; für Supabase muss er später kontrolliert kopiert und dort als `RECIPE_ASSISTANT_API_KEY` in **beiden** Edge Functions gesetzt werden. Beim Rotieren im Wartungsfenster lokales Tokenfile und Supabase Secret aktualisieren, beide Functions kontrolliert deployen und mit einem gültigen Supabase-JWT plus API-Bearer prüfen. Zwischenablage anschließend leeren. Hier wurden keine Supabase-Secrets geändert.

### API-Kosten und Nutzung

Der Importer protokolliert nun tatsächliche Tokenwerte aus der Responses-API-Antwort. Der Datensatz enthält keine Rezept- oder Bilddaten. Wenn die Tokenwerte fehlen/inkonsistent sind, wird kein Datensatz erfunden. Scheitert das Schreiben der Nutzungszeile nach erfolgreicher Antwort, bleibt das Rezept im Importergebnis erfolgreich (damit die UI keinen kostenpflichtigen Retry provoziert); ein generischer Fehler wird im Edge-Log notiert. Diese Fälle müssen bei der Abrechnung im Dashboard abgeglichen werden.

Die Responses-API-Tokenwerte enthalten keinen tatsächlichen Dollarbetrag. Das Projekt berechnet daher bewusst **keine** angeblich tatsächlich angefallenen Kosten aus Preisen oder geschätzten Tokenmengen. Tom kann Token pro Nutzer/Modell/Monat aus `rezept_import_api_nutzung` lesen und die realen Kosten separat im OpenAI Usage/Costs-Dashboard exportieren.

Das 30-US-Dollar-Monatsbudget ließ sich nicht einsehen: es gab keinen Zugriff auf OpenAI-Abrechnungseinstellungen. OpenAI unterscheidet weiche Projekt-Monatslimits/Alerts vom Schalter **Enforce a hard limit**. Tom muss im richtigen API-Projekt unter **Organization → Projects → [Importprojekt] → Limits** das Monatslimit `30 USD` und aktivierte Hard-Limit-Enforcement prüfen. Durch verzögerte Erfassung kann das Limit laut OpenAI leicht überschritten werden; Alerts allein stoppen keine Aufträge ([Projektlimits](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform), [Spend-Limit-Verhalten](https://help.openai.com/en/articles/6614457-troubleshooting-api-usage-and-spend-limits)).

## B. Von Tom zwingend zu erledigen

1. **Draft-PR öffnen und prüfen:** Die GitHub-Integration lehnte die PR-Erstellung mit HTTP 403 ab und das lokale `gh`-Login ist ungültig. Nach einer gültigen GitHub-Anmeldung den bereits gepushten Branch `nordlicht78:feature/tom-production-handover` als Draft gegen `Tom-ff9/RezeptShare:main` öffnen. Der Draft ist nur ein Reviewvorschlag, kein Merge und kein Deployment. Vor einem Merge besonders alle Migrationen sowie geänderte Gruppen-/Rezept-Edge-Functions prüfen.
2. **Zielschema auditieren:** Im Supabase-Dashboard des richtigen Projekts die Projekt-ID `gcncxupedhwieybpiupi` und URL bestätigen. `migration/kochbuchimport-audit-readonly.sql` ausführen und nur Schema-Metadaten (keine Nutzer-/Rezeptdaten) zur Kompatibilitätsprüfung verwenden. Wenn Tom das SQL nicht direkt ausführt, benötigt ein CLI-Operator gezielte `database_read`-Berechtigung.
3. **Backup/Bestandsschutz:** PITR/Backupstatus und Wiederherstellungspfad bestätigen; Schema, Policies, Storage-Bucket-Metadaten und Funktionsversionen sichern. Bestehende Tabellen/IDs nicht neu anlegen oder importieren. Die drei strukturellen Migrationsdateien nicht blind anwenden; bei Rollenwerten/FKs zuerst einen eigenen kompatiblen Plan erstellen.
4. **Migration freigeben und anwenden:** Nach Schemaabgleich nur exakt benötigte additive Schritte festlegen. Für `ki-assistent` zusätzlich `supabase/migrations/202611170002_ki_assistent_nutzungslimit.sql` prüfen. Sie verlangt `private.konto_aktiv(uuid)`. Erst nach eigener Freigabe anwenden; danach RLS, Grants, Tabelle und Funktionen read-only verifizieren.
5. **Caddy/DynDNS-Route sicher freigeben:** FastAPI ist auf `127.0.0.1:8000` abgesichert; Caddy-Entwurf nutzt `:8443`. Port 443 liefert die FRITZ!Box mit selbstsigniertem Zertifikat, Port 80 und 8443 sind nicht extern erreichbar, `:57001` blieb von außen geschlossen. Zur ACME-Ausstellung und Erneuerung sind Routerfreigaben TCP 80→Caddy:80 und TCP 8443→Caddy:8443 nötig. Sie brauchen deine Freigabe. Tom benötigt keinen Mac-Adminzugang.
6. **Secrets im Tom-Projekt konfigurieren:** Die Tabelle oben abarbeiten. `OPENAI_API_KEY` nur durch die berechtigte Inhaberin des OpenAI-Projekts im Supabase-Dashboard als Edge-Function-Secret eintragen. Niemals im Chat, Browser oder Git.
7. **OpenAI-Hard-Limit verifizieren:** `30 USD` und **Enforce a hard limit** im richtigen OpenAI API-Projekt kontrollieren. Keine billing secret/API-key values teilen.
8. **Functions einzeln bereitstellen:** Nach Merge, Schemafreigabe, Migrationen und Backendbereitschaft nur benötigte Funktionen deployen: vorhandene Rezept-/Gruppenfunktionen gemäß Schemaaudit; dann `rezept-importieren`; danach `ki-assistent`; optional `ki-fortschritt`. Für das Importpaket:

   ```bash
   tar -xzf .release-artifacts/rezeptshare-tom-supabase-<commit>.tar.gz -C /tmp/rezeptshare-tom-import
   supabase --workdir /tmp/rezeptshare-tom-import functions deploy rezept-importieren --project-ref gcncxupedhwieybpiupi --use-api
   ```

   Vor diesem Schritt müssen SQL-Migration und Secrets bereitstehen; dieses Handbuch hat keinen Deploy ausgeführt.

9. **Pages-Konfiguration/Redirects:** Vor Veröffentlichung Tom-Pages-URL und Supabase-Publishable-Key im Dashboard bestätigen. Die vorhandene Finalizer-Funktion akzeptiert nur ein exakt projektgebundenes öffentliches `sb_publishable_...` oder anon-Key und sperrt das Testprojekt. Supabase Auth Site URL, Callback-URLs und hCaptcha-Domain für `tom-ff9.github.io` (oder Custom Domain) abstimmen. GitHub-Pages-Workflow ist auf `main` plus expliziten Dispatch-Schalter begrenzt.
10. **Funktionstest und Rollback:** Nach separater Freigabe mit einem Testkonto: Anmeldung/Abmeldung und hCaptcha; Testgruppe und Rezept speichern/lesen/bearbeiten; kleines Rezeptbild hochladen; Import nur mit expliziter Kostenfreigabe; Mac-Assistent nur über Access; Gruppenrechte und öffentliche Rezeptlinks prüfen. Erst aggregiert/readonly verifizieren, dass bestehende Benutzer, Gruppen, Rezepte, Bildpfade und Rechte erhalten sind.

## Backup, Verifikation und Rollback

- Vor Migration: Supabase-Backup/PITR und Restorepfad prüfen; kein Export von Rezepttexten, Nutzerlisten oder privaten Bildern anlegen.
- Nach additiver SQL-Erweiterung: nur Tabellen-/Spalten-/Funktionsnamen, RLS/Grants und Migrationsversion read-only kontrollieren.
- Bei SQL-Fehlern: Transaktion abbrechen; vorhandene Objekte nicht droppen. Nach erfolgreicher Nutzung die Token-/Quota-Tabellen nicht rückwärts löschen.
- Bei Function-Fehlern: auf zuvor gesicherte Function-Version zurückrollen; keine Daten löschen.
- Bei Frontendfehlern: Pages auf das vorherige Build/Commit zurückstellen; Datenbank nicht zurücksetzen.
- Kein Rollback durch Neuaufbau von Benutzern, Gruppen, Rezepten, Storage-Buckets oder Qdrant-Indizes.

## Noch nicht erledigt / nicht freigegeben

- Toms DB-Schema: Audit wegen `403`/fehlender `database_read`-Berechtigung nicht gelaufen.
- Caddy-Rezept-KI-Route: Entwurf vorhanden, nicht aktiv. `kronshagen.hopto.org` antwortet derzeit mit einem nicht vertrauenswürdigen selbstsignierten Zertifikat.
- Bestehende Mac-LaunchAgent-/Nginx-Konfiguration: nicht geändert; aktueller unsicherer Bindungs-/Proxybefund bleibt offen.
- OpenAI-Hard-Limit: nicht verifiziert.
- Produktivmigrationen, Edge-Deployments, Secrets und Pages-Veröffentlichung: nicht ausgeführt.
- Kein Merge durchgeführt.
