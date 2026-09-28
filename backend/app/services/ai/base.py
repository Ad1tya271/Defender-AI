from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class FindingExplanation(BaseModel):
    root_cause: str = Field(description="Technical root cause of the vulnerability")
    attack_vector: str = Field(description="How an attacker could exploit the vulnerability")
    impact: str = Field(description="Potential security impact")
    recommendation: str = Field(description="Recommended way to fix the vulnerability")


class RemediationSuggestion(BaseModel):
    explanation: str = Field(description="Explanation of the recommended remediation")
    patch: str = Field(description="Validated unified diff patch")


class BaseAIProvider(ABC):
    """
    Abstract AI Provider interface for DefenderAI.
    Decouples the security analysis and patch generation pipeline from specific
    inference engines (Ollama, cloud LLMs, or mock providers for testing).
    """

    @abstractmethod
    def explain_finding(
        self,
        finding: Any,
        code_snippet: str,
    ) -> FindingExplanation:
        """Analyze a finding and code snippet to explain root cause, attack vector, and fix."""
        pass

    @abstractmethod
    def suggest_remediation(
        self,
        finding: Any,
        code_snippet: str,
    ) -> RemediationSuggestion:
        """Generate a validated unified diff patch and explanation for a finding."""
        pass

    @abstractmethod
    def check_availability(self) -> Dict[str, Any]:
        """Check if the inference engine is reachable and the configured model is ready."""
        pass


def sanitize_untrusted_input(content: str) -> str:
    """
    Wraps untrusted code and file content in boundary delimiters with anti-prompt-injection
    guardrails so that instructions contained inside scanned files are not executed by the LLM.
    """
    if not content:
        return ""
    # Strip any accidental triple-quote injections or system-level directives
    sanitized = content.replace("```system", "'''system").replace("```assistant", "'''assistant")
    return f"<UNTRUSTED_SOURCE_SNIPPET>\n{sanitized}\n</UNTRUSTED_SOURCE_SNIPPET>"
