# Echte Fortschrittsanzeige fuer RezeptShare KI

Status: **Frontend und Supabase-Quellcode vorbereitet.** Der Kanal zeigt erst nach
Installation der Python-Erweiterung, der Nginx-Route und dem Edge-Deployment
echte Mac-Studio-Phasen. Bis dahin bleibt die bisherige Ladeanzeige intakt.

## Architektur

1. RezeptShare fragt die Supabase-Edge-Function `ki-fortschritt` mit dem
   bereits vorhandenen Access-Token von Supabase-Projekt A ab.
2. Die Function verifiziert den Benutzer bei Projekt A und fragt ueber den
   vorhandenen HTTPS-Reverse-Proxy einen kurzlebigen Status auf dem Mac Studio ab.
3. Die Python-API liefert nur Phase und Trefferanzahl, keine Fragen,
   Rezeptinhalte oder persoenlichen Daten.
4. Erst wenn der Statuskanal erfolgreich erreichbar ist, fuegt der Browser
   eine zufaellige UUID-Markierung an die ausgehende KI-Anfrage an.
   Die Python-API entfernt diese Kennung vor der Rezeptanalyse.
5. Bei einem Fehler im Statuskanal bleibt der KI-Chat betriebsfaehig.

## Einmalige Einrichtung am Mac Studio

### 1. Python-API sicher ergaenzen

Die im Chat bereitgestellte Datei `recipe_progress_patch.py` als
`~/Downloads/recipe_progress_patch.py` speichern.

```bash
cd ~/ai-stack/recipe-rag
python3 ~/Downloads/recipe_progress_patch.py recipe_api.py
python3 -m py_compile recipe_api_mit_fortschritt.py
cp recipe_api.py recipe_api.py.bak
cp recipe_api_mit_fortschritt.py recipe_api.py
```

Das Patchskript erstellt *keine* Ueberschreibung der Originaldatei.
Wenn eine Versionsabweichung erkannt wird, bricht es sicher ab.
Danach die bereits laufende uvicorn-Instanz regulär neu starten.

Pruefung auf dem Mac:
```bash
curl -s http://127.0.0.1:8001/v1/recipe-progress/11111111-1111-4111-8111-111111111111
```
Erwartung: `{"phase":"waiting","label":"Anfrage wird vorbereitet"}`.

### 2. Die Nginx-Route in den existierenden HTTPS-Server einfuegen

Die Konfiguration **zuerst anzeigen**:
```bash
docker exec ki-proxy nginx -T 2>&1 | grep -n -E 'server_name|listen|proxy_pass|configuration file'
```

In den passenden TLS-`server { ... }`-Block fuer Port 57001 kommt
folgender *zusätzlicher* Location-Block:

```nginx
location ^~ /recipe-progress/ {
    proxy_pass http://host.docker.internal:8001/v1/recipe-progress/;
    proxy_set_header Host $host;
    proxy_read_timeout 10s;
    add_header Cache-Control "no-store" always;
}
```

Das ist ein kleines Status-Endpoint ohne personenbezogene Daten. Die UUID
ist zufaellig und wird serverseitig nach 15 Minuten geloescht. Vor jeder
Verteilung an den angemeldeten Browser prueft die Edge-Function die
RezeptShare-Anmeldung.

**WICHTIG:** Bitte keine bestehende Nginx-Konfiguration blind ersetzen.
Ob sie als Docker-Volume gemountet ist, muss aus der aktuellen
Containerkonfiguration festgestellt werden. Nach sicherer Aenderung
`nginx -t` ausfuehren und erst dann `nginx -s reload`.

### 3. Neue Supabase-Edge-Function veroeffentlichen

Die Function ist im eigenen Fork unter
`supabase/functions/ki-fortschritt/index.ts` enthalten.
Sie ist bewusst getrennt von der vorhandenen `ki-assistent`-Function.

Aus dem RezeptShare-Verzeichnis:
```bash
supabase functions deploy ki-fortschritt --project-ref pwrrqwojvjoyclfmebnl --no-verify-jwt
```

`--no-verify-jwt` ist notwendig, weil der eingeloggte Benutzer ein
JWT von Projekt A und nicht vom Edge-Projekt B besitzt. Die Function
prueft das Token **selbst** bei Projekt A, bevor sie einen Status abruft.

Die Origin-Freigabe erlaubt die beiden GitHub-Pages-Domains und
die lokalen Entwicklungsadressen; nicht beliebige Websites.

### 4. Test

```bash
cd ~/ai-stack/recipe-rag/RezeptShare-KI
git pull --ff-only
npm run check && npm test && npm run build
PORT=3001 npm start
```

Im Browser unter `http://localhost:3001` eine neue KI-Frage stellen.
Reale Phasen:
`received` -> `planning` -> `embedding` -> `searching` ->
`filtering` -> `found` -> `generating` -> `done`.

Es gibt weiterhin bewusst **keine Prozentwerte**: Anzahl und Dauer der
Ollama-Generierung sind nicht exakt vorhersehbar.

## Voraussetzungen und Grenzen

- Die aktuelle lokale `recipe_api.py` muss zu der zuvor bereitgestellten
  Version passen. Nicht unbesehen andere/neue lokale Aenderungen ueberschreiben.
- Ein FastAPI-Prozess auf Port 8001 und die vorhandenen Docker-Dienste
  muessen laufen.
- Open WebUI muss den Inhalt der letzten Benutzernachricht unveraendert
  bis an die Python-API weiterreichen. Das muss im Praxistest bestaetigt werden.
- Die Statusmeldungen verwenden Prozessspeicher. Bei mehreren uvicorn-Workern
  liegen die Statusdaten nicht automatisch gemeinsam vor. Aktuell einen
  Worker verwenden.
- Dieses Feature aendert weder Tabellen noch Richtlinien in Supabase-Projekt A.
