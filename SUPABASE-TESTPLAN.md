# Supabase-Testplan: hmjtzcebgbkryucvkndu

Stand: die Bootstrap-Migration und fünf Edge Functions sind im Testprojekt. Die drei Auth-Fehlerkorrekturen wurden nach erneut bestätigtem Ziel und Planhash einzeln ausschließlich dort deployed. Die Änderungen an Auth-Einstellungen/Secrets und Testdaten sind nicht erfolgt; auch gab es keine kostenpflichtigen KI-Aufrufe, Commits, Pushes oder Merges.

## Bestätigtes Ziel und offene Angaben

- Repository: `nordlicht78/RezeptShare`, aktueller lokaler Integrationsbranch einschließlich aller uncommitteten Änderungen.
- Vom Nutzer bestätigte Projekt-ID: `hmjtzcebgbkryucvkndu`.
- Vorbereitete Standard-URL: `https://hmjtzcebgbkryucvkndu.supabase.co`.
- `.supabase-test/target.json` enthält genau diese Referenz, `projectName=RezeptShare-Test`, `environment=test`, `confirmedByUser=true`. Das ist eine lokale Zweckbestätigung und keine Cloud-Schreibfreigabe.
- `konfiguration.lokal.js` enthält die angegebene URL und den vom Nutzer gelieferten öffentlichen Publishable-Key. Weitere KI-Endpunkte sind leer. Die Datei ist Git-ignoriert. Die Schutzprüfung akzeptiert sie; kein Secret-/Service-Role-Key wurde eingetragen.
- Das Dashboard konnte über den verfügbaren Browserzugriff nicht gelesen werden. URL und Projektzustand sind dadurch nicht unabhängig im Dashboard bestätigt. Die CLI meldet den Hauptbranch als `production`; Projektname und ID stimmten bei jeder Abfrage mit dem bestätigten Ziel überein.
- Die read-only Secret-Namenabfrage ergab, dass `OPENAI_API_KEY` vorhanden ist. Der Wert wurde weder gelesen noch ausgegeben; seine Gültigkeit wurde nicht getestet.

Die Dashboard-URL konnte nicht unabhängig geprüft werden; der lokale Guard bestätigt jedoch die exakte Zuordnung der Nutzerangaben (URL-Host und Projekt-ID). Im Dashboard unter [Settings → API Keys](https://supabase.com/dashboard/project/hmjtzcebgbkryucvkndu/settings/api-keys) darf ausschließlich der öffentliche **Publishable Key** stehen. Kein Secret-/Service-Role-Key oder OPENAI_API_KEY gehört in Browserdateien, Git oder Chat.

Offizielle Orientierung: [Supabase API Keys](https://supabase.com/docs/guides/getting-started/api-keys).

## Angewendete Datenbankänderung

Für ein **leeres** Testprojekt ist genau eine lokale Bootstrap-Migration vorgesehen:

`.supabase-test/supabase/migrations/202611150001_test_bootstrap.sql`

Sie ist bytegleich zum aktuellen `supabase/schema.sql`. SHA-256:

`393ec1235c8024f3c7e61b72564ce57a45d52d626bfa76a2243f579d3287b642`

Enthalten sind die ursprünglichen Basistabellen und alle vier historischen Upgrades: Profile/Rollen (202611060001), Gruppenverwaltung (202611060002), Mehrfachgruppen/öffentliche Links (202611100001) und Buchimportlimits (202611140001). Die vier historischen Dateien werden **nicht zusätzlich** gegen dieselbe Initialinstallation ausgeführt. Sie setzen bereits vorhandene Basistabellen voraus und sind allein keine Neuinstallation.

Das Bootstrap-Paket legt zehn App-Tabellen an: profile, gruppen, gruppen_mitglieder, rezepte, einladungen, rezept_aenderungen, ausgeblendete_aenderungen, rezept_freigaben, rezept_auftraege, rezept_import_nutzung. Dazu kommen die privaten Hilfsfunktionen, RLS/Policies, auf Rollen beschränkte RPCs, Trigger für persönliche Gruppen und Zugriffsschutz. Die separate Nutzungstabelle erlaubt nur der serverseitigen Service-Rolle die atomare Quota-Reservierung: 10 Aufträge pro Nutzer/UTC-Tag, mindestens 60 Sekunden Abstand.

Drei Storage-Buckets entstehen im Testprojekt: `rezeptbilder`, `profilbilder`, `rezeptfreigaben`, jeweils privat, 5 MiB Dateilimit, JPEG/PNG/WebP. Öffentliche Rezeptlinks liefern ausschließlich bewusst freigegebene Rezeptstände über die vorhandene Edge Function und zeitlich begrenzte Bildlinks. Das Schema installiert außerdem pg_cron und den minütlichen Bereinigungsjob `rezept-aenderungen-bereinigen` für abgelaufene Änderungshinweise. Der Job wurde anschließend als aktiv mit Zeitplan `* * * * *` read-only bestätigt.

**Audit vor der Migration:** Die SELECTs zeigten keine App-Tabellen in `public`/`private`, keine App-Policies oder Rezept-Buckets und keine `supabase_migrations.schema_migrations`. Die vorhandenen `storage`-Tabellen waren Supabase-Systemtabellen. Das Projekt hatte `pgcrypto` 1.3 und die Standardrollen. Der Dry-Run listete ausschließlich `202611150001_test_bootstrap.sql`; der bestätigte Planhash war `5a0111cdc447977c60e7b566ed99edfcbea92890aea50ec0b248c1d708e3c80e`.

**Migrationsergebnis:** Supabase bestätigte `Applying migration 202611150001_test_bootstrap.sql` und meldete nach Abschluss ausschließlich diese Migration. Der erste Helfer-Lauf ohne `--yes` wurde vom CLI im Agent-Modus mit „Nothing was changed“ abgewiesen; danach wurden Ziel, Hash und Dry-Run erneut geprüft und die Nutzerfreigabe entsprechend mit `--yes` angewendet.

**Read-only Nachprüfung:** Zehn App-Tabellen sind vorhanden und alle zehn haben RLS aktiviert. Das Audit zeigt die Gruppen-/Rezept-/Profil-Policies sowie Storage-Policies. Die drei Buckets `rezeptbilder`, `profilbilder`, `rezeptfreigaben` sind privat, erlauben JPEG/PNG/WebP und haben 5 MiB Dateilimit. Die erwarteten Funktionen im Schema sind vorhanden; `rezept_import_limit(uuid)` ist `SECURITY DEFINER`, hat `search_path=""`, ist für `service_role` ausführbar und nicht für `authenticated`. `rezept_import_nutzung` ist für die Service-Rolle berechtigt. Die `pg_cron`-Extension ist installiert; der Bereinigungsjob ist aktiv. Die Migration `202611150001` ist registriert.

## Function-Deployment und Live-Prüfung

Beim ersten Function-Release wurden die fünf freigegebenen Functions einzeln mit `--remote=hmjtzcebgbkryucvkndu --use-api --yes` deployed. Danach wurden in dieser Runde ausschließlich die drei Auth-korrigierten Functions erneut deployed. Die aktuelle read-only Liste enthält genau `rezept-speichern`, `rezept-gruppen`, `gruppe-loeschen`, `konto-loeschen` und `rezept-importieren`; die drei aktualisierten sind Version 2, die übrigen Version 1, alle aktiv und `verify_jwt=false`. Andere Functions, insbesondere `ki-fortschritt`, wurden nicht deployed. `OPENAI_API_KEY` wurde zuvor als Testprojekt-Secret bestätigt; der Wert wurde nie gelesen oder ausgegeben.

Nicht kostenpflichtige Endpunkttests: CORS-OPTIONS antwortete bei allen fünf Functions mit HTTP 200 und `Access-Control-Allow-Origin: *`. Unauthentifizierte POSTs wurden abgelehnt: `rezept-gruppen` und `rezept-importieren` mit 401, `rezept-speichern`, `gruppe-loeschen` und `konto-loeschen` mit 400. Die drei letzteren behandeln den fehlenden Auth-Kontext als allgemeinen Fehlerstatus; eine Sitzung wurde dennoch nicht akzeptiert. Es gab keine OpenAI-Aufrufe.

Die drei betroffenen Handler geben bei fehlender/ungültiger Sitzung 401 zurück. Regressionstests bestätigen, dass dabei weder Datenbank- noch Storage-Aktionen stattfinden. Das aktualisierte Paket wurde geprüft; aktueller Planhash: `5b67f6457010a3053996b0c25921244b5d9f8224f9901071011bcb265beb1e70`. Nach erneutem Abgleich wurden ausschließlich `rezept-speichern`, `gruppe-loeschen` und `konto-loeschen` einzeln auf Version 2 aktualisiert. Die read-only Function-Liste bestätigt alle fünf Functions aktiv, weiterhin `verify_jwt=false`. Unauthentifizierte POST-Proben an die drei aktualisierten Funktionen ergaben jeweils HTTP 401.

Der hCaptcha-Site-Key wurde lokal in beiden Formularen durch den vom Nutzer angegebenen öffentlichen Key ersetzt. `captcha.js` rendert beide Widgets; Regressionstests prüfen den Key in Login/Registrierung sowie `captchaToken` in `signInWithPassword` und `signUp`. Bei Signup wird `emailRedirectTo` jetzt auf den App-Ursprung gesetzt. Bei Registrierung ohne direkte Sitzung zeigt die App den Hinweis, die Bestätigungs-E-Mail zu öffnen und danach anzumelden. Der Secret-Wert wurde nicht gelesen und nicht geändert. Die öffentliche Supabase-Auth-Settings-Antwort meldet `disable_signup=false` und `mailer_autoconfirm=false`; die Registrierung ist aktiviert, aber eine direkte Sitzung vor E-Mail-Bestätigung ist nicht zu erwarten. Die Site URL, Redirect-URL-Liste und die konfigurierte hCaptcha-Secret-Präsenz waren nicht über die öffentliche Settings-Antwort abrufbar. Der Browserzugriff auf das Dashboard war nicht verfügbar; diese drei Werte bleiben unbestätigt. Die Redirect-URL muss im Testprojekt erlaubt sein.

hCaptcha unterstützt `localhost` und `127.0.0.1` nicht als Widget-Hostnamen. Die [offizielle hCaptcha-Anleitung zur lokalen Entwicklung](https://docs.hcaptcha.com/#local-development) empfiehlt einen eigenen Hostnamen, der lokal auf `127.0.0.1` zeigt. Ein passender Domainname/Eintrag wurde hier nicht eingerichtet; keine System-Hosts-Datei und kein hCaptcha-Dashboard wurden verändert. Verwende den bereitgestellten Key mit einem Hostnamen, der für diesen Key zugelassen ist. Die offiziellen Testkeys würden ein passendes Test-Secret im Supabase-Auth erfordern und wurden wegen des Verbots von Secret-Änderungen nicht verwendet.

Ein einzelner Loginversuch mit zufälligen, nicht existierenden Zugangsdaten und ungültigem hCaptcha-Token endete mit HTTP 400; die Antwort enthielt keinen auslesbaren Fehlercode. Das bestätigt weder, dass hCaptcha im Supabase-Auth aktiviert ist, noch, dass das Secret zum Site Key passt. Der Secret-Wert wurde nicht abgerufen.

Der Live-E2E-Ablauf mit Registrierung, Anmeldung, Abmeldung, Gruppe, Rezept, Bild und Zwei-Benutzer-Zugriffsschutz ist noch nicht gelaufen. Dafür fehlen Dashboard-Bestätigung der hCaptcha-/URL-Einstellungen, ein für hCaptcha unterstützter lokaler Hostname und eine erreichbare Browseroberfläche. Es wurden keine Auth-Konten oder Rezept-/Gruppendaten angelegt. Anonyme REST-Proben auf `gruppen` und `rezepte` ergaben HTTP 401; eine anonyme Storage-Listenanfrage an `rezeptbilder` ergab HTTP 200 mit null Objekten. Die Storage-Antwort allein prüft keine Rechte an einem konkreten Objekt; Zwei-Benutzer-Privatheit ist daher nicht bestätigt.

Das zuvor geprüfte Originalfoto ist JPEG, 5712 × 4284 Pixel, 6,600,420 Bytes. Es blieb unverändert und wurde nicht hochgeladen. Es ist größer als das vorgesehene 5-MiB-Bucketlimit und soll nicht für den kleinen Storage-Smoke-Test genutzt werden. Das synthetische JPEG `tests/fixtures/live-kochbuch/kartoffelsuppe-testseite.jpg` ist 1200 × 1600 Pixel und 128,564 Bytes; es eignet sich als kleine Testdatei, wurde aber ebenfalls nicht hochgeladen.

## Vorbereitung lokaler hCaptcha-/E2E-Host

Der App-Server liest `PORT` (Standard 3000) und bindet ausschließlich an `127.0.0.1`. Port 3000 war durch einen Docker-Prozess belegt; die geschützte RezeptShare-Testinstanz läuft deshalb auf Port 3001 und bindet weiterhin nur an Loopback. Ein lokaler Request mit `Host: rezeptshare.test.example.com:3001` lieferte HTTP 200 und den Titel „Rezept Share“. Die Antwort-CSP erlaubt hCaptcha sowie exakt `https://hmjtzcebgbkryucvkndu.supabase.co`; `/konfiguration.js` lieferte dieselbe Testprojekt-URL, einen öffentlichen Key und leere zusätzliche KI-Endpunkte. Die OS-Hostauflösung hat keinen Eintrag für den vorgeschlagenen Namen. `/etc/hosts` wurde nicht geändert; die App ist daher über diesen Namen noch nicht nativ im Browser erreichbar.

Vorgeschlagener Systemeintrag, ausdrücklich noch **nicht angewendet**:

```text
127.0.0.1 rezeptshare.test.example.com
```

hCaptcha erwartet den Hostnamen ohne Schema und Port: `rezeptshare.test.example.com`. Es verbietet `localhost` und `127.0.0.1` als bereitgestellte Hostnamen und dokumentiert als lokalen Weg einen eigenen Hosts-Alias. `example.com` ist laut IANA für Beispiele reserviert und nicht registrierbar; falls die hCaptcha Domain Allowlist aktiv ist, besser einen Hostnamen unter einer eigenen Domain verwenden. Es wurde nichts am hCaptcha-Dashboard geändert.

Die App setzt bei der Signup-Bestätigung `emailRedirectTo` auf `window.location.origin`. Für den aktuellen Serverport 3001 lauten die vorgesehenen Supabase Auth Werte:

- Site URL: `http://rezeptshare.test.example.com:3001`
- Additional Redirect URL: `http://rezeptshare.test.example.com:3001` (optional zusätzlich derselbe Host mit `/**`, falls der Bestätigungsfluss einen tieferen lokalen Pfad verwendet)
- hCaptcha Host Allowlist, falls eingeschaltet: `rezeptshare.test.example.com` (ohne `http://` und ohne Port; bei eigener Domain den finalen Host einsetzen)

Diese Werte sind Vorschläge und wurden nicht aus dem Dashboard bestätigt oder dort gespeichert. Keine Registrierung oder Rezept-/Storage-Schreiboperation lief in dieser Runde.

Die Importfunktion nimmt JPEG/PNG/WebP bis 20 MiB und 60 MP an. Das Original mit 5712 × 4284 Pixeln (ca. 24.5 MP) und 6.6 MB ist innerhalb dieser Eingabelimits. Im Browser wird es EXIF-orientiert gelesen, auf höchstens 2304 px an der längsten Kante skaliert (bei diesem Bild voraussichtlich 2304 × 1728), als JPEG mit Qualitätsstufen 0.86/0.73/0.58/0.42 kodiert und auf maximal 1 MiB pro Seite begrenzt; mehrere Seiten dürfen zusammen höchstens 5 MiB ergeben. Nur der komprimierte Blob wird an die Importfunktion übergeben. Das Original blieb unangetastet; eine temporäre Kopie war nicht nötig.

Hinweis zur Audit-Ausgabe: Die vorbereitete Abfrage über `information_schema.table_privileges` lieferte keine Zeilen. Eine zusätzliche read-only Prüfung der tatsächlichen `pg_class.relacl`-/`has_table_privilege`-Werte bestätigte die Rollen-ACLs; die Quota-Funktion zeigte `service_execute=true` und `auth_execute=false`. Es wurden keine Datenzeilen abgefragt.

## Audit und Freigabehash

`scripts/supabase-test-audit.sql` enthält ausschließlich Metadaten-SELECTs: Tabellen/RLS, Policies, Bucket-Einstellungen, Rollen, Funktionssignaturen/Definer- und Suchpfadeinstellungen, Grants und Extensions. Keine Benutzerinhalte oder Passwort-Hashes werden ausgewählt. Der Aufruf verwendete `--read-only`; die Migrationshistorie wurde ergänzend abgefragt und die Tabelle war nicht vorhanden.

Audit-SHA-256: `de840c42fd3536f49c22b29bffedddb93ff059e0bd6afbe983088a37ce85459b`.

Der beim Start kontrollierte Freigabehash des vollständigen lokalen Plans war:

`5a0111cdc447977c60e7b566ed99edfcbea92890aea50ec0b248c1d708e3c80e`

Die vollständige Manifest-/Befehlsliste liegt ignoriert in `.supabase-test/release-plan.json`. Schema, Funktionspaket, Konfiguration, Audit und explizites Ziel sind gebunden; Änderungen machen eine erneute Planprüfung erforderlich. Der Hash ist ein lokaler Änderungsnachweis, keine bereits erteilte Zustimmung. Die lokale Browserkonfiguration ist inzwischen vollständig; das schaltet keinen Cloud-Schreibzugriff frei.

Plan ausschließlich lokal erneut anzeigen:

```bash
npm run plan:supabase:test -- --confirm-ref hmjtzcebgbkryucvkndu
```

## Noch ausstehende Cloud-Schritte

Die lokale Supabase-CLI verwendet `--remote=REFERENZ` (Hilfetexte für db push, db query und functions deploy wurden lokal geprüft). Es wird kein implizit verknüpftes Projekt benutzt. Kein pauschales Function-Deployment, kein --prune, kein Seed-/Produktivdatenimport und keine Vault-Synchronisierung.

Vor jeder weiteren Cloud-Schreiboperation: ID `hmjtzcebgbkryucvkndu` erneut prüfen, den aktuellen Plan zeigen und ausdrückliche Nutzerfreigabe für genau diese Aktion einholen. Das freigegebene Function-Deployment ist abgeschlossen.

Audit und Dry-Run wurden read-only ausgeführt; die Migration ist angewendet. Diese Befehle dokumentieren die geprüften Aufrufe:

```bash
supabase --workdir .supabase-test db query --remote=hmjtzcebgbkryucvkndu --read-only --file /Users/afranke/ai-stack/recipe-rag/RezeptShare-KI/RezeptShare/scripts/supabase-test-audit.sql
supabase --workdir .supabase-test db push --remote=hmjtzcebgbkryucvkndu --dry-run --skip-vault
```

Der Dry-Run listete nur `202611150001_test_bootstrap.sql`. Diese Migration wurde nach erneuter Ziel-/Hash-/Dry-Run-Prüfung ausdrücklich freigegeben und angewendet:

```bash
supabase --workdir .supabase-test db push --remote=hmjtzcebgbkryucvkndu --skip-vault --yes
```

Die fünf einzeln freigegebenen Functions wurden mit diesen expliziten Zielbefehlen deployed:

```bash
supabase --workdir .supabase-test functions deploy rezept-speichern --remote=hmjtzcebgbkryucvkndu --use-api
supabase --workdir .supabase-test functions deploy rezept-gruppen --remote=hmjtzcebgbkryucvkndu --use-api
supabase --workdir .supabase-test functions deploy gruppe-loeschen --remote=hmjtzcebgbkryucvkndu --use-api
supabase --workdir .supabase-test functions deploy konto-loeschen --remote=hmjtzcebgbkryucvkndu --use-api
supabase --workdir .supabase-test functions deploy rezept-importieren --remote=hmjtzcebgbkryucvkndu --use-api
```

Der erste Aufruf über den Release-Helfer wurde ohne Schreibwirkung wegen fehlender CLI-Bestätigung abgewiesen. Die anschließende Anwendung erfolgte mit der bestätigten direkten CLI-Option `--yes`. Weitere Schreibaktionen benötigen eine neue ausdrückliche Freigabe:

```bash
node scripts/supabase-test-release.cjs deploy --confirm-ref hmjtzcebgbkryucvkndu --approved-plan 5a0111cdc447977c60e7b566ed99edfcbea92890aea50ec0b248c1d708e3c80e
```

## Edge Functions und Laufzeit

- `rezept-importieren`: Anmeldung und aktives Profil im eigenen Projekt, Body-/JPEG-Limits, Quota-RPC und validierte strukturierte Antwort. OPENAI_API_KEY ausschließlich über serverseitiges Supabase-Secret. Es speichert keine Seiten in Storage und legt keine Rezepte an.
- `rezept-gruppen`: vorhandene Erstellung, Gruppenkopien und öffentliche Freigaben. Nur die Aktion `ansehen` ist bewusst öffentlich; Schreibaktionen prüfen Auth/Profil, Gruppenrechte und SQL-Transaktionen. Der Import verwendet weiterhin diesen Speicherweg.
- `rezept-speichern`: Gruppenrechte, Versionskonflikte und Änderungshinweise für bestehende Rezepte.
- `gruppe-loeschen`: Admin-/Gruppenprüfung und kontrollierte Storage-Bereinigung.
- `konto-loeschen`: Auth, Passwortprüfung und bestehende Daten-/Storage-Löschabläufe.

Alle fünf Funktionen stehen im Paket; die gemeinsamen Clients nutzen ausschließlich die Umgebung des Zielprojekts (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). `verify_jwt=false` entspricht dem bestehenden Muster; die Funktionen prüfen die Sitzungen selbst über auth.getUser(). Schlüssel dieser automatisch bereitgestellten Serverumgebung werden nicht in Browserdateien kopiert.

`ki-fortschritt` ist lokal vorhanden, wird aber nicht deployt. Der Quellcode der externen `ki-assistent`-Function/Mac-Studio-API fehlt weiterhin. `kiUrl`, `kiPublishableKey`, `kiProgressUrl` bleiben leer und dürfen im Buchimport-Testmodus nicht aktiviert werden. Die bisherige KI-Oberfläche ist weiterhin mit Mocks/Demo testbar; für echte Chatdienste ist eine eigene spätere Testeinrichtung erforderlich.

## Noch gesondert freizugeben

1. Projekt-ID und URL vor allen weiteren Cloud-Aktionen nochmals im Dashboard prüfen.
2. `OPENAI_API_KEY` ist im Testprojekt bereits als Secret vorhanden. Nicht erneut setzen oder auslesen, sofern keine bewusste Rotation gewünscht ist. Bei Bedarf im Supabase-Dashboard des Testprojekts unter Edge Functions → Secrets ändern; niemals in Browserdateien oder Git speichern. Das Modell kann ohne separates Secret den serverseitigen Standard `gpt-4.1-mini` verwenden.
3. Die drei Auth-korrigierten Functions sind jetzt Version 2; alle fünf stehen aktiv im Testprojekt. Vor dem Login im Dashboard Site URL, lokale Redirect-URL und hCaptcha-Secret-Präsenz prüfen. `mailer_autoconfirm=false` bedeutet, dass Registrierung eine gültige Mailbox und Bestätigung benötigen kann; die App erwartet nach Signup zunächst eine Sitzung. Auth-Einstellungen wurden nicht geändert.
4. Lokaler Start mit `npm run start:test -- --confirm-ref hmjtzcebgbkryucvkndu` ist auf `http://127.0.0.1:3000`. Für hCaptcha ist diese Browseradresse ungeeignet. hCaptcha dokumentiert einen eigenen lokalen Hostnamen, der auf Loopback zeigt. Diesen Hostnamen bei Bedarf in hCaptcha zulassen und mit `http://<lokaler-dev-host>:3000` öffnen; hCaptcha Challenge muss ein Mensch lösen.
5. Für den E2E-Test Testkonto anlegen und ggf. E-Mail bestätigen, dann ab-/anmelden, Testgruppe und Rezept speichern, ein synthetisches JPEG unter 5 MiB hochladen und das Rezept bearbeiten. Für Cross-User-Tests braucht es ein zweites Testkonto; zunächst keine bestehenden Datensätze verwenden. Der echte KI-Import bleibt bis zu einer separaten Kostenfreigabe aus.

## Lokale Prüfungen

Syntax, vollständige npm-Tests, acht Import-Regressionsfälle samt Negativproben, Schutz-/Release-Tests, alle sechs Browser-Regressionsprogramme und Pages-Build sind nach den Änderungen erfolgreich. Die Auth-Regression prüft Site Key, Tokenweitergabe, Einmalverwendung, E-Mail-Bestätigung und den E-Mail-Rücksprung. Browsertests verwenden gemocktes Supabase und CAPTCHA; sie bestätigen keinen echten hCaptcha-Token. Automatisierte Serverprüfungen erzwingen mit REZEPTSHARE_OFFLINE_TEST=1 leere Browserkonfiguration und eine CSP ohne Supabase-Freigaben. Es gab keine Live-Login-, Upload-, Gruppen- oder Rezept-Schreibtests.

Das Dashboard wurde nicht erreicht, daher bleiben Site URL, Redirect-URLs und hCaptcha-Secret-Präsenz/-Konfiguration unbestätigt. Die öffentliche Auth-Settings-Antwort zeigt Signup aktiv und `mailer_autoconfirm=false`. Die drei korrigierten Functions sind deployed und liefern bei unauthentifizierten Proben HTTP 401. Echte Benutzer-Sitzungen, Uploads/Bearbeitung und Cross-User-Rechte bleiben ausstehend. Der private Bucket ist laut Migration privat, aber Storage-Zugriff auf ein konkretes Objekt wurde nicht geprüft. Der Planhash muss vor jeder späteren Schreibaktion erneut abgeglichen werden.

## Folgearbeiten aus der lokalen Regression

Die getesteten Kochbuch- und KI-Erweiterungen sollen später in die bestehende RezeptShare-Anwendung integriert werden. Dabei bleiben bestehende Supabase-Benutzerkonten, Gruppen, Mitgliedschaften, Rezepte sowie Rezept- und Profilbilder in der bestehenden produktiven Instanz erhalten. Es gibt keine automatische Datenmigration, keine Benutzerkopien und keine Änderung am Produktivprojekt.

Vor einer späteren Übernahme sind Produktivschema, Policies, Trigger, Bucketnamen und Storage-Pfade read-only zu inventarisieren und mit der getesteten Version zu vergleichen. Erst nach Review/Freigabe darf ein additiver Migrationsplan erstellt werden, der IDs und vorhandene Daten unangetastet lässt. Neue Importkontingente oder Funktionstabellen müssen neben bestehenden Daten ergänzt werden; Rezepttabellen dürfen nicht neu erstellt oder ersetzt werden. Funktions- und Frontendänderungen danach kontrolliert integrieren und mit einer Wiederherstellungsplanung versehen.

Die lokale Browser-UUID-Hilfe nutzt `crypto.randomUUID()` wenn verfügbar und ansonsten UUIDv4 aus `crypto.getRandomValues()`. Für diesen Zweck ist der lokale HTTP-Testhost geeignet, weil `getRandomValues()` auch in unsicheren Kontexten nutzbar ist. Ohne CSPRNG wird sicher abgebrochen; es gibt keinen `Math.random()`-Ersatz. Die momentane Kamera ist ein Datei-Input mit `capture="environment"`; es gibt keinen Live-Stream-Aufruf mittels `getUserMedia()`. Falls später Live-Kamera oder andere secure-context APIs hinzukommen, ist lokales HTTPS beziehungsweise localhost erforderlich. hCaptcha wurde nicht deaktiviert.

Nach einer erfolgreichen Registrierung ohne Session erscheint eine E-Mail-Bestätigungsansicht, die Registrierungsfelder sind deaktiviert und das Formular ist ausgeblendet. Anmeldung bleibt möglich. „Andere E-Mail-Adresse verwenden“ setzt Formular und CAPTCHA zurück und beginnt bewusst einen neuen Versuch. Fehlerhafte Registrierungsantworten aktivieren die Bestätigungsansicht nicht.

Das Importkontingent bleibt unverändert aktiv: bis zu 10 Reservierungen pro UTC-Tag mit mindestens 60 Sekunden Abstand. Das RPC reserviert vor dem Provider-Aufruf, daher verbrauchen Fehler nach erfolgreicher Reservierung (einschließlich Providerfehlern und Timeouts) einen Auftrag. Eine Limit-Ablehnung selbst reserviert keinen weiteren. Die Function fragt nach Ablehnung nur lesend `tag`, `anzahl` und `zuletzt` ab, um Wartezeit, Tageslimit und unklare Kontoschutz-Ablehnung getrennt zu melden; diese Diagnose kann keine Reservierung freigeben.

Die aktuelle anonymisierte Read-only-Abfrage des Testprojekts ergab am UTC-Tag `2026-11-15` einen Nutzer mit Importhistorie: Zähler 1, letzte Reservierung `2026-11-15T17:24:49Z`, rund 14.029 Sekunden vor der Abfrage. Damit war zum Prüfzeitpunkt weder die 60-Sekunden-Sperre noch das Tageslimit aktiv. Der ursprüngliche historische HTTP-Status/Response wurde nicht aufgezeichnet; der damalige generische Text fasste beide Limitgründe zusammen. Der aktuelle Zählerstand belegt nicht, ob eine frühere Providerstörung auftrat. Im bisherigen Handler bedeutete exakt dieser Limittext eine HTTP-429-Antwort; die konkrete historische Antwort ließ sich nicht mehr unabhängig aus Logs abrufen.

## Kontrollierter Einzeldeploy am 2026-11-15

Der Release-Schutz wurde um die Aktion `deployImport` ergänzt. Sie erlaubt nur `rezept-importieren`, prüft den Ziel-Ref und den aktuellen Planhash erneut vor dem Aufruf und setzt `--yes` nur auf diesen Einzeldeploy-Befehl. Die zwei geänderten gemeinsamen Importmodule wurden im isolierten Paket aktualisiert; die verifizierte Dateiliste enthielt weiterhin keine anderen Quelländerungen. Der aktuelle Planhash beim Deployment war `89c1727872605a49c7582c0c5149413973f390840d1546891619390a499d0ac1`.

Der Deploy wurde ausschließlich auf `hmjtzcebgbkryucvkndu` ausgeführt. Supabase bestätigte `rezept-importieren`; hochgeladen wurden nur deren Entry Point und `_shared/import-handler.mjs`, `_shared/import-format.mjs`, `_shared/http.ts`. Read-only `functions list` zeigte die Function als ACTIVE, Version 2. Die nicht authentifizierte Probe lieferte HTTP 401 und `{code:"IMPORT_ERROR", error:"Bitte melde dich erneut an."}`. Sie rief OpenAI nicht auf. Die vier anderen Functions wurden nicht deployed.

Am 2026-11-16 wurde dasselbe hash-geprüfte Einzeldeployment nochmals ausgeführt. Read-only zeigte `rezept-importieren` ACTIVE, Version 3; die anderen vier Function-Versionen blieben unverändert. Eine neue unauthentifizierte Probe erhielt erneut HTTP 401 mit `IMPORT_ERROR`; kein OpenAI-Aufruf.

## Live-Schreibtest: wartet auf Anmeldung

Am 2026-11-16 wurde die ausdrückliche Freigabe für ausschließlich gekennzeichnete Live-Testdaten erteilt. Das lokale Browserfenster zeigt weiterhin das hCaptcha-Anmeldeformular; ein angemeldeter Testnutzer ist noch nicht vorhanden. Deshalb wurden noch keine Profil-/Gruppen-/Rezept-/Storage-Schreibvorgänge ausgeführt und nichts gelöscht. Der kostenpflichtige KI-Aufruf bleibt aus. Nach erfolgreichem Browser-Login müssen vorhandene Profilbilddaten zuerst geprüft werden; bei einem vorhandenen Profilbild wird es nicht ersetzt.

Das unveränderte Originalfoto ist ein JPEG mit 5712×4284 Pixeln und 6.600.420 Bytes. Die lokale Browserregression führte es durch dieselbe Frontend-Komprimierung und erhielt ein JPEG mit 2304×1728 Pixeln und 721.880 Bytes. Die Testantwort war fest gemockt; das Bild wurde weder an Supabase noch OpenAI gesendet, und es wurde kein Rezept gespeichert.

Alle Unit-/Projekt-Tests, `npm run check`, `npm run build`, `git diff --check` sowie die sechs Browserregressionen bestanden. Die Browserprüfungen für Profilbild, Auth, Gruppen, Rezepte und Uploads verwenden Mock-Supabase. Echte Konto-/Profil-/Gruppen-/Rezept-/Storage-Schreibtests stehen noch aus und benötigen eine separate Freigabe. Der echte Kochbuch-KI-Aufruf ist weiterhin ausstehend.
