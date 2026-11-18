# Technische Importfälle – keine OCR-Qualitätsmessung

`npm run test:import:regression` lädt die vorhandene synthetische JPEG-Seite aus `../live-kochbuch/`, prüft ihren SHA-256 gegen `erwartung.json` und übergibt ihre tatsächlichen Bildbytes an den produktiven Importhandler. Dessen Auth-, Quota- und OpenAI-Abhängigkeiten sind vollständig gemockt. Die globale Netzwerkfunktion ist im Test gesperrt.

Die Basisantwort `mock-antwort.json` ist eine bewusst festgehaltene Antwort im tatsächlichen Importformat. `erwartung.json` beschreibt unabhängig davon Titel, Zutaten, fünf Schritte, zwei Portionen, Garzeit, fehlende Nährwerte und fehlende Gerichtsfotos. Portionen sind im aktuellen API-Vertrag kein eigenes Feld; sie werden als vorhandene Originalangabe in den Notizen geprüft.

`faelle.json` ergänzt sieben feste Antworten: reine Handschrift mit unleserlicher Stelle; Druck mit ersetzter Zuckermenge, gestrichener Milch und unsicherer Backzeit; zwei Rezepte auf einer Seite; eindeutige Fortsetzung; unsichere Fortsetzung mit getrennten Objekten; Gerichtsfoto auf einer Folgeseite; kein Rezept. Diese Fälle testen die **Verarbeitung entsprechender Daten**, nicht deren Erkennung aus Bildern. Für die Transportprüfung wird die gedruckte JPEG-Seite gegebenenfalls mehrfach übertragen. Sie wird dadurch nicht zu einer Handschrift- oder Fotoreferenz erklärt.

## Vergleichsregeln

`tests/import-vergleich.mjs` verwendet Unicode-NFKC, vereinheitlicht CR/LF und Unicode-Zeilenumbrüche, fasst Leerraum einschließlich geschützter/dünner Leerzeichen zusammen, entfernt weiche Trennzeichen/Zero-Width-Zeichen und vereinheitlicht typografische Anführungsstriche und Gedankenstriche. Der Vergleich ignoriert Groß-/Kleinschreibung. Aufzählungszeichen werden nur am Zeilenanfang entfernt. Nummerierte Zubereitungsschritte dürfen umbrochene Folgezeilen enthalten.

Titel, vollständige Zutatenfolge einschließlich Mengen und Einheiten sowie vollständige Schrittfolge und Schrittanzahl werden geprüft. Es gibt keine unscharfe Ähnlichkeitssuche, Synonymersetzung, Umrechnung oder Mengenrundung. Abweichende Dezimaldarstellungen werden im vollständigen Text nicht automatisch umgedeutet. Sechs Negativproben müssen falsche Titel/Mengen/Garzeiten, fehlende Schritte, falsche Rezeptanzahl und erfundene Nährwerte erkennen.

Zusätzlich werden Original/überarbeitet, einzelne Änderungen, Unsicherheiten, Seitenzuordnung, Fotoanzahl/Koordinaten und die Übergabe an die bestehende Formularlogik geprüft. Der Browser-Testlauf enthält einen eigenen Test mit der tatsächlichen JPEG-Datei und festen Antworten, einschließlich Komprimierung und simuliertem Speichern ohne automatischen Seitenbild-Upload.

## Spätere Qualitätstests

Echte Bild-/OCR-Qualität erfordert eigene freigegebene Druck-, Handschrift-, Korrektur-, Mehrfachrezept-, Fortsetzungs- und Fotoseiten. Modellname, Datum, Bildhash, Auflösung und Rohantwort dokumentieren; Erkennungsfehler separat erfassen. Modellantworten können variieren. Solche Aufrufe sind kein Bestandteil von `npm test`, werden nicht automatisch gestartet und benötigen eine eigene Kostenfreigabe. Die feste Mock-Antwort darf niemals als Nachweis einer echten Erkennung ausgegeben werden.
