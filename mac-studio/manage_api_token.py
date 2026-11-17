#!/usr/bin/env python3
"""Create/rotate the Mac-only service bearer token without printing it."""
import argparse
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile

DEFAULT_PATH = Path.home() / "Library/Application Support/RezeptShare/recipe-api-token"


def provision(path: Path, *, rotate: bool = False, copy_to_clipboard: bool = False) -> None:
    path = path.expanduser()
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(path.parent, 0o700)
    if path.exists() and not rotate:
        raise FileExistsError("Ein API-Token existiert bereits. Für Wechsel ausdrücklich --rotate setzen.")

    token = secrets.token_urlsafe(48)
    fd, tmp_name = tempfile.mkstemp(prefix=".recipe-api-token-", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(token + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp_name, path)
        os.chmod(path, 0o600)
    except Exception:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise

    if copy_to_clipboard:
        if sys.platform != "darwin":
            raise RuntimeError("Zwischenablage ist nur auf macOS verfügbar.")
        subprocess.run(["/usr/bin/pbcopy"], input=token, text=True, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", type=Path, default=DEFAULT_PATH, help=argparse.SUPPRESS)
    parser.add_argument("--rotate", action="store_true", help="Vorhandenen Token ersetzen")
    parser.add_argument("--copy-to-clipboard", action="store_true",
                        help="Neuen Token ohne Ausgabe in die Zwischenablage kopieren")
    args = parser.parse_args()
    try:
        provision(args.path, rotate=args.rotate, copy_to_clipboard=args.copy_to_clipboard)
    except Exception as exc:
        print(f"API-Token konnte nicht sicher eingerichtet werden: {exc}", file=sys.stderr)
        return 1
    print("API-Token geschützt gespeichert; der Wert wurde nicht ausgegeben.")
    if args.copy_to_clipboard:
        print("Token wurde in die Zwischenablage kopiert. Nur als Supabase-Secret eintragen.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
