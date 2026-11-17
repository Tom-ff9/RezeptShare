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

Die übrigen Integrationsmigrationen in `supabase/migrations/` sind nicht pauschal freigegeben: `202611060001_profile_rollen.sql` enthält unter anderem ein Update von Gruppenrollen (`besitzer` → `admin`) und weitere bestehende Tabellen-/FK-Anpassungen. `202611100001_rezeptgruppen_teilen.sql` fügt Rezeptfamilien, Freigaben und einen Storage-Bucket hinzu. Sie dürfen nicht blind auf Toms Bestand angewendet werden. Vorher muss Tom das reale Schema gegen jede Migration vergleichen und Änderungen mit bestehender Funktionalität und Datenbestand abgleichen.

### KI-Assistent und Mac Studio

`ki-assistent` und optional `ki-fortschritt` verwenden die vorhandene FastAPI-/Ollama-/Qdrant-Architektur. Die Edge Functions prüfen weiterhin zuerst die RezeptShare-Supabase-Sitzung. Danach verwenden sie HTTPS plus zwingende Cloudflare-Access-Service-Token. Tom erhält keinen administrativen Zugang zum Mac Studio.

Vorgesehene Secret-Namen im **Toms Supabase-Projekt**:

| Name | Zweck |
|---|---|
| `RECIPE_ASSISTANT_UPSTREAM` | HTTPS-Basis-URL des geschützten Tunnel-Hostnamens |
| `RECIPE_ASSISTANT_ACCESS_CLIENT_ID` | Cloudflare Access Service Token Client ID |
| `RECIPE_ASSISTANT_ACCESS_CLIENT_SECRET` | Cloudflare Access Service Token Secret |
| `KI_PROGRESS_UPSTREAM` | HTTPS-URL des FastAPI-Statuspfads; nur falls `ki-fortschritt` genutzt wird |
| `OPENAI_API_KEY` | Nur für `rezept-importieren`, serverseitig im Tom-Projekt |
| `OPENAI_IMPORT_MODEL` | Optionaler Modellname; Standard ist `gpt-4.1-mini` |

Die automatisch von Supabase bereitgestellten Werte `SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` werden nicht als manuelle Secrets aus dem Browser übernommen. Es gibt keinen separaten `RECIPE_ASSISTANT_API_KEY`: die vorhandene FastAPI validiert keinen solchen Bearer-Key; die externe Zugriffsschranke ist Cloudflare Access. Keine Secret-Werte gehören in Git, Browserdateien oder dieses Handbuch.

### Tatsächlicher Mac-Status und Sicherheitsblocker

Read-only geprüft:

- FastAPI-Health antwortete auf `127.0.0.1:8000`; Ollama antwortete mit `qwen3:14b` und `bge-m3`; Qdrant antwortete mit der bestehenden Collection `recipes`. Es wurde nichts neu indiziert.
- Qdrant-Docker-Ports `6333`/`6334` sind an `127.0.0.1` gebunden und die Restart-Policy lautet `always`. Ollama hörte auf `127.0.0.1:11434`.
- Eine bestehende LaunchAgent-Datei `de.franke.recipe-api.plist` setzt `RunAtLoad` und `KeepAlive`, startet aber Uvicorn mit `--host 0.0.0.0 --port 8001`. Das ist eine unsichere Bindung, falls diese Agent-Konfiguration geladen wird.
- Der vorhandene `ki-proxy`-Nginx-Container bindet Port `57001` an alle Interfaces, nimmt `kronshagen.hopto.org` an und routet `/recipe-progress/` ohne Access-Policy zu `host.docker.internal:8001`. Ob Router/Firewall den Port aus dem Internet erreichbar machen, wurde nicht geprüft.
- Die vorhandene Caddy-Datei bindet `ai.intern.franke` mit internem TLS an `127.0.0.1:3000` (OpenWebUI); sie ist kein abgesicherter FastAPI-Tunnel.
- `cloudflared` und ein Cloudflare-Credential-Verzeichnis wurden lokal nicht gefunden. Das Dashboard, die Domaininhaberschaft und eine Cloudflare-Zone konnten nicht verifiziert werden.

[`mac-studio/de.franke.recipe-api.loopback.plist.example`](mac-studio/de.franke.recipe-api.loopback.plist.example) ist eine **nicht installierte** Loopback-Vorlage. [`npm run health:mac-studio`](package.json) prüft FastAPI, Modelle und Qdrant, ausschließlich über Loopback, und meldet fehlende Dienste verständlich. Vor dem Laden der Vorlage muss der bisherige ungeschützte 57001-Progresspfad beendet oder gleichwertig abgesichert werden. Ich habe keine LaunchAgent-, Docker-, Caddy-, Nginx-, Firewall-, DNS- oder Tunnelkonfiguration geändert.

Cloudflare Tunnel/Access benötigt einen aktiven Cloudflare-Account und eine kontrollierte Domain/Zone (Full Setup oder geeigneter Partial-CNAME-Aufbau), einen geschützten Public Hostname, eine `Service Auth`-Policy und einen Tunnel-Connector auf dem Mac Studio. Cloudflare empfiehlt, die Access-App vor der Tunnelroute anzulegen; der Tunnel kann Access-Tokens am Origin prüfen ([Self-hosted App/Tunnel](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public/)). Ohne kontrollierte Domain kann dieser Hostname nicht sicher eingerichtet werden. Es wurde nichts extern aktiviert.

### API-Kosten und Nutzung

Der Importer protokolliert nun tatsächliche Tokenwerte aus der Responses-API-Antwort. Der Datensatz enthält keine Rezept- oder Bilddaten. Wenn die Tokenwerte fehlen/inkonsistent sind, wird kein Datensatz erfunden. Scheitert das Schreiben der Nutzungszeile nach erfolgreicher Antwort, bleibt das Rezept im Importergebnis erfolgreich (damit die UI keinen kostenpflichtigen Retry provoziert); ein generischer Fehler wird im Edge-Log notiert. Diese Fälle müssen bei der Abrechnung im Dashboard abgeglichen werden.

Die Responses-API-Tokenwerte enthalten keinen tatsächlichen Dollarbetrag. Das Projekt berechnet daher bewusst **keine** angeblich tatsächlich angefallenen Kosten aus Preisen oder geschätzten Tokenmengen. Tom kann Token pro Nutzer/Modell/Monat aus `rezept_import_api_nutzung` lesen und die realen Kosten separat im OpenAI Usage/Costs-Dashboard exportieren.

Das 30-US-Dollar-Monatsbudget ließ sich nicht einsehen: es gab keinen Zugriff auf OpenAI-Abrechnungseinstellungen. OpenAI unterscheidet weiche Projekt-Monatslimits/Alerts vom Schalter **Enforce a hard limit**. Tom muss im richtigen API-Projekt unter **Organization → Projects → [Importprojekt] → Limits** das Monatslimit `30 USD` und aktivierte Hard-Limit-Enforcement prüfen. Durch verzögerte Erfassung kann das Limit laut OpenAI leicht überschritten werden; Alerts allein stoppen keine Aufträge ([Projektlimits](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform), [Spend-Limit-Verhalten](https://help.openai.com/en/articles/6614457-troubleshooting-api-usage-and-spend-limits)).

## B. Von Tom zwingend zu erledigen

1. **PR prüfen:** Release-Branch gegen `main` reviewen. Der Draft-PR ist ein Vorschlag, kein Merge und kein Deployment. Vor dem Merge besonders alle Migrationen sowie geänderte Gruppen-/Rezept-Edge-Functions prüfen.
2. **Zielschema auditieren:** Im Supabase-Dashboard des richtigen Projekts die Projekt-ID `gcncxupedhwieybpiupi` und URL bestätigen. `migration/kochbuchimport-audit-readonly.sql` ausführen und nur Schema-Metadaten (keine Nutzer-/Rezeptdaten) zur Kompatibilitätsprüfung verwenden. Wenn Tom das SQL nicht direkt ausführt, benötigt ein CLI-Operator gezielte `database_read`-Berechtigung.
3. **Backup/Bestandsschutz:** PITR/Backupstatus und Wiederherstellungspfad bestätigen; Schema, Policies, Storage-Bucket-Metadaten und Funktionsversionen sichern. Bestehende Tabellen/IDs nicht neu anlegen oder importieren. Die drei strukturellen Migrationsdateien nicht blind anwenden; bei Rollenwerten/FKs zuerst einen eigenen kompatiblen Plan erstellen.
4. **Migration freigeben und anwenden:** Nach Schemaabgleich nur die exakt benötigten additiven Schritte festlegen. Falls die Importobjekte fehlen und `private.konto_aktiv(uuid)` vorhanden ist, ist `migration/kochbuchimport-produktiv.sql` der Importkandidat. Erst nach eigener Freigabe anwenden; danach RLS, Grants, Tabellen und Funktion read-only verifizieren.
5. **Mac-/Cloudflare-Zugang durch Projektinhaber vorbereiten:** Cloudflare-Domain/Zone und Account prüfen, Service-Auth-App/Policy vor Tunnelroute anlegen, Tunnel nur auf FastAPI loopback routen. Vorher den vorhandenen öffentlichen Nginx-Pfad/Port `57001` und die `0.0.0.0:8001`-Startkonfiguration sicher entfernen oder absichern. Diese lokalen/externalen Schritte brauchen die Zustimmung der Mac-/Domaininhaberin; Tom braucht dafür keinen Mac-Adminzugang.
6. **Secrets im Tom-Projekt konfigurieren:** Die Tabelle oben abarbeiten. `OPENAI_API_KEY` nur durch die berechtigte Inhaberin des OpenAI-Projekts im Supabase-Dashboard als Edge-Function-Secret eintragen. Niemals im Chat, Browser oder Git.
7. **OpenAI-Hard-Limit verifizieren:** `30 USD` und **Enforce a hard limit** im richtigen OpenAI API-Projekt kontrollieren. Keine billing secret/API-key values teilen.
8. **Functions einzeln bereitstellen:** Nach Merge, Schemafreigabe und Backendbereitschaft nur benötigte Funktionen deployen: erst vorhandene Rezept-/Gruppenfunktionen gemäß Schemaaudit; dann `rezept-importieren`; danach `ki-assistent`; optional `ki-fortschritt`. Für das Importpaket:

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
- Cloudflare-Account/Domain, Access-Policy und Tunnel: nicht verifiziert oder aktiviert.
- Bestehende Mac-LaunchAgent-/Nginx-Konfiguration: nicht geändert; aktueller unsicherer Bindungs-/Proxybefund bleibt offen.
- OpenAI-Hard-Limit: nicht verifiziert.
- Produktivmigrationen, Edge-Deployments, Secrets und Pages-Veröffentlichung: nicht ausgeführt.
- Kein Merge durchgeführt.
