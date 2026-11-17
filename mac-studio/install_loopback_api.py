#!/usr/bin/env python3
"""Safely replace the existing recipe API LaunchAgent with the loopback-only one."""
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import time

HOME = Path.home()
REPO = Path(__file__).resolve().parents[1]
SOURCE = HOME / "ai-stack/recipe-rag"
LABEL = "de.franke.recipe-api"
DOMAIN = f"gui/{os.getuid()}"
TARGET = HOME / "Library/LaunchAgents/de.franke.recipe-api.plist"
BACKUP = HOME / "Library/LaunchAgents/de.franke.recipe-api.plist.before-cloudflare-auth.20261117"
TEMPLATE = REPO / "mac-studio/de.franke.recipe-api.loopback.plist.example"


def checked(args: list[str]) -> str:
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=15).stdout


def listening_pids(port: int) -> list[int]:
    output = subprocess.run(["/usr/sbin/lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
                            capture_output=True, text=True, timeout=10, check=False).stdout
    return [int(line) for line in output.splitlines() if line.strip().isdigit()]


def wait_port(port: int, should_listen: bool, timeout: float = 15) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if bool(listening_pids(port)) == should_listen:
            return True
        time.sleep(0.25)
    return False


def stop_expected_process(pid: int, port: int) -> None:
    args = checked(["/bin/ps", "-p", str(pid), "-o", "args="]).strip()
    expected = ("uvicorn recipe_api:app --host 127.0.0.1 --port 8000" if port == 8000
                else "uvicorn recipe_api:app --host 0.0.0.0 --port 8001")
    if expected not in args:
        raise RuntimeError(f"Port {port} wird von einem unerwarteten Prozess belegt; Abbruch ohne Stoppen.")
    os.kill(pid, signal.SIGTERM)
    if not wait_port(port, False, timeout=10):
        raise RuntimeError(f"Rezept-API-Prozess auf Port {port} beendete sich nicht rechtzeitig.")


def install_and_restart() -> None:
    if BACKUP.exists():
        raise FileExistsError(f"Sicherungsdatei existiert bereits: {BACKUP}")
    if not TARGET.is_file() or not TEMPLATE.is_file():
        raise FileNotFoundError("Vorhandener LaunchAgent oder geprüfte Vorlage fehlt.")
    token_path = HOME / "Library/Application Support/RezeptShare/recipe-api-token"
    token_info = token_path.stat()
    if token_path.is_symlink() or token_info.st_uid != os.getuid() or token_info.st_mode & 0o077:
        raise PermissionError("Lokales API-Tokenfile fehlt oder hat unsichere Rechte.")
    token = token_path.read_text(encoding="utf-8").strip()
    if len(token.encode("utf-8")) < 32 or any(ch.isspace() for ch in token):
        raise ValueError("Lokales API-Tokenfile hat ein ungültiges Format.")
    del token

    # Only these two already-inspected API processes are eligible for shutdown.
    api8001 = listening_pids(8001)
    api8000 = listening_pids(8000)
    if len(api8001) != 1 or len(api8000) != 1:
        raise RuntimeError("Erwartete eindeutige FastAPI-Prozesse auf 8001 und 8000 nicht gefunden; nichts gestoppt.")
    checked(["/usr/bin/plutil", "-lint", str(TEMPLATE)])

    shutil.copy2(TARGET, BACKUP)
    TARGET.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    shutil.copy2(TEMPLATE, TARGET)
    os.chmod(TARGET, 0o600)
    log_dir = HOME / "Library/Logs/RezeptShare"
    log_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(log_dir, 0o700)

    # Unload the old agent before stopping the separately started local copy.
    checked(["/bin/launchctl", "bootout", f"{DOMAIN}/{LABEL}"])
    if not wait_port(8001, False):
        raise RuntimeError("Alter API-Port 8001 blieb nach launchctl bootout aktiv.")
    stop_expected_process(api8000[0], 8000)
    if not wait_port(8000, False):
        raise RuntimeError("Alter API-Port 8000 blieb nach SIGTERM aktiv.")

    checked(["/bin/launchctl", "bootstrap", DOMAIN, str(TARGET)])
    if not wait_port(8000, True):
        raise RuntimeError("Neuer LaunchAgent startete nicht auf 127.0.0.1:8000; alten unsicheren Dienst nicht reaktiviert.")
    if len(listening_pids(8000)) != 1 or listening_pids(8001):
        raise RuntimeError("Unerwartete API-Prozessanzahl oder Port 8001 ist noch belegt.")
    listeners = checked(["/usr/sbin/lsof", "-nP", "-iTCP:8000", "-sTCP:LISTEN"])
    if "127.0.0.1:8000" not in listeners or "*:8000" in listeners:
        raise RuntimeError("FastAPI bindet nicht ausschließlich an 127.0.0.1:8000.")
    status = checked(["/bin/launchctl", "print", f"{DOMAIN}/{LABEL}"])
    if "state = running" not in status:
        raise RuntimeError("LaunchAgent meldet keinen erwarteten loopback-only Betrieb.")
    print("Rezept-API auf 127.0.0.1:8000 gestartet; Port 8001 ist frei.")
    print(f"Vorherige LaunchAgent-Datei gesichert: {BACKUP}")


if __name__ == "__main__":
    install_and_restart()
