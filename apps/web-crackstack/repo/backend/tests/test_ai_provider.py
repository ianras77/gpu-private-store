import pytest

from app.llm.provider import (
    OpenAICompatibleProvider,
    OpenAIProvider,
    ProviderCapabilities,
    configured_provider,
)


def test_provider_maps_model_roles_without_physical_model_in_request() -> None:
    provider = OpenAICompatibleProvider(
        base_url="https://example.test/v1",
        model_roles={"fast": "quick", "reasoning": "deep", "data": "deep"},
    )

    assert provider.model_for("fast") == "quick"
    assert provider.model_for("unknown") == "deep"


def test_capabilities_are_explicit() -> None:
    provider = OpenAICompatibleProvider(
        capabilities=ProviderCapabilities(streaming=True, tools=False, structured_json=True)
    )

    assert provider.capabilities().streaming is True
    assert provider.capabilities().tools is False
    assert provider.capabilities().structured_json is True


def test_openai_provider_has_openai_default_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AI_BASE_URL", raising=False)
    provider = OpenAIProvider(api_key="test-key")

    assert provider.base_url == "https://api.openai.com"


def test_configured_provider_rejects_unknown_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_PROVIDER", "unknown")

    with pytest.raises(ValueError, match="unsupported AI_PROVIDER"):
        configured_provider()
