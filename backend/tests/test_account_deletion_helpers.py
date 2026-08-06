from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

from app.features.auth.account_deletion import (
    CONFIRM_PHRASE,
    USER_OWNED_TABLES,
    confirmation_is_valid,
    delete_user_owned_records,
    email_matches_account,
)


def test_confirmation_phrase_exact():
    assert confirmation_is_valid(CONFIRM_PHRASE)
    assert not confirmation_is_valid("delete my account")
    assert not confirmation_is_valid("")


def test_email_match_requires_non_empty():
    assert not email_matches_account(None, "a@b.com")
    assert not email_matches_account("", "a@b.com")
    assert not email_matches_account("x@y.com", "a@b.com")
    assert email_matches_account("A@B.com", "a@b.com")


def test_delete_user_owned_records_walks_tables():
    client = MagicMock()
    delete_result = MagicMock()
    delete_result.data = [{"id": "1"}]
    client.table.return_value.delete.return_value.eq.return_value.execute.return_value = delete_result
    user = SimpleNamespace(id="user-1")
    counts = delete_user_owned_records(client, user)  # type: ignore[arg-type]
    assert "profiles" in counts
    assert len(USER_OWNED_TABLES) >= 10
    assert client.table.call_count >= len(USER_OWNED_TABLES)
