from app.core.config import settings
from app.services.ai.base import BaseAIProvider
from app.services.ai.mock_provider import MockAIProvider


def get_ai_provider() -> BaseAIProvider:
    """
    Factory function returning the configured AI provider.
    Enables swapping between Ollama, Mock (for fast testing), and future cloud providers.
    """
    provider_name = (settings.AI_PROVIDER or "ollama").lower()

    if provider_name == "mock":
        return MockAIProvider()

    # Default to OllamaProvider
    from app.services.ai.ollama_service import OllamaProvider
    return OllamaProvider()
