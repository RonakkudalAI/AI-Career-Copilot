import json

import httpx
import pytest

from app.config import Settings
from app.errors import ApiError
from app.nvidia_client import NvidiaClient

VALID = {
    "suggestions": [
        {
            "section_key": "summary",
            "source_block_id": "summary-1",
            "source_text": "Backend engineer",
            "proposed_text": "Backend engineer building reliable services",
            "reason": "Improves clarity",
            "suggestion_type": "clarity",
            "evidence_references": ["summary-1"],
        }
    ]
}


def settings(**overrides) -> Settings:
    return Settings(
        _env_file=None,
        nvidia_api_key="server-secret",
        nvidia_model="configured-model",
        nvidia_base_url="https://provider.example/v1",
        nvidia_max_retries=2,
        **overrides,
    )


@pytest.mark.asyncio
async def test_successful_structured_response():
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer server-secret"
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(VALID)}}]})

    result = await NvidiaClient(settings(), httpx.MockTransport(handler)).generate({"selected_blocks": []})
    assert result.suggestions[0].source_block_id == "summary-1"


@pytest.mark.asyncio
async def test_transient_server_error_retries_then_succeeds():
    calls = 0

    async def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls < 3:
            return httpx.Response(503)
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(VALID)}}]})

    result = await NvidiaClient(settings(), httpx.MockTransport(handler)).generate({})
    assert result.suggestions
    assert calls == 3


@pytest.mark.asyncio
async def test_authentication_failure_is_not_retried():
    calls = 0

    async def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(401)

    with pytest.raises(ApiError, match="configured correctly") as raised:
        await NvidiaClient(settings(), httpx.MockTransport(handler)).generate({})
    assert raised.value.code == "nvidia_authentication_failed"
    assert calls == 1


@pytest.mark.asyncio
async def test_malformed_json_gets_one_repair_attempt_then_fails():
    calls = 0

    async def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"choices": [{"message": {"content": "not json"}}]})

    with pytest.raises(ApiError) as raised:
        await NvidiaClient(settings(), httpx.MockTransport(handler)).generate({})
    assert raised.value.code == "invalid_provider_response"
    assert calls == 2


@pytest.mark.asyncio
async def test_timeout_obeys_retry_limit():
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ReadTimeout("timeout", request=request)

    with pytest.raises(ApiError) as raised:
        await NvidiaClient(settings(), httpx.MockTransport(handler)).generate({})
    assert raised.value.code == "nvidia_unavailable"
    assert calls == 3


@pytest.mark.asyncio
async def test_unconfigured_client_returns_honest_unavailable_state():
    client = NvidiaClient(Settings(_env_file=None))
    assert client.capability()["configured"] is False
    with pytest.raises(ApiError) as raised:
        await client.generate({})
    assert raised.value.code == "nvidia_not_configured"
