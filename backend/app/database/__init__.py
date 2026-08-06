"""Firestore + Firebase Storage data access for Career Copilot.

Structured documents: Cloud Firestore collections via FirestoreClient.
Binary objects (resumes, avatars, media): Firebase Storage via ObjectStorage.
There is no local SQL/SQLite database in the product path.
"""

from app.database.client import (
    FirestoreClient,
    ObjectStorage,
    database_client,
    database_probe,
    firebase_admin_app,
)

__all__ = [
    "FirestoreClient",
    "ObjectStorage",
    "database_client",
    "database_probe",
    "firebase_admin_app",
]
