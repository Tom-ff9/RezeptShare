#!/usr/bin/env python3
"""Start FastAPI on loopback with bounded, private logs and no secret argv/env."""
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import socket
import sys

os.umask(0o077)
SOURCE_ROOT = Path.home() / "ai-stack/recipe-rag"
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))

import recipe_api  # noqa: E402

if recipe_api.read_api_token() is None:
    print("Rezept-API startet nicht: geschützte Backend-Authentifizierung fehlt.", file=sys.stderr)
    raise SystemExit(1)

try:
    with socket.create_connection(("127.0.0.1", 8000), timeout=0.25):
        print("Rezept-API startet nicht: 127.0.0.1:8000 ist bereits belegt.", file=sys.stderr)
        raise SystemExit(1)
except (ConnectionRefusedError, TimeoutError, OSError):
    pass

LOG_DIR = Path.home() / "Library/Logs/RezeptShare"
if LOG_DIR.is_symlink():
    print("Rezept-API startet nicht: Logverzeichnis ist kein sicheres lokales Verzeichnis.", file=sys.stderr)
    raise SystemExit(1)
LOG_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
os.chmod(LOG_DIR, 0o700)
LOG_PATH = LOG_DIR / "recipe-api.log"
if LOG_PATH.is_symlink():
    print("Rezept-API startet nicht: Logdatei darf kein Symlink sein.", file=sys.stderr)
    raise SystemExit(1)
if LOG_PATH.exists():
    os.chmod(LOG_PATH, 0o600)
handler = RotatingFileHandler(LOG_PATH, maxBytes=1024 * 1024, backupCount=3, encoding="utf-8")
handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
root = logging.getLogger()
root.handlers[:] = [handler]
root.setLevel(logging.INFO)
for name in ("uvicorn", "uvicorn.error"):
    logger = logging.getLogger(name)
    logger.handlers[:] = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False

import uvicorn  # noqa: E402

uvicorn.run("recipe_api:app", host="127.0.0.1", port=8000, access_log=False, log_config=None)
