import tempfile
import unittest
from types import SimpleNamespace

from app.core.config import Settings
from app.db.client import LocalStorage
from app.profiles.avatars import attach_avatar_url


class AvatarStorageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.settings = Settings(
            local_storage_dir=self.temp_dir.name,
            avatar_bucket="test-avatars",
        )
        self.client = SimpleNamespace(storage=LocalStorage(self.settings))

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_missing_avatar_file_is_not_exposed_to_the_browser(self) -> None:
        profile = {"id": "candidate-1", "avatar_path": "candidate-1/avatars/missing.jpg"}

        enriched = attach_avatar_url(profile, self.client, self.settings)

        self.assertIsNotNone(enriched)
        self.assertIsNone(enriched["avatar_path"])
        self.assertIsNone(enriched["avatar_url"])

    def test_existing_avatar_file_receives_same_origin_url(self) -> None:
        avatar_path = "candidate-1/avatars/avatar.jpg"
        self.client.storage.from_(self.settings.avatar_bucket).upload(avatar_path, b"image-bytes")

        enriched = attach_avatar_url(
            {"id": "candidate-1", "avatar_path": avatar_path},
            self.client,
            self.settings,
        )

        self.assertIsNotNone(enriched)
        self.assertEqual(enriched["avatar_path"], avatar_path)
        self.assertEqual(
            enriched["avatar_url"],
            "/api/files/test-avatars/candidate-1/avatars/avatar.jpg",
        )


if __name__ == "__main__":
    unittest.main()
