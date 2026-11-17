"""Offline FastAPI auth contract tests; Ollama/Qdrant and OpenAI are never called."""
import os
from pathlib import Path
import sys
import tempfile
import unittest

SOURCE_ROOT = Path.home() / "ai-stack/recipe-rag"
sys.path.insert(0, str(SOURCE_ROOT))
import recipe_api as api  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


class RecipeApiAuthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.token_file = Path(self.temp.name) / "token"
        self.token_file.write_text("synthetic-local-api-token-0123456789\n", encoding="utf-8")
        self.token_file.chmod(0o600)
        self.previous_path = os.environ.get("RECIPE_API_TOKEN_FILE")
        os.environ["RECIPE_API_TOKEN_FILE"] = str(self.token_file)
        self.original_search = api.search_recipes
        self.original_answer = api.generate_answer
        api.search_recipes = lambda question, progress_id=None: [{"title": "Kartoffelsuppe", "source_url": "https://example.invalid/rezept"}]
        api.generate_answer = lambda question, recipes: "Kartoffelsuppe\nQuelle: https://example.invalid/rezept"
        self.client = TestClient(api.app)

    def tearDown(self):
        api.search_recipes = self.original_search
        api.generate_answer = self.original_answer
        if self.previous_path is None:
            os.environ.pop("RECIPE_API_TOKEN_FILE", None)
        else:
            os.environ["RECIPE_API_TOKEN_FILE"] = self.previous_path
        self.temp.cleanup()

    def test_missing_wrong_and_valid_bearer_on_all_routes(self):
        paths = ["/health", "/v1/models", "/v1/recipe-progress/11111111-1111-4111-8111-111111111111"]
        for path in paths:
            self.assertEqual(self.client.get(path).status_code, 401)
            self.assertEqual(self.client.get(path, headers={"Authorization": "Bearer wrong-token"}).status_code, 401)
        self.assertEqual(self.client.get("/health", headers={"Authorization": "Bearer synthetic-local-api-token-0123456789"}).json(), {"status": "ok"})
        self.assertEqual(self.client.get("/v1/models", headers={"Authorization": "Bearer synthetic-local-api-token-0123456789"}).status_code, 200)
        self.assertEqual(self.client.get("/v1/recipe-progress/11111111-1111-4111-8111-111111111111", headers={"Authorization": "Bearer synthetic-local-api-token-0123456789"}).status_code, 200)
        self.assertEqual(self.client.get("/docs").status_code, 404)
        self.assertEqual(self.client.get("/openapi.json").status_code, 404)

    def test_chat_contract_preserves_sources_without_calling_models(self):
        response = self.client.post("/v1/chat/completions", headers={"Authorization": "Bearer synthetic-local-api-token-0123456789"}, json={"model": "recipe-assistant", "messages": [{"role": "user", "content": "Kartoffelsuppe"}], "stream": False})
        self.assertEqual(response.status_code, 200)
        self.assertIn("https://example.invalid/rezept", response.json()["choices"][0]["message"]["content"])
        self.assertEqual(self.client.post("/v1/chat/completions", json={"messages": [{"role": "user", "content": "Kartoffelsuppe"}]}).status_code, 401)

    def test_bad_file_permissions_fail_closed(self):
        self.token_file.chmod(0o644)
        self.assertIsNone(api.read_api_token())
        self.token_file.chmod(0o600)
        self.assertEqual(api.read_api_token(), "synthetic-local-api-token-0123456789")

    def test_missing_token_file_returns_service_unavailable(self):
        self.token_file.unlink()
        response = self.client.get("/health", headers={"Authorization": "Bearer synthetic-local-api-token-0123456789"})
        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()
