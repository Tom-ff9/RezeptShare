# Mac-Studio-Rezept-API

Diese lokale Betriebsdokumentation beschreibt die FastAPI auf Loopback sowie die vorbereitete Caddy/DynDNS-Anbindung. Die bestehenden Ollama-Modelle und Qdrant-Collection werden nicht verändert.

## Lokaler Dienst

FastAPI läuft über den LaunchAgent `de.franke.recipe-api` auf `127.0.0.1:8000`. Ollama und Qdrant werden nicht durch den öffentlichen Reverse Proxy geroutet. Der LaunchAgent verwendet den Wrapper `run_recipe_api.py`, startet keine zweite Instanz und rotiert begrenzte Logs. Der Healthcheck `npm run health:mac-studio` prüft lokal FastAPI, Ollama und Qdrant; Anfrageinhalte und Token werden nicht protokolliert.

Der Backend-Bearer liegt ausschließlich in `~/Library/Application Support/RezeptShare/recipe-api-token` (Verzeichnis `0700`, Datei `0600`). Das Secret wird nie ausgegeben oder in Prozessargumenten übergeben. Die API prüft den Bearer konstantzeitlich. `/docs`, `/redoc` und `/openapi.json` sind deaktiviert.

## Caddy und DynDNS: aktueller Stand

Die aktive Caddyfile bedient weiter `ai.intern.franke` mit `tls internal` und Reverse Proxy zu OpenWebUI `127.0.0.1:3000`. Ergänzt wurde nur die Zertifikatsvorbereitung für `kronshagen.hopto.org:8443`; sie hat keinen Upstream und liefert ausschließlich HTTP 503. Caddy läuft als bestehender Homebrew-Dienst; es wurde kein zweiter Prozess gestartet. Beide Homebrew-Caddyfile-Pfade verweisen auf `/Users/afranke/ai-stack/caddy/Caddyfile`.

DNS hat keinen AAAA-Eintrag; der Hostname wird über IPv4 erreicht. TCP 80 erreicht Caddy und ist für ACME HTTP-01 verfügbar. Caddy lauscht jetzt auf 8443. Die FRITZ!Box-Port-443-Konfiguration blieb unverändert. Der Legacy-Port 57001 ist extern geschlossen. Die macOS Application Firewall war deaktiviert; FastAPI, Ollama und Qdrant bleiben dennoch nur an `127.0.0.1` gebunden.

Der KI-Routenkandidat `Caddyfile.rezeptshare.example` bleibt inaktiv. Aktiv ist `Caddyfile.certificate-only.example`: expliziter Let’s-Encrypt-ACME-Issuer, TLS-ALPN deaktiviert, HTTP-01 über Port 80, und ein Catch-all-Handler mit HTTP 503. Es gibt für den neuen Host keinen `reverse_proxy`-Eintrag.

- Alle Pfade und Methoden auf `https://kronshagen.hopto.org:8443` antworten mit HTTP 503.
- Die Bearer-Header werden für diesen Host nicht gelesen, protokolliert oder weitergegeben.

Die Zertifikatsausstellung war erfolgreich. Das Zertifikat hat SAN `kronshagen.hopto.org`, ist von Let’s Encrypt (Intermediate `YE2`) ausgestellt und gilt vom 18.11.2026 bis 16.02.2027. `curl` meldet `ssl_verify_result=0`; `openssl s_client -verify_return_error` meldet `Verification: OK` / `Verify return code: 0`. Die vollständige präsentierte Kette wurde verifiziert. Caddy verwaltet das ACME-Zertifikat automatisch und erneuert es vor Ablauf. Eine direkte IPv6-Auflösung ist nicht möglich, da kein AAAA-Eintrag vorhanden ist; eine unabhängige externe Verbindung direkt zur globalen IPv6-Adresse wurde nicht verifiziert.

Nach dem Reload antwortete HTTPS mit 503 auf `/`, unbekannte Pfade, Chat-POST ohne Authorization und auf GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD am UUID-Fortschrittspfad. Chat-POST mit fehlendem, falschem und gültigem Bearer ergab ebenfalls jeweils 503. Damit ist belegt, dass kein API-Schlüssel den Sperrhandler umgehen kann. Der aktive Caddy-Block enthält keinen Upstream; FastAPI (`127.0.0.1:8000`), Ollama (`127.0.0.1:11434`) und Qdrant (`127.0.0.1:6333/6334`) sind lokal an Loopback gebunden. OpenWebUI antwortete vor und nach dem Reload lokal mit HTTP 200.

FastAPI bleibt für eine spätere KI-Route die zwingende zweite Schutzschicht mit Bearer-Authentifizierung. Die inaktive Proxyvorlage reicht den Authorization-Header an FastAPI durch, ohne ihn zu protokollieren. Der derzeit aktive 503-Host ignoriert und protokolliert den Header nicht. Caddy besitzt kein installiertes Rate-Limit-Modul. Die Edge Function ist auf eine DB-basierte Migration vorbereitet, die 20 Reservierungen pro Nutzer/UTC-Tag und einen aktiven Request pro Nutzer erzwingt. Diese Quote greift erst nach Schemaabgleich, Migration und Function-Deployment; bis dahin bleibt die KI-Route gesperrt. Zusätzlich begrenzt die Edge Function Bodygröße, Chatverlauf und Wartezeit.

Die aktive Stufe 1 dient ausschließlich dem Zertifikat. Die RezeptShare-KI bleibt gesperrt, bis eine separate Freigabe erteilt und der 503-Block ausdrücklich durch die geprüfte Proxy-Konfiguration ersetzt wird. Keine FastAPI-/Ollama-/Qdrant-Route wurde veröffentlicht; Supabase, Router, DNS, Firewall und Secrets blieben unverändert.

## Supabase-Edge-Function-Modus

Beide Functions verlangen weiterhin gültiges RezeptShare-JWT und ein aktives Profil. Der Mac-Zugang braucht zusätzlich HTTPS und `RECIPE_ASSISTANT_API_KEY`.

- `RECIPE_ASSISTANT_ACCESS_MODE=cloudflare` (Standard): bestehender Modus, zusätzlich beide Cloudflare Access Service-Token-Secrets erforderlich.
- `RECIPE_ASSISTANT_ACCESS_MODE=caddy`: kein Cloudflare-Token; weiterhin zwingend HTTPS und Backend-Bearer. Unbekannte Modi, fehlender Schlüssel oder unsicherer Upstream führen geschlossen zu `503`.

Serverseitige Secret-Namen: `RECIPE_ASSISTANT_ACCESS_MODE`, `RECIPE_ASSISTANT_UPSTREAM`, `RECIPE_ASSISTANT_API_KEY`; optional für Status `KI_PROGRESS_UPSTREAM`. Im Caddy-Modus sind vorgesehen `https://kronshagen.hopto.org:8443` und `https://kronshagen.hopto.org:8443/v1/recipe-progress/`. Diese Secrets wurden nicht eingerichtet. Keine Werte gehören in Browserdateien oder Git.

## Validierung und Inbetriebnahme

Die Caddyfile wurde gegen die zusammengeführte Konfiguration validiert, vor Änderung gesichert und der bestehende Dienst kontrolliert neu geladen. Niemals eine zweite Caddy-Instanz starten. Die Rezept-KI-Route erst nach separater ausdrücklicher Freigabe, aktiviertem Supabase-Nutzungslimit, bestätigtem Zugriffsschutz und eigenen Funktionstests aktivieren.

Nach einer späteren KI-Freigabe mindestens testen: Supabase-JWT und aktives Profil, serverseitiges Rate Limit, falscher/fehlender Backend-Bearer, erlaubte Chat-/Fortschrittspfade, unerlaubte Pfade, TLS-Zertifikatprüfung und OpenWebUI. Keine externen Tests mit Geheimniswerten oder Rezept-PII protokollieren.

## Start, Health und Fehlerfall

```bash
npm run health:mac-studio
```

Bei Störung zuerst `launchctl print gui/$(id -u)/de.franke.recipe-api`, danach Healthcheck und `~/Library/Logs/RezeptShare/recipe-api.log` prüfen. Keine Qdrant-Neuindizierung als Fehlerbehebung durchführen.

## Schlüsselrotation

`python3 mac-studio/manage_api_token.py --rotate --copy-to-clipboard` rotiert den lokalen Schlüssel. Im Wartungsfenster muss derselbe neue Wert als `RECIPE_ASSISTANT_API_KEY` ausschließlich serverseitig in den zwei autorisierten Supabase-Functions gesetzt werden. Function-Releases/Secrets bedürfen separater Freigabe. Danach Zwischenablage leeren und die Verbindung mit einem Testkonto prüfen. Ein gemeinsamer Backend-Schlüssel ist kein per-user Limit; das KI-Assistant-Limit wird separat durch die additive Supabase-Migration auf 20 reservierte Anfragen je Benutzer und UTC-Tag sowie höchstens eine aktive Anfrage begrenzt. JWT-/Profilprüfung bleibt unerlässlich.
