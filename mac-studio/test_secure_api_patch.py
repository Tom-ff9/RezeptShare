import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from secure_api_patch import transform


class SecureApiPatchTests(unittest.TestCase):
    def test_current_api_shape_transforms_and_is_idempotency_guarded(self):
        source = '''from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import requests
import uuid
import re
from qdrant_client import QdrantClient
app = FastAPI(title="Recipe RAG API")
qdrant = QdrantClient(host="127.0.0.1", port=6333)


# ============================================================
# OPENAI-COMPATIBLE REQUEST MODELS
# ============================================================
class Message(BaseModel):
    role: str
    content: str
class ChatRequest(BaseModel):
    model: str | None = None
    messages: list[Message]
@app.get("/v1/recipe-progress/{progress_id}")
def progress(): pass
@app.get("/v1/models")
def models(): pass
def search_recipes():
    print("Suchplan:", json.dumps(plan, ensure_ascii=False))
    return []
@app.post("/v1/chat/completions")
def chat_completion(): pass
@app.get("/health")
def health():
    return {
        "status": "ok",
        "collection": COLLECTION,
        "chat_model": CHAT_MODEL,
        "embedding_model": EMBED_MODEL,
    }
'''
        updated = transform(source)
        self.assertIn("Depends(require_backend_auth)", updated)
        self.assertIn("hmac.compare_digest", updated)
        self.assertIn('return {"status": "ok"}', updated)
        self.assertIn("docs_url=None, redoc_url=None, openapi_url=None", updated)
        self.assertNotIn('print("Suchplan:"', updated)
        compile(updated, "recipe_api.py", "exec")
        with self.assertRaises(ValueError):
            transform(updated)

    def test_refuses_unexpected_source_versions(self):
        with self.assertRaises(ValueError):
            transform("from fastapi import FastAPI, HTTPException\n")


if __name__ == "__main__":
    unittest.main()
