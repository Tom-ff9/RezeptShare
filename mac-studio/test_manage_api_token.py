import os
from pathlib import Path
import tempfile
import unittest

from manage_api_token import provision


class ManageApiTokenTests(unittest.TestCase):
    def test_secure_creation_and_explicit_rotation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "secret-dir"
            target = root / "recipe-api-token"
            provision(target)
            first = target.read_text().strip()
            self.assertGreaterEqual(len(first), 60)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            self.assertEqual(root.stat().st_mode & 0o777, 0o700)
            with self.assertRaises(FileExistsError):
                provision(target)
            provision(target, rotate=True)
            self.assertNotEqual(first, target.read_text().strip())


if __name__ == "__main__":
    unittest.main()
