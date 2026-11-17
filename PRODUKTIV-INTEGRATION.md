# RezeptShare – Integrations- und Release-Stand

Stand: 17. November 2026

Repository: `nordlicht78/RezeptShare`

Vorbereitungsbranch: `feature/production-readiness`

Basiscommit: `1942bae9e060a0aea4677463883f440358c864a3`

## Zusammenfassung

Der integrierte lokale Stand behält Rezeptverwaltung, Auth, Gruppen/Mitglieder, bestehende Rezept-/Profilbilder, öffentliche Links, die Kochbuch- und Handschrifterkennung sowie die Zutaten- und Schrittansicht bei. Der bestehende KI-Assistent verwendet wieder die vorhandene Mac-Studio-Pipeline mit Ollama und Qdrant. Für den Browser-Test ist ein Loopback-Adapter ergänzt, der Supabase-Test-JWTs vor jeder Chat- oder Fortschrittsanfrage validiert. Die Produktionsinstanz wurde nicht angesprochen, migriert oder geändert.

Die Produktionsprojekt-ID konnte nicht unabhängig bestätigt werden. Ein alter Projektverweis im benachbarten Workspace ist nur ein Hinweis, kein aktiver Konfigurationsnachweis. Die lokale Supabase-CLI ist nicht angemeldet; deshalb wurden keine Produktionsdatenbank-, Auth-, Function- oder Storage-Abfragen ausgeführt. Der Pages-Produktionsabschluss ist nun als rein lokales, fail-closed Skript vorbereitet und wurde nur mit synthetischen Werten getestet.

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

Der Browseradapter für die isolierte lokale Testumgebung spricht ausschließlich mit `127.0.0.1:8000`. Antworten/Fehler werden strukturiert und ohne Cache zurückgegeben; Anfrageinhalte und Tokens werden nicht protokolliert. Ohne Anmeldung wurde HTTP 401 bestätigt. Die neue öffentliche Caddy-KI-Route ist nicht aktiv.

`supabase/functions/ki-assistent` und `ki-fortschritt` unterstützen zwei ausdrücklich gewählte Betriebsarten. Beide verlangen gültiges RezeptShare-JWT, aktives Profil, HTTPS und das Backend-Bearer-Secret. `RECIPE_ASSISTANT_ACCESS_MODE=caddy` benötigt keine Cloudflare-Secrets; `cloudflare` bleibt als Standard-/Kompatibilitätsmodus erhalten und verlangt weiterhin beide Access-Service-Token. Unbekannte Modi oder fehlende Schutzwerte führen geschlossen zu 503. Keine Secrets wurden gesetzt und keine Edge Function wurde deployed.

### Sicherer HTTPS-Pfad zum Mac Studio

Auf dem Mac läuft Caddy 2.11.9 auf Port 443. Die aktive Konfiguration bedient `ai.intern.franke` mit internem TLS und Reverse Proxy zu OpenWebUI `127.0.0.1:3000`; FastAPI wird darüber nicht bereitgestellt. Die aktive Caddyfile `/Users/afranke/ai-stack/caddy/Caddyfile` blieb unverändert. `kronshagen.hopto.org` löst auf und lieferte beim read-only HTTPS-Test HTTP 200, aber mit selbstsigniertem, nicht vertrauenswürdigem Zertifikat. Zusätzlich bindet ein vorhandener Docker/Nginx-Proxy Port 57001 an alle Interfaces; die macOS-Firewall war deaktiviert. FastAPI läuft ausschließlich auf `127.0.0.1:8000`.

Die gewählte Architektur ist Caddy mit DynDNS `kronshagen.hopto.org`, kein Cloudflare Tunnel. Der Entwurf `mac-studio/Caddyfile.rezeptshare.example` lässt nur `POST /v1/chat/completions` und `GET /v1/recipe-progress/{UUID}` durch, routet ausschließlich zu `127.0.0.1:8000`, begrenzt Requests auf 50 KB und liefert sonst 404. Er ist nicht in die aktive Caddyfile geladen. Eine gültige öffentliche TLS-Kette, die bestehende Portweiterleitung/HTTPS-Antwort und ein belastbares KI-Rate-Limit sind vor Freigabe zu klären. Die Functions verlangen zusätzlich Supabase-JWT/Profil und Backend-Bearer.

Eine öffentliche Caddy-Route erfordert bestätigte Router-/DNS-Verwaltung, gültiges Zertifikat, geprüfte Zugriffsschutzregeln und gesonderte Freigabe. Keine Ports, Router-/Firewallregeln, Zertifikate oder KI-Routen wurden geändert.

Der Edge-Code setzt eine Obergrenze von 90 Sekunden und liefert bei Upstream-Ausfall eine generische 502-Antwort ohne automatische Wiederholung. Supabase nennt aktuell 150 Sekunden Request-Idle-Timeout; längere Ollama-Läufe müssen daher vor Produktivfreigabe mit realen, kostenfreien lokalen Requests geprüft werden ([Edge-Function-Limits](https://supabase.com/docs/guides/functions/limits)). Das aktuelle KI-Schema hat noch kein persistentes per-user Rate Limit. Vor Produktivdeployment muss ein Limitwert abgestimmt und serverseitig dauerhaft durchgesetzt werden; eine pro-Edge-Worker-Speicherlösung wäre dafür nicht ausreichend.

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

### Produktionsziel und Datenbankvergleich

In der ignorierten `konfiguration.lokal.js` und `.supabase-test/target.json` steht ausschließlich das Testprojekt `hmjtzcebgbkryucvkndu`; produktive Projektverknüpfungen wie `supabase/.temp/project-ref` gibt es nicht. Die öffentliche GitHub-`main`-Konfiguration enthält keinen Supabase-Projektverweis. Eine alte lokale Datei neben dem Repository enthält `gcncxupedhwieybpiupi` als `ORIGINAL_SUPABASE_URL`. Das ist ein historischer Kandidat, keine aktuelle oder unabhängige Bestätigung, und er ist im Testschutz ausdrücklich gesperrt. Ich habe diesen Kandidaten nicht abgefragt.

`supabase projects list --output-format json` scheiterte mit `AccessTokenRequiredError`. Der erforderliche Schritt ist ein eigener lokaler Login (`supabase login`) und anschließend die unabhängige Bestätigung im Supabase-Dashboard sowie in `supabase projects list`. Token oder Passwort dürfen dabei nicht in Dateien, Chat oder Logs übernommen werden. Erst danach darf die exakte Projekt-ID/URL als read-only Ziel verwendet werden.

| Metadaten | Release-Branch `supabase/schema.sql` | Produktivprojekt |
|---|---:|---|
| Tabellen | 10: `profile`, `gruppen`, `gruppen_mitglieder`, `rezepte`, `einladungen`, `rezept_aenderungen`, `ausgeblendete_aenderungen`, `rezept_freigaben`, `rezept_auftraege`, `rezept_import_nutzung` | Nicht abgefragt |
| Funktionen / Policies / Trigger | 24 / 21 / 10 | Nicht abgefragt |
| Storage-Buckets | 3 im Release-Schema | Nicht abgefragt |
| Historische SQL-Migrationen | 4: Profile/Rollen, Gruppenverwaltung, Rezeptgruppen/Teilen, Kochbuchimport | Migrationshistorie nicht abgefragt |
| Auth-Settings / Redirects / hCaptcha | Frontend nutzt `captchaToken`; Pages-Rücksprung wird jetzt mit App-Unterpfad erzeugt | Nicht abgefragt |
| Edge-Functions | 7 Quellordner im Release-Branch | Produktionsversionen nicht inventarisiert |

Der Vergleich vorhandener Benutzerdatensätze, Rezeptinhalte und Bilder wurde absichtlich nicht versucht. Es wurden keine personenbezogenen Datensätze und keine Storage-Objekte gelesen.

### GitHub-Pages-Produktionskonfiguration

Der Release-Branch enthält jetzt `scripts/finalize-production-pages.cjs` und Tests für `scripts/production-pages-config.cjs`. Nach bestätigter Projekt-ID kann dieses lokale Skript ein bereits erzeugtes `dist/`-Artefakt finalisieren. Es lehnt `hmjtzcebgbkryucvkndu`, URL-/Key-Ref-Abweichungen und Service-Role-/Secret-Keys ab, bindet die KI-Endpunkte an dasselbe Supabase-Projekt und ersetzt die breite Supabase-CSP im Pages-HTML durch die exakte Projekt-URL. Es schreibt ausschließlich `dist/`; es verbindet sich nicht mit Supabase und deployt nicht. Die Production-Variablen wurden nicht gesetzt und das Skript wurde nur mit synthetischen Testwerten geprüft.

Nach späterer unabhängiger Bestätigung wäre der Ablauf:

```bash
npm run build
REZEPTSHARE_PROD_SUPABASE_URL='https://<bestätigte-ref>.supabase.co' \
REZEPTSHARE_PROD_PUBLISHABLE_KEY='<öffentlicher Publishable-Key>' \
REZEPTSHARE_PROD_KEY_PROJECT_REF='<dieselbe bestätigte-ref>' \
node scripts/finalize-production-pages.cjs --confirm-ref '<bestätigte-ref>'
```

`REZEPTSHARE_PROD_PUBLISHABLE_KEY` ist ausdrücklich ein öffentlicher Publishable Key, kein Secret-/Service-Role-Key. Die finale `dist/konfiguration.js` enthält ihn daher öffentlich; sie wird nicht committet. `konfiguration.lokal.js` bleibt ausschließlich auf das Testprojekt gerichtet. Der Pages-Workflow ist jetzt so vorbereitet, dass er den Produktionsabschluss nur bei `main` und explizitem Dispatch-Häkchen aufruft; bis dahin muss er an fehlenden Variablen scheitern. Erst nach Projektbestätigung die öffentlichen Repository-Variablen `REZEPTSHARE_PROD_PROJECT_REF`, `REZEPTSHARE_PROD_SUPABASE_URL`, `REZEPTSHARE_PROD_PUBLISHABLE_KEY` und `REZEPTSHARE_PROD_KEY_PROJECT_REF` pflegen. Keine privaten Schlüssel als Actions-Variablen setzen.

Der vermutete Standard-Pages-Pfad lautet `https://nordlicht78.github.io/RezeptShare/`; die tatsächliche Pages-Domain und der Repository-Pages-Status wurden nicht unabhängig über GitHub-Settings geprüft. `script.js` setzt nun `emailRedirectTo` auf den aktuellen App-Unterpfad und erhält ausschließlich die Parameter `einladung` und `rezept`; sonstige Queryparameter und Fragmente werden nicht in den E-Mail-Link übernommen. Für Supabase Auth wären nach Bestätigung der Pages-URL die Site URL auf diese App-URL und Redirects mindestens auf den exakten App-Pfad sowie `https://nordlicht78.github.io/RezeptShare/**` zu setzen. Die aktuelle hCaptcha-Site-ID ist im Frontend vorhanden; im Produktivprojekt muss das zugehörige hCaptcha-Secret eingerichtet und die Domain-Allowlist für `nordlicht78.github.io` geprüft/aktiviert werden. Es wurde kein Auth-Dashboard verändert.

Die Produktivkonfiguration wurde nicht aktiviert. Damit konnte das Produktivschema nicht sicher read-only abgefragt und der Test-/Integrationsstand nicht dagegen verglichen werden. Es gab keine Verbindungen oder Schreibversuche zum historischen Kandidaten oder zu einem anderen Produktivprojekt.

Die historischen Migrationen (`202611060001_profile_rollen.sql`, `202611060002_gruppenverwaltung.sql`, `202611100001_rezeptgruppen_teilen.sql`, `202611140001_kochbuch_import.sql`) setzen bestehende Basistabellen voraus und sind kein Bootstrap für eine leere produktive Datenbank. Für ein vorhandenes Produktionsschema ist nur die additive Importkontingent-Erweiterung als Kandidat unter [kochbuchimport-produktiv.sql](docs/migrationen/kochbuchimport-produktiv.sql) vorbereitet. Sie prüft Voraussetzungen und bricht ab, falls die Importobjekte bereits existieren. Sie darf erst nach read-only Schema- und `supabase_migrations.schema_migrations`-Vergleich sowie eigener Freigabe angewendet werden. Der Test-Bootstrap `202611150001_test_bootstrap.sql` ist ausdrücklich ungeeignet für Produktion.

Diese Importerweiterung speichert für das Limit Nutzer-ID, UTC-Tag, Auftragszähler und letzten Reservierungszeitpunkt. Zusätzlich protokolliert `rezept_import_api_nutzung` pro Responses-API-Antwort ausschließlich tatsächlich gemeldete Tokenzahlen, Modell-/Response-ID sowie Nutzer-ID; weder Prompt noch Bild oder Rezeptinhalt werden gespeichert. Eine USD-Summe wird nicht aus Tokenpreisen geschätzt. Die Tabelle bleibt auf `service_role` beschränkt und wird beim Löschen des Auth-Kontos kaskadierend bereinigt. Die Migration verändert keine Benutzer-IDs, Gruppen, Mitgliedschaften, Rollen, Rezepte, Bilder, Storage-Pfade oder öffentlichen Links. Vor einer Produktivübernahme muss zusätzlich geprüft werden, dass `private.konto_aktiv(uuid)`, `auth.users` und die verwendeten Rollen vorhanden sind.

Der Entwurf wurde gegen ein minimales separates PGlite-Schema geprüft: Voraussetzungen vorhanden → Tabelle/Funktion werden transaktional angelegt, RLS ist aktiv, nur `service_role` kann das RPC aufrufen; vorhandene Importobjekte → sauberer Abbruch ohne Überschreiben. Er ist bewusst fail-closed und nicht als „blind beliebig oft ausführen“ ausgelegt. Diese Prüfung sagt nichts über das unbekannte Produktivschema aus.

### Spätere kontrollierte Produktivübernahme

1. Produktionsprojekt-ID und URL unabhängig bestätigen; Zugang nur über den lokalen Supabase-Login, niemals über Chat oder Repository.
2. Schema, RLS, Trigger, Storage-Buckets, Policies und Migrationstabelle read-only exportieren und sichern.
3. Mit dem freigegebenen Branch vergleichen; nur additive Objekte genehmigen. Keine Benutzerkopien, keine Tabellen-Neuanlage bestehender Daten und keine automatischen Datenübernahmen.
4. Backup und Wiederherstellung für SQL-Metadaten und Storage vorher nachweisen.
5. Jede Migration und jedes Function-Deployment getrennt vorlegen und ausdrücklich freigeben lassen.
6. Bestehende Daten zunächst read-only smoke-testen, danach kontrollierte Schreibtests nur mit eigens gekennzeichneten Testdaten.

### Edge Functions und Secrets für eine spätere Veröffentlichung

| Function | Release-Branch-Prüfung | Voraussetzung/Limit |
|---|---|---|
| `rezept-speichern` | `verify_jwt=false`, prüft Session selbst mit `auth.getUser`; bestehende Gruppe/Mitgliedschaft und Version werden geprüft; CORS aus `_shared/http.ts` ist `*` | Vor Deployment gegen vorhandene Produktionsspalten, Berechtigungen und RPCs vergleichen |
| `rezept-gruppen` | `verify_jwt=false`, manuelle Authentifizierung; gemeinsame CORS-Antwort | Prüfen, dass Produktions-RPCs und Rollen mit Release übereinstimmen |
| `gruppe-loeschen` | `verify_jwt=false`, manuelle Auth-/Rollenprüfung; Storagebereinigung erst nach Berechtigungsprüfung; gemeinsame CORS-Antwort | Nur deployen, wenn Bucket- und Eigentümerregeln übereinstimmen |
| `konto-loeschen` | `verify_jwt=false`, manuelle Auth-/Bestätigungsprüfung; gemeinsame CORS-Antwort | Hohe Auswirkung; separate Test- und Rollbackfreigabe nötig |
| `rezept-importieren` | `verify_jwt=false`, Handler validiert Session; gemeinsame CORS-Antwort | Ein RPC-Auftrag pro Nutzer und UTC-Tag maximal 10, mindestens 60 Sekunden Abstand; benötigt `rezept_import_nutzung`, `rezept_import_limit`, `rezept_import_api_nutzung` und `OPENAI_API_KEY` |
| `ki-assistent` | `verify_jwt=false`, eigene Origin-Liste, JWT plus aktives Profil; Größen-/Nachrichtenlimits, HTTPS-Upstream, 90-s Timeout, `RECIPE_ASSISTANT_ACCESS_MODE` (`caddy` oder bestehendes `cloudflare`) plus API-Bearer | Kein persistentes per-user Anfrage-/Ressourcenlimit im aktuellen Schema; vor Produktivbetrieb Limitlösung abstimmen |
| `ki-fortschritt` (optional) | `verify_jwt=false`, JWT plus aktives Profil; nur UUID/Statusantwort; HTTPS, gewählter Betriebsmodus plus API-Bearer | Kein KI-Aufruf und kein persistentes Limit; `KI_PROGRESS_UPSTREAM` erforderlich |

`_shared/http.ts` setzt für die bestehenden Rezept-Functions `Access-Control-Allow-Origin: *`. Das ersetzt keine JWT-/RLS-Prüfung, aber sollte vor Veröffentlichung auf die bestätigten Pages-Origins begrenzt werden. `ki-assistent` und `ki-fortschritt` haben eigene Allowlisten. Die produktiven Gegenstücke konnten nicht gelistet werden.

Im Caddy-Modus benötigt `ki-assistent` `RECIPE_ASSISTANT_ACCESS_MODE=caddy`, `RECIPE_ASSISTANT_UPSTREAM=https://kronshagen.hopto.org` und `RECIPE_ASSISTANT_API_KEY`. Optional verwendet `ki-fortschritt` `KI_PROGRESS_UPSTREAM=https://kronshagen.hopto.org/v1/recipe-progress/`. Im bestehenden Cloudflare-Modus sind zusätzlich die beiden Access-Secrets nötig. `OPENAI_API_KEY` bleibt ausschließlich das Secret von `rezept-importieren` und wird nicht für den Mac-Assistenten verwendet. Abweichende Pages-Origins müssen in der CORS-Liste ergänzt werden.

Vorgesehene Deployment-Reihenfolge nach späteren Freigaben: (1) unabhängige Projektbestätigung, Schema-/Migrations- und Backupprüfung, (2) additive Importmigration, (3) Secrets im richtigen Produktionsprojekt, (4) geprüfte Rezeptfunctions, (5) `rezept-importieren`, (6) abgesicherter KI-Upstream und `ki-assistent`, (7) optional `ki-fortschritt`, (8) read-only Versions-/Statusprüfung und unauthentifizierter 401-Test, (9) finalen Pages-Build aus den bestätigten öffentlichen Werten erzeugen, (10) geschütztes Pages-Deployment erst nach separater Freigabe, danach Login und vorhandene Links/Rezepte prüfen.

## Backup und Rollback

- **Vorher:** automatisierten Supabase-Backup-/PITR-Status im Dashboard bestätigen und einen konsistenten Wiederherstellungspunkt markieren; zusätzlich Schema-, Policy-, Trigger-, Bucket- und Migrationstabellen-Metadaten sichern.
- **Restore:** Wiederherstellbarkeit in einem separaten isolierten Projekt mit vorheriger Freigabe nachweisen. Nicht in die Produktion restaurieren. Produktive Exportdateien mit Rezeptinhalten oder Nutzerdaten nicht lokal speichern.
- **Storage:** Bucket-IDs, Sichtbarkeit, Limits und Policies sichern. Für Objektwiederherstellung providerseitige Versionierung/Backup oder einen verschlüsselten, zugriffsbeschränkten Speicher verwenden; keine private Bildsammlung in das Repository oder temporäre Testverzeichnisse kopieren.
- **Vorher-/Nachher-Kontrolle:** nur aggregierte Tabellen-/Objektzahlen, Schema-Hashes und Rechteproben vergleichen. Bestehende Benutzer-IDs, Gruppen-/Mitgliedschaften, Rezept-IDs, Bildpfade und öffentliche Token nicht migrieren oder neu erzeugen.
- **SQL:** Kandidaten sind transaktional. Fehler vor `COMMIT` rollen zurück. Nach Nutzung der Importkontingent-Tabelle diese nicht löschen, weil sie Limitverlauf enthält; bei Function-Rollback bleibt sie bestehen.
- **Edge Functions:** vor Deployment Version/Commit der aktiven Function notieren und Quellpaket sichern. Rollback nur durch erneutes Bereitstellen der zuvor aktiven Version nach eigener Freigabe.
- **Frontend:** das vorherige Pages-Artefakt und Commit-SHA sichern. Bei UI-/Auth-Fehler Pages auf das vorherige Artefakt zurückstellen; Database-Rollback ist dafür nicht erforderlich.
- **Incident:** bei Login-/Gruppen-/Rezeptfehlern Pages zuerst zurückrollen, vorhandene Datensätze nicht löschen; bei Schemafehlern Transaktion stoppen und Logs ohne Token/PII prüfen; Storage-Probleme nicht durch bucket-Neuanlage beheben.

## Geplante Veröffentlichungsreihenfolge

1. Produktivprojekt-ID und Pages-Domain unabhängig bestätigen; lokale Supabase-CLI anmelden, Projektliste/Dashboard abgleichen.
2. Read-only Schema-, Auth-, RLS-, Storage-, Function- und Migrationserfassung erstellen; aktuelle Produktionsversionen mit Tabelle oben vergleichen.
3. Backup/PITR und Restore-Probe bestätigen; Edge-Rollbackversionen sichern.
4. Migrations- und KI-Rate-Limit-Policy abschließend reviewen und Migration separat freigeben.
5. Nach Freigabe nur additive Importmigration anwenden und read-only verifizieren.
6. Notwendige Secrets ausschließlich im Produktions-Supabase-Secret-Manager setzen; Werte nie in GitHub Actions Logs ausgeben.
7. Geprüfte Rezeptfunktionen und Importfunktion einzeln deployen; danach unauthentifizierte 401-, CORS-, RLS- und bestehende Rechteproben durchführen.
8. Caddy/DynDNS erst nach gültigem Zertifikat, geklärter Portweiterleitung und Rate-Limit-Freigabe bereitstellen; danach `ki-assistent`, optional `ki-fortschritt`.
9. Mit bestätigter Pages-URL/Key den Pages-Build finalisieren, hCaptcha/Auth-Redirects prüfen und Vorab-Artefakt ohne Deployment testen.
10. Pages-Deployment nur nach separater Freigabe; danach zuerst Login und vorhandene geteilte Links sowie vorhandene Gruppen/Rezepte/Bilder read-only prüfen, dann eigens genehmigte Schreibtests.
11. Alte Version bis zum erfolgreichen Cutover bereithalten; kein Datenimport und keine Benutzerneuanlage.

## Qualitätssicherung und Ergebnisse

- `npm run check` – erfolgreich.
- `npm test` – erfolgreich; inklusive Auth-/Rezept-/Gruppen-/Import-/Sicherheits- und neuer KI-Edge-Tests.
- `npm run build` – erfolgreich; 20 freigegebene Pages-Dateien.
- `npm run test:db` – erfolgreich mit PGlite; keine Cloud-Datenbank berührt.
- Der separate Produktionsmigrations-Entwurf wurde zusätzlich lokal gegen ein minimales PGlite-Schema geprüft: transaktionale Neuanlage funktioniert, bestehende Importobjekte lösen einen Abbruch aus und bleiben erhalten.
- `npm run test:browser:all` – erfolgreich; alle Browserregressionen liefen mit kontrollierten Supabase-/KI-Mocks, ohne Live-Schreibzugriffe.
- Edge-Regressionen prüfen den beibehaltenen Cloudflare-Modus und den neuen Caddy-Modus; fehlender Backend-Bearer/ungültiger Modus führt geschlossen zu 503. Fortschritts-URLs mit Query oder Fragment werden abgelehnt.
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
- [ ] Caddy-DynDNS-Endpunkt mit vertrauenswürdigem Zertifikat, geklärter Portweiterleitung, Backend-Bearer und serverseitigem Rate Limit
- [ ] serverseitige KI- und Import-Secrets im richtigen Projekt vorhanden
- [ ] Functions einzeln gegen Produktionsrechte und Datenbestand geprüft
- [ ] Testkonto-Live-Login und Gruppen-/Rezept-/Bildtests abgeschlossen
- [ ] Freigabe für jede Migration und jedes Deployment
- [ ] Release-Commit und separater Push-/PR-/Merge-Beschluss
