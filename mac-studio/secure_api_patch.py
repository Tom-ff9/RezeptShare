#!/usr/bin/env python3
"""Apply the reviewed bearer-auth patch to the local Mac-Studio recipe_api.py."""
from pathlib import Path
import shutil
import tempfile

DEFAULT_SOURCE = Path.home() / "ai-stack/recipe-rag/recipe_api.py"
MARKER = "API_TOKEN_DEFAULT = Path.home()"


def replace_once(source: str, old: str, new: str) -> str:
    count = source.count(old)
    if count != 1:
        raise ValueError(f"Unerwartete recipe_api.py-Version: Anker kommt {count}-mal vor.")
    return source.replace(old, new, 1)


def transform(source: str) -> str:
    if MARKER in source:
        raise ValueError("recipe_api.py scheint bereits angepasst; keine Änderung vorgenommen.")
    source = replace_once(source, "from fastapi import FastAPI, HTTPException\n", "from fastapi import FastAPI, HTTPException, Depends, Header\n")
    source = replace_once(source, "from pydantic import BaseModel\n", "from pydantic import BaseModel, Field\n")
    source = replace_once(source, "import uuid\n", "import uuid\nimport hmac\nimport os\nimport stat\nfrom pathlib import Path\nimport re\n")
    source = replace_once(source, "import re\nfrom qdrant_client import QdrantClient", "from qdrant_client import QdrantClient")
    source = replace_once(source, 'title="Recipe RAG API"', 'title="Recipe RAG API", docs_url=None, redoc_url=None, openapi_url=None')
    source = replace_once(source, "\n\n# ============================================================\n# OPENAI-COMPATIBLE REQUEST MODELS", '''

API_TOKEN_DEFAULT = Path.home() / "Library/Application Support/RezeptShare/recipe-api-token"
API_TOKEN_MIN_BYTES = 32


def read_api_token() -> str | None:
    """Read a private local token file; never include its value in errors/logs."""
    token_path = Path(os.environ.get("RECIPE_API_TOKEN_FILE", str(API_TOKEN_DEFAULT))).expanduser()
    try:
        if token_path.is_symlink():
            return None
        metadata = token_path.stat()
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid() or metadata.st_mode & 0o077:
            return None
        token = token_path.read_text(encoding="utf-8").strip()
        if len(token.encode("utf-8")) < API_TOKEN_MIN_BYTES or any(ch.isspace() for ch in token):
            return None
        return token
    except (OSError, UnicodeError):
        return None


def require_backend_auth(authorization: str | None = Header(default=None)) -> None:
    expected = read_api_token()
    if expected is None:
        raise HTTPException(status_code=503, detail="Backend-Authentifizierung ist nicht konfiguriert.")
    match = re.fullmatch(r"Bearer[ \\t]+([^\\s]+)", authorization or "", flags=re.IGNORECASE)
    if not match or not hmac.compare_digest(match.group(1).encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Nicht authentifiziert.", headers={"WWW-Authenticate": "Bearer"})


# ============================================================
# OPENAI-COMPATIBLE REQUEST MODELS''')
    source = replace_once(source, "class Message(BaseModel):\n    role: str\n    content: str", "class Message(BaseModel):\n    role: str = Field(min_length=1, max_length=16)\n    content: str = Field(min_length=1, max_length=4000)")
    source = replace_once(source, "    messages: list[Message]", "    messages: list[Message] = Field(min_length=1, max_length=12)")
    source = replace_once(source, '@app.get("/v1/recipe-progress/{progress_id}")', '@app.get("/v1/recipe-progress/{progress_id}", dependencies=[Depends(require_backend_auth)])')
    source = replace_once(source, '@app.get("/v1/models")', '@app.get("/v1/models", dependencies=[Depends(require_backend_auth)])')
    source = replace_once(source, '    print("Suchplan:", json.dumps(plan, ensure_ascii=False))', '    # Query-/Zutateninhalte werden aus Datenschutzgründen nicht protokolliert.')
    source = replace_once(source, '@app.post("/v1/chat/completions")', '@app.post("/v1/chat/completions", dependencies=[Depends(require_backend_auth)])')
    source = replace_once(source, '@app.get("/health")', '@app.get("/health", dependencies=[Depends(require_backend_auth)])')
    source = replace_once(source, '''    return {
        "status": "ok",
        "collection": COLLECTION,
        "chat_model": CHAT_MODEL,
        "embedding_model": EMBED_MODEL,
    }''', '    return {"status": "ok"}')
    return source


def apply(source_path: Path) -> Path:
    source_path = source_path.expanduser().resolve(strict=True)
    original = source_path.read_text(encoding="utf-8")
    updated = transform(original)
    backup = source_path.with_name(source_path.name + ".before-cloudflare-auth.bak")
    if backup.exists():
        raise FileExistsError("Sicherungsdatei existiert bereits; Abbruch ohne Überschreiben.")
    shutil.copy2(source_path, backup)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=source_path.parent,
                                     prefix=".recipe-api-", delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(updated)
        stream.flush()
    shutil.copystat(source_path, temporary)
    temporary.replace(source_path)
    return backup


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args()
    backup = apply(args.source)
    print(f"API-Authentifizierung ergänzt. Vorherige Fassung gesichert: {backup}")
