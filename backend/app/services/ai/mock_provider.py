from typing import Any, Dict
from app.services.ai.base import (
    BaseAIProvider,
    FindingExplanation,
    RemediationSuggestion,
)


class MockAIProvider(BaseAIProvider):
    """
    Deterministic Mock AI Provider for testing and offline development.
    Produces valid Pydantic responses and valid unified diff patches without
    requiring a running Ollama daemon or paid LLM API.
    """

    def __init__(self, simulate_failure: bool = False, simulate_timeout: bool = False):
        self.simulate_failure = simulate_failure
        self.simulate_timeout = simulate_timeout

    def check_availability(self) -> Dict[str, Any]:
        if self.simulate_failure:
            return {
                "reachable": False,
                "base_url": "mock://offline",
                "configured_model": "mock-model",
                "model_available": False,
                "error": "Simulated provider failure",
            }
        return {
            "reachable": True,
            "base_url": "mock://localhost",
            "configured_model": "mock-qwen2.5-coder",
            "model_available": True,
            "available_models": ["mock-qwen2.5-coder:7b"],
            "error": None,
        }

    def explain_finding(
        self,
        finding: Any,
        code_snippet: str,
    ) -> FindingExplanation:
        if self.simulate_timeout:
            raise RuntimeError("AI explanation timed out.")
        if self.simulate_failure:
            raise RuntimeError("Mock AI explanation service failure.")

        title = getattr(finding, "title", "Security Vulnerability")
        file_path = getattr(finding, "file_path", "source_file.py")

        return FindingExplanation(
            root_cause=f"Untrusted input is processed without proper sanitization in {file_path}.",
            attack_vector=f"An attacker can exploit {title} by injecting payloads into parameters.",
            impact="Unauthorized data access, data modification, or privilege escalation.",
            recommendation="Use parameterized queries or framework-level sanitization routines.",
        )

    def suggest_remediation(
        self,
        finding: Any,
        code_snippet: str,
    ) -> RemediationSuggestion:
        if self.simulate_timeout:
            raise RuntimeError("AI remediation timed out.")
        if self.simulate_failure:
            raise RuntimeError("Mock AI remediation service failure.")

        file_path = getattr(finding, "file_path", "vulnerable.py") or "vulnerable.py"
        norm_path = file_path.replace("\\", "/")

        sample_patch = (
            f"--- a/{norm_path}\n"
            f"+++ b/{norm_path}\n"
            "@@ -3,5 +3,5 @@\n"
            " def get_user(user_id):\n"
            "     conn = sqlite3.connect('app.db')\n"
            "     cursor = conn.cursor()\n"
            "-    query = 'SELECT * FROM users WHERE id = ' + user_id\n"
            "-    cursor.execute(query)\n"
            "+    query = 'SELECT * FROM users WHERE id = ?'\n"
            "+    cursor.execute(query, (user_id,))\n"
            "     return cursor.fetchone()"
        )

        return RemediationSuggestion(
            explanation="Replaced unsafe string concatenation with parameterized database query.",
            patch=sample_patch,
        )
