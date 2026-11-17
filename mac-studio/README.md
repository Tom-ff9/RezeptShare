# Mac-Studio-Rezept-API

Diese lokale Betriebsdokumentation beschreibt die FastAPI auf Loopback sowie die vorbereitete Caddy/DynDNS-Anbindung. Die bestehenden Ollama-Modelle und Qdrant-Collection werden nicht verändert.

## Lokaler Dienst

FastAPI läuft über den LaunchAgent `de.franke.recipe-api` auf `127.0.0.1:8000`. Ollama und Qdrant werden nicht durch den öffentlichen Reverse Proxy geroutet. Der LaunchAgent verwendet den Wrapper `run_recipe_api.py`, startet keine zweite Instanz und rotiert begrenzte Logs. Der Healthcheck `npm run health:mac-studio` prüft lokal FastAPI, Ollama und Qdrant; Anfrageinhalte und Token werden nicht protokolliert.

Der Backend-Bearer liegt ausschließlich in `~/Library/Application Support/RezeptShare/recipe-api-token` (Verzeichnis `0700`, Datei `0600`). Das Secret wird nie ausgegeben oder in Prozessargumenten übergeben. Die API prüft den Bearer konstantzeitlich. `/docs`, `/redoc` und `/openapi.json` sind deaktiviert.

## Caddy und DynDNS: aktueller Stand

Die einzige aktive Caddy-Website ist `ai.intern.franke` mit `tls internal` und Reverse Proxy zu OpenWebUI `127.0.0.1:3000`. Beide Homebrew-Caddyfile-Pfade verweisen auf `/Users/afranke/ai-stack/caddy/Caddyfile`. Es wurde kein Caddy-Reload und keine Änderung an dieser aktiven Datei vorgenommen.

Aktuelle Read-only-Prüfung nach Einrichtung der FRITZ!Box-Freigaben: DNS A zeigt auf `86.103.9.112`, aber es gibt keinen AAAA-Eintrag. Der öffentliche TCP-Port 80 erreicht Caddy und liefert derzeit nur `308` auf HTTPS/443. Dort antwortet weiterhin die FRITZ!Box mit selbstsigniertem Zertifikat (CN `kronshagen.hopto.org`, Router-/Heimnetz-SANs, nicht vertrauenswürdig). Port 8443 hat lokal keinen Listener; die externe IPv4-Verbindung scheitert. Ein direkter IPv6-Test für den Host ist mangels AAAA nicht möglich. Der Legacy-Port 57001 ist extern geschlossen. Die macOS Application Firewall war deaktiviert. Die FRITZ!Box soll auf 443 unverändert bleiben; der vorbereitete Endpunkt ist deshalb `https://kronshagen.hopto.org:8443`.

Der lokale Kandidat `Caddyfile.rezeptshare.example` und die zusammengeführte Konfiguration sind mit der installierten Caddy-Version validiert. Es erfolgte kein Reload und der Kandidat ist nicht aktiv. TCP 80→Caddy:80 ist jetzt von IPv4 aus wirksam; der aktuelle sichere Fallback ist nur Caddys HTTPS-Redirect. TCP 8443→Caddy:8443 scheint noch nicht wirksam und lokal lauscht dort kein Dienst. Nach Freigabe der Aktivierung könnte Caddy über HTTP-01 das öffentliche Zertifikat beziehen und automatisch erneuern. Der Entwurf routet ausschließlich:

- `POST /v1/chat/completions` an `127.0.0.1:8000`, Requestlimit 50 KB, Upstream-Header-Timeout 80 s.
- `GET /v1/recipe-progress/{UUID}` an `127.0.0.1:8000`, Upstream-Header-Timeout 4 s.
- alle anderen Pfade/Methoden an `404`.

Für die reine Zertifikatsvorbereitung gibt es [`Caddyfile.certificate-only.example`](Caddyfile.certificate-only.example). Dieser separate Hostblock konfiguriert ACME HTTP-01 und deaktiviert TLS-ALPN. HTTPS-Anfragen auf Port 8443 beantworten alle Pfade, Methoden und Header ausschließlich mit HTTP 503; es gibt keinen Upstream und keine FastAPI-Weiterleitung. Die Vorlage wurde nur lokal erstellt/validiert und ist nicht aktiv. Ein Reload würde die ACME-Anforderung auslösen und den 503-Endpunkt öffentlich erreichbar machen; dafür ist die ausdrückliche Freigabe erforderlich.

FastAPI bleibt die zwingende zweite Schutzschicht mit Bearer-Authentifizierung. Caddy reicht den Authorization-Header nur durch und protokolliert ihn nicht. Caddy besitzt kein installiertes Rate-Limit-Modul. Die Edge Function ist jetzt auf eine DB-basierte Migration vorbereitet, die 20 Reservierungen pro Nutzer/UTC-Tag und einen aktiven Request pro Nutzer erzwingt. Diese Quote greift erst nach Schemaabgleich, Migration und Function-Deployment; bis dahin darf die KI-Route nicht veröffentlicht werden. Zusätzlich begrenzt die Edge Function Bodygröße, Chatverlauf und Wartezeit.

Vor einer Freigabe muss eine gültige öffentliche TLS-Kette für `kronshagen.hopto.org:8443` im Browser/mit Zertifikatsprüfung funktionieren. IPv4-Port 80 erreicht Caddy, aber bis der neue Host konfiguriert und geladen ist, wird die HTTP-01-Challenge für `kronshagen.hopto.org` nicht vom RezeptShare-Siteblock bedient. Port 8443 bleibt derzeit geschlossen; IPv6-DNS fehlt. Caddys TLS-ALPN-Challenge benötigt Port 443, der hier von der FRITZ!Box belegt ist. Der sichere Ablauf nach deiner ausdrücklichen Freigabe: gesicherte aktive Konfiguration mit dem Zertifikatsvorbereitungsblock ergänzen und reloaden, ACME-Ausstellung abwarten, öffentliches Zertifikat einschließlich Kette ohne `-k` und IPv4/IPv6-Verhalten prüfen. Bei unerwartetem AAAA/IPv6-Ziel oder ungeschütztem Pfad sofort stoppen. Caddy erneuert sein Zertifikat automatisch, solange die HTTP-01-Erreichbarkeit über Port 80 erhalten bleibt. Bis dahin sind weder KI-Route noch öffentliches Zertifikat aktiviert.

## Supabase-Edge-Function-Modus

Beide Functions verlangen weiterhin gültiges RezeptShare-JWT und ein aktives Profil. Der Mac-Zugang braucht zusätzlich HTTPS und `RECIPE_ASSISTANT_API_KEY`.

- `RECIPE_ASSISTANT_ACCESS_MODE=cloudflare` (Standard): bestehender Modus, zusätzlich beide Cloudflare Access Service-Token-Secrets erforderlich.
- `RECIPE_ASSISTANT_ACCESS_MODE=caddy`: kein Cloudflare-Token; weiterhin zwingend HTTPS und Backend-Bearer. Unbekannte Modi, fehlender Schlüssel oder unsicherer Upstream führen geschlossen zu `503`.

Serverseitige Secret-Namen: `RECIPE_ASSISTANT_ACCESS_MODE`, `RECIPE_ASSISTANT_UPSTREAM`, `RECIPE_ASSISTANT_API_KEY`; optional für Status `KI_PROGRESS_UPSTREAM`. Im Caddy-Modus sind vorgesehen `https://kronshagen.hopto.org:8443` und `https://kronshagen.hopto.org:8443/v1/recipe-progress/`. Diese Secrets wurden nicht eingerichtet. Keine Werte gehören in Browserdateien oder Git.

## Validierung und Inbetriebnahme

Syntax des Kandidaten erst gegen die zusammengeführte Kopie der vorhandenen Caddyfile validieren; niemals eine zweite Caddy-Instanz starten. Die aktive Datei darf nur nach gesonderter Freigabe ersetzt/neu geladen werden. Die Rezept-KI-Route erst nach geprüftem Zertifikat, bestätigtem Port-/Routerziel, geprüfter Zugriffskontrolle, Rate Limit und expliziter Veröffentlichungsfreigabe aktivieren.

Nach Freigabe mindestens testen: falscher/fehlender Backend-Bearer `401`, gültiger Bearer funktioniert lokal; externe Edge-Verbindung nur via Supabase-JWT plus Server-Bearer; unerlaubte Pfade/Methoden `404`; UUID-Fortschritt; TLS-Zertifikatprüfung; OpenWebUI unverändert erreichbar. Keine externen Tests mit Geheimniswerten oder Rezept-PII protokollieren.

## Start, Health und Fehlerfall

```bash
npm run health:mac-studio
```

Bei Störung zuerst `launchctl print gui/$(id -u)/de.franke.recipe-api`, danach Healthcheck und `~/Library/Logs/RezeptShare/recipe-api.log` prüfen. Keine Qdrant-Neuindizierung als Fehlerbehebung durchführen.

## Schlüsselrotation

`python3 mac-studio/manage_api_token.py --rotate --copy-to-clipboard` rotiert den lokalen Schlüssel. Im Wartungsfenster muss derselbe neue Wert als `RECIPE_ASSISTANT_API_KEY` ausschließlich serverseitig in den zwei autorisierten Supabase-Functions gesetzt werden. Function-Releases/Secrets bedürfen separater Freigabe. Danach Zwischenablage leeren und die Verbindung mit einem Testkonto prüfen. Ein gemeinsamer Backend-Schlüssel ist kein per-user Limit; das KI-Assistant-Limit wird separat durch die additive Supabase-Migration auf 20 reservierte Anfragen je Benutzer und UTC-Tag sowie höchstens eine aktive Anfrage begrenzt. JWT-/Profilprüfung bleibt unerlässlich.
