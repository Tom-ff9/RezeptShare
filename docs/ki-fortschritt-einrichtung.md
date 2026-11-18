# Geschützter KI-Fortschritt im separaten Testprojekt

Die bestehende Frontend-Funktion bleibt erhalten: animierte Warteanzeige, vergangene Zeit, optionale bestätigte Backend-Phasen und Trefferanzahl. Ohne Statuskanal funktioniert die eigentliche KI-Anfrage weiter. Es werden keine erfundenen Prozentwerte angezeigt.

Die Integration verwendet ausschließlich das neue Testprojekt. Die früher fest eingetragenen Projektadressen und Backend-Adressen wurden entfernt. Keine vorhandenen Python-, Docker-, Nginx- oder Supabase-Dienste ändern.

## Konfiguration nach Freigabe

- `konfiguration.lokal.js`: `kiUrl`, `kiProgressUrl` und `kiPublishableKey` bleiben leer. Der geschützte Live-Testserver ergänzt runtime-only lokale Routen `/__local/ki-assistent` und `/__local/ki-fortschritt`; JWT und Publishable Key werden gegen das bestätigte Testprojekt geprüft, danach geht die Anfrage an `127.0.0.1:8000`.
- `ki-fortschritt` authentifiziert über `_shared/http.ts` gegen das eigene Testprojekt und prüft den aktiven Profilstatus. Keine Fremdprojekt-JWTs oder alten Projekt-Keys verwenden.
- `KI_PROGRESS_UPSTREAM` ist ein optionales serverseitiges Secret für die spätere Edge-Function-Variante. Im lokalen Test wird es nicht gebraucht; der Loopback-Adapter fragt direkt den authentifizierten Browserstatuspfad ab. Kein öffentlicher Tunnel oder Port ist aktiviert.
- CORS erlaubt `nordlicht78.github.io` und die lokalen Entwicklungsports 3000, 3001, 3188. Kein Zugriff für das ursprüngliche GitHub-Projekt.

## Backend-Protokoll

Der Browser prüft mit einer zufälligen UUID, ob der optionale Kanal `{"phase":"waiting"}` liefert. Erst dann hängt er `[REZEPT_PROGRESS_ID:UUID]` an die letzte Chatnachricht an und fragt den Status während der Verarbeitung ab. Das Testbackend muss diese Kennung vor der Rezeptanalyse entfernen.

Phasen: `received`, `planning`, `embedding`, `searching`, `filtering`, `found`, `generating`, `done`, `error`. Optional: `recipe_count` als Ganzzahl zwischen 0 und 100. Die Edge Function gibt ausschließlich Phase und Anzahl zurück, keine Fragen, Tokens oder Rezepte. Bei Ausfall wird das Polling beendet und die Rezeptanfrage bleibt unabhängig davon aktiv.

## Fehlender Backend-Quellcode

Der aktuelle Fork enthält den Browserclient und `ki-fortschritt`, aber **keine** Edge Function `ki-assistent` und **keinen** Python-/Ollama-/Qdrant-Server. Diese Ressourcen können aus dem Repository allein nicht identisch neu bereitgestellt werden. Eine echte Testkonfiguration erfordert deren bestätigten Quellcode bzw. einen isolierten Testdienst mit demselben Nachrichtenprotokoll. Keine bestehende produktive Dienstadresse ersatzweise eintragen.

Die lokale Demo (`npm run demo`) simuliert beide Endpunkte ohne externe Verbindungen. Ein kombinierter Browsertest prüft Chat, Statuskennung, Rezeptkarten, Portionen, Kochbuchimport, Formularkonflikte, Speicherung und Abmeldung. Weitere Einrichtung ausschließlich nach [README-TESTUMGEBUNG.md](../README-TESTUMGEBUNG.md).
