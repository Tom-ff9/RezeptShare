# Mac-Studio-Rezept-API

Diese lokale Betriebsdokumentation beschreibt die FastAPI auf Loopback sowie die vorbereitete Caddy/DynDNS-Anbindung. Die bestehenden Ollama-Modelle und Qdrant-Collection werden nicht verändert.

## Lokaler Dienst

FastAPI läuft über den LaunchAgent `de.franke.recipe-api` auf `127.0.0.1:8000`. Ollama und Qdrant werden nicht durch den öffentlichen Reverse Proxy geroutet. Der LaunchAgent verwendet den Wrapper `run_recipe_api.py`, startet keine zweite Instanz und rotiert begrenzte Logs. Der Healthcheck `npm run health:mac-studio` prüft lokal FastAPI, Ollama und Qdrant; Anfrageinhalte und Token werden nicht protokolliert.

Der Backend-Bearer liegt ausschließlich in `~/Library/Application Support/RezeptShare/recipe-api-token` (Verzeichnis `0700`, Datei `0600`). Das Secret wird nie ausgegeben oder in Prozessargumenten übergeben. Die API prüft den Bearer konstantzeitlich. `/docs`, `/redoc` und `/openapi.json` sind deaktiviert.

## Caddy und DynDNS: aktueller Stand

Die einzige aktive Caddy-Website ist `ai.intern.franke` mit `tls internal` und Reverse Proxy zu OpenWebUI `127.0.0.1:3000`. Beide Homebrew-Caddyfile-Pfade verweisen auf `/Users/afranke/ai-stack/caddy/Caddyfile`. Es wurde kein Caddy-Reload und keine Änderung an dieser aktiven Datei vorgenommen.

`kronshagen.hopto.org` löste auf und Port 443 lieferte eine FRITZ!Box-Startseite. Das Zertifikat ist selbstsigniert, trägt FritzBox-/Heimnetz-SANs und wird nicht vertraut. Im Caddy-Zertifikatsspeicher gibt es nur `ai.intern.franke` mit internem Zertifikat. Port 80 und Port 57001 waren extern nicht erreichbar. Die macOS Application Firewall war deaktiviert. Die FRITZ!Box soll auf 443 unverändert bleiben; der Vorschlag nutzt deshalb `https://kronshagen.hopto.org:8443`.

Der lokale Kandidat `Caddyfile.rezeptshare.example` und das bestehende Caddyfile wurden beide mit der installierten Caddy-Version validiert. Es erfolgte kein Reload. Nach Aktivierung würde Caddy sein öffentliches ACME-Zertifikat verwalten und erneuern. Dafür sind eingehend TCP 80→Caddy:80 für HTTP-01/Erneuerung sowie TCP 8443→Caddy:8443 erforderlich; beide Routerfreigaben sind noch nicht eingerichtet oder genehmigt. Der Entwurf routet ausschließlich:

- `POST /v1/chat/completions` an `127.0.0.1:8000`, Requestlimit 50 KB, Upstream-Header-Timeout 80 s.
- `GET /v1/recipe-progress/{UUID}` an `127.0.0.1:8000`, Upstream-Header-Timeout 4 s.
- alle anderen Pfade/Methoden an `404`.

FastAPI bleibt die zwingende zweite Schutzschicht mit Bearer-Authentifizierung. Caddy reicht den Authorization-Header nur durch und protokolliert ihn nicht. Caddy besitzt kein installiertes Rate-Limit-Modul. Die Edge Function ist jetzt auf eine DB-basierte Migration vorbereitet, die 20 Reservierungen pro Nutzer/UTC-Tag und einen aktiven Request pro Nutzer erzwingt. Diese Quote greift erst nach Schemaabgleich, Migration und Function-Deployment; bis dahin darf die KI-Route nicht veröffentlicht werden. Zusätzlich begrenzt die Edge Function Bodygröße, Chatverlauf und Wartezeit.

Vor einer Freigabe muss eine gültige öffentliche TLS-Kette für `kronshagen.hopto.org:8443` im Browser/mit Zertifikatsprüfung funktionieren. Caddy kann bei aktiviertem öffentlichen Hostnamen automatische HTTPS-Zertifikate verwalten, aber erst nach bestätigter DNS-/Routerkonfiguration und erfolgreicher ACME-Erreichbarkeit. HTTP-01 benötigt eingehend Port 80; Caddys TLS-ALPN-Challenge benötigt 443, der hier von der FRITZ!Box belegt ist. Daher ist die vorbereitete Variante TCP 80→Caddy:80 sowie TCP 8443→Caddy:8443; Port 443 bleibt unverändert. Die derzeitigen öffentlichen Prüfungen zeigen noch keine Erreichbarkeit auf 80 oder 8443. Der sichere Ablauf: Routerregel nur nach Freigabe einrichten, Caddy-Block in die bestehende Datei integrieren, validieren, kontrolliert reloaden, die öffentliche Kette ohne `-k` prüfen, und erst danach die KI-Route separat freigeben. Caddy erneuert sein Zertifikat automatisch, solange die ACME-Erreichbarkeit erhalten bleibt. Keine Routerregel und kein Zertifikat wurden eingerichtet/beantragt.

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
