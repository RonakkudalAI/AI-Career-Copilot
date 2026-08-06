import unittest
from types import SimpleNamespace

from app.core.config import Settings
from app.database.client import MemoryStorageObject, ObjectStorage
from app.features.profile.avatars import attach_avatar_url


class AvatarStorageTests(unittest.TestCase):
    def setUp(self) -> None:
        # APP_ENV=test selects the in-memory object store (no local disk, no network).
        # Explicit empty provider keys so host .env NVIDIA_API_KEY / GROQ_API_KEY
        # cannot pair with blank model names and fail Settings validation.
        self.settings = Settings(
            app_name="Test",
            app_env="test",
            api_v1_prefix="/api/v1",
            public_api_base_url="http://localhost:8000",
            log_level="ERROR",
            frontend_origins=["http://localhost:3000"],
            auth_secret="test-secret-for-avatar-storage-tests",
            firebase_storage_bucket="test-project.appspot.com",
            document_bucket="candidate-documents",
            avatar_bucket="test-avatars",
            nvidia_api_key="",
            nvidia_base_url="https://example.invalid",
            nvidia_model="",
            nvidia_prompt_version="v1",
            groq_api_key="",
            groq_base_url="https://example.invalid",
            groq_model="",
            llm_provider="groq",
        )
        MemoryStorageObject._STORE.clear()
        self.client = SimpleNamespace(storage=ObjectStorage(self.settings))

    def tearDown(self) -> None:
        MemoryStorageObject._STORE.clear()

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
