#!/usr/bin/env python3
"""Authenticated local-only smoke test; uses Ollama/Qdrant read-only, never OpenAI."""
from pathlib import Path
import re
import sys
import uuid

import requests

SOURCE_ROOT = Path.home() / "ai-stack/recipe-rag"
sys.path.insert(0, str(SOURCE_ROOT))
import recipe_api  # noqa: E402

BASE = "http://127.0.0.1:8000"
TOKEN = recipe_api.read_api_token()
if TOKEN is None:
    raise SystemExit("FEHLER: lokales API-Tokenfile fehlt oder ist unsicher.")


def metadata():
    response = requests.get("http://127.0.0.1:6333/collections/recipes", timeout=5)
    response.raise_for_status()
    result = response.json()["result"]
    return (result.get("points_count"), result.get("indexed_vectors_count"), result.get("status"))


if requests.get(BASE + "/health", timeout=5).status_code != 401:
    raise SystemExit("FEHLER: nicht authentifizierter Healthzugriff wurde nicht abgelehnt.")
if requests.get(BASE + "/health", headers={"Authorization": "Bearer synthetic-wrong-token"}, timeout=5).status_code != 401:
    raise SystemExit("FEHLER: falscher API-Bearer wurde nicht abgelehnt.")
health = requests.get(BASE + "/health", headers={"Authorization": f"Bearer {TOKEN}"}, timeout=5)
if health.status_code != 200 or health.json() != {"status": "ok"}:
    raise SystemExit("FEHLER: authentifizierter lokaler Healthcheck ist fehlgeschlagen.")

before = metadata()
progress_id = str(uuid.uuid4())
question = "Finde ein passendes Kartoffelrezept aus der vorhandenen Sammlung und nenne den Rezepttitel sowie die belegte Quelle."
question += f"\n[REZEPT_PROGRESS_ID:{progress_id}]"
response = requests.post(BASE + "/v1/chat/completions", headers={"Authorization": f"Bearer {TOKEN}"},
                         json={"model": "recipe-assistant", "messages": [{"role": "user", "content": question}], "stream": False},
                         timeout=240)
if response.status_code != 200:
    raise SystemExit(f"FEHLER: authentifizierte lokale Rezeptanfrage antwortete mit HTTP {response.status_code}.")
answer = response.json().get("choices", [{}])[0].get("message", {}).get("content", "")
has_source = bool(re.search(r"https?://|\bQuelle(?:n)?\b|\bSource(?:s)?\b", answer, re.IGNORECASE))
if not answer.strip() or not has_source:
    raise SystemExit("FEHLER: Antwort oder nachvollziehbarer Quellenhinweis fehlt.")
progress = requests.get(BASE + f"/v1/recipe-progress/{progress_id}", headers={"Authorization": f"Bearer {TOKEN}"}, timeout=5)
if progress.status_code != 200 or "phase" not in progress.json():
    raise SystemExit("FEHLER: authentifizierter Fortschrittsvertrag ist ungültig.")
after = metadata()
if before != after:
    raise SystemExit("FEHLER: Qdrant-Collection-Metadaten änderten sich während des nur lesenden Tests.")

log = (Path.home() / "Library/Logs/RezeptShare/recipe-api.log")
if log.exists():
    content = log.read_text(encoding="utf-8", errors="replace")
    if TOKEN in content or question in content:
        raise SystemExit("FEHLER: Token oder Testanfrage tauchte in API-Logs auf.")

print("OK: unauthentifiziert=401, falscher Bearer=401, gültiger Bearer=200.")
print(f"OK: lokaler Mac-Studio-RAG-Vertrag und Quellenhinweis; Qdrant-Metadaten unverändert ({before[0]} Punkte).")
print("OK: Fortschrittsstatus authentifiziert; weder Schlüssel noch Anfrageinhalt in Logs.")
